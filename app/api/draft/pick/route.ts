import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPickOwner } from "@/lib/draft";
import { sendDraftTurnEmail } from "@/lib/email";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teamId, onBehalfOf } = await request.json();
  if (!teamId) return NextResponse.json({ error: "teamId required" }, { status: 400 });

  const admin = createAdminClient();

  // Commissioners can pick on behalf of any player
  let actingAsUserId = user.id;
  if (onBehalfOf && onBehalfOf !== user.id) {
    const { data: profile } = await admin
      .from("profiles")
      .select("is_commissioner")
      .eq("id", user.id)
      .single();
    if (!profile?.is_commissioner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    actingAsUserId = onBehalfOf;
  }

  const { data: session } = await admin
    .from("draft_sessions")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!session) return NextResponse.json({ error: "No active draft session" }, { status: 404 });

  const currentUserId = getPickOwner(session.current_pick_index, session.snake_order);
  if (currentUserId !== actingAsUserId) {
    return NextResponse.json({ error: "Not your turn" }, { status: 403 });
  }

  const { data: existingPick } = await admin
    .from("draft_picks")
    .select("id")
    .eq("session_id", session.id)
    .eq("team_id", teamId)
    .single();

  if (existingPick) return NextResponse.json({ error: "Team already picked" }, { status: 409 });

  const pickNumber = session.current_pick_index + 1;
  const round = Math.ceil(pickNumber / session.snake_order.length);
  const totalPicks = 45;
  const nextPickIndex = session.current_pick_index + 1;
  const isLastPick = nextPickIndex >= totalPicks;

  const { error: pickError } = await admin.from("draft_picks").insert({
    session_id: session.id,
    user_id: actingAsUserId,
    team_id: teamId,
    round,
    pick_number: pickNumber,
  });

  if (pickError) return NextResponse.json({ error: "Failed to record pick" }, { status: 500 });

  if (isLastPick) {
    await admin
      .from("draft_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", session.id);
  } else {
    const nextRound = Math.ceil((nextPickIndex + 1) / session.snake_order.length);
    await admin
      .from("draft_sessions")
      .update({ current_pick_index: nextPickIndex, current_round: nextRound })
      .eq("id", session.id);

    const nextUserId = getPickOwner(nextPickIndex, session.snake_order);
    const { data: nextPlayer } = await admin
      .from("profiles")
      .select("email, display_name")
      .eq("id", nextUserId)
      .single();

    if (nextPlayer) {
      await sendDraftTurnEmail(nextPlayer.email, nextPlayer.display_name);
    }
  }

  return NextResponse.json({ success: true, pickNumber, isLastPick });
}
