import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { shuffleArray, getPickOwner } from "@/lib/draft";
import { sendDraftTurnEmail } from "@/lib/email";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_commissioner")
    .eq("id", user.id)
    .single();

  if (!profile?.is_commissioner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { stage } = await request.json();
  if (stage !== "group_stage") {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("draft_sessions")
    .select("id")
    .eq("stage", stage)
    .in("status", ["pending", "active"])
    .single();

  if (existing) {
    return NextResponse.json({ error: "Draft session already exists for this stage" }, { status: 409 });
  }

  const { data: players } = await admin.from("profiles").select("id, email, display_name");
  if (!players || players.length === 0) {
    return NextResponse.json({ error: "No players found" }, { status: 400 });
  }

  const snakeOrder = shuffleArray(players.map((p) => p.id));
  const totalRounds = 9;

  const { data: session, error } = await admin
    .from("draft_sessions")
    .insert({
      stage,
      status: "active",
      total_rounds: totalRounds,
      current_round: 1,
      current_pick_index: 0,
      snake_order: snakeOrder,
    })
    .select()
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }

  const firstUserId = getPickOwner(0, snakeOrder);
  const firstPlayer = players.find((p) => p.id === firstUserId);
  if (firstPlayer) {
    await sendDraftTurnEmail(firstPlayer.email, firstPlayer.display_name);
  }

  return NextResponse.json({ session });
}
