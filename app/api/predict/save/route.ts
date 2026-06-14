import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEADLINE = new Date("2026-06-28T19:00:00Z");

type PickInput = { matchId: number; teamId: number };

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (new Date() >= DEADLINE) {
    return NextResponse.json(
      { error: "The deadline has passed. Picks are locked." },
      { status: 403 }
    );
  }

  let body: { picks: PickInput[]; totalGoals: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { picks, totalGoals } = body;

  if (!Array.isArray(picks)) {
    return NextResponse.json({ error: "picks must be an array" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Upsert bracket picks
  if (picks.length > 0) {
    const rows = picks.map((p) => ({
      user_id: user.id,
      match_id: p.matchId,
      predicted_winner_team_id: p.teamId,
    }));

    const { error: picksError } = await admin
      .from("bracket_picks")
      .upsert(rows, { onConflict: "user_id,match_id" });

    if (picksError) {
      return NextResponse.json(
        { error: picksError.message },
        { status: 500 }
      );
    }
  }

  // Upsert tiebreaker if provided
  if (totalGoals != null && !isNaN(totalGoals)) {
    const { error: tbError } = await admin
      .from("bracket_tiebreaker")
      .upsert(
        { user_id: user.id, predicted_total_goals: totalGoals },
        { onConflict: "user_id" }
      );

    if (tbError) {
      return NextResponse.json({ error: tbError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
