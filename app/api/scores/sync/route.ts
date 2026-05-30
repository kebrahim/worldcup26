import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const secret = request.headers.get("x-sync-secret");
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.WC2026_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "WC2026_API_KEY not configured" }, { status: 503 });
  }

  const admin = createAdminClient();

  const res = await fetch("https://api.wc2026api.com/matches", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch matches from WC2026 API" }, { status: 502 });
  }

  const { matches } = await res.json();

  const { data: teams } = await admin.from("teams").select("id, code");
  const teamCodeMap = Object.fromEntries((teams ?? []).map((t: { id: number; code: string }) => [t.code, t.id]));

  let upserted = 0;
  for (const match of matches) {
    const homeId = teamCodeMap[match.home_team_code];
    const awayId = teamCodeMap[match.away_team_code];
    if (!homeId || !awayId) continue;

    await admin.from("matches").upsert({
      id: match.id,
      stage: match.stage,
      group_name: match.group ?? null,
      home_team_id: homeId,
      away_team_id: awayId,
      home_score: match.home_score ?? null,
      away_score: match.away_score ?? null,
      home_score_pen: match.home_score_pen ?? null,
      away_score_pen: match.away_score_pen ?? null,
      winner_team_id: match.winner_code ? teamCodeMap[match.winner_code] : null,
      kickoff_utc: match.kickoff_utc,
      status: match.status,
      venue: match.venue ?? null,
    });
    upserted++;
  }

  await recalculateContestScores(admin);

  return NextResponse.json({ success: true, matchesUpserted: upserted });
}

async function recalculateContestScores(admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>) {
  const { data: players } = await admin.from("profiles").select("id");
  if (!players) return;

  const { data: groupPicks } = await admin
    .from("draft_picks")
    .select("user_id, team_id, draft_sessions!inner(stage)")
    .eq("draft_sessions.stage", "group_stage");

  const { data: knockoutPicks } = await admin
    .from("draft_picks")
    .select("user_id, team_id, draft_sessions!inner(stage)")
    .eq("draft_sessions.stage", "knockout");

  const { data: groupMatches } = await admin
    .from("matches")
    .select("home_team_id, away_team_id, home_score, away_score, winner_team_id, status")
    .eq("stage", "group")
    .eq("status", "completed");

  const { data: knockoutMatches } = await admin
    .from("matches")
    .select("home_team_id, away_team_id, home_score, away_score, winner_team_id, stage, status")
    .neq("stage", "group")
    .eq("status", "completed");

  const roundPoints: Record<string, number> = {
    round_of_32: 1, round_of_16: 2, quarterfinal: 3, semifinal: 4, final: 5,
  };

  const scores: Record<string, Record<string, number>> = {};
  for (const p of players) {
    scores[p.id] = {
      group_goals_scored: 0,
      group_defense: 0,
      group_advancements: 0,
      knockout_bracket: 0,
      knockout_goals: 0,
    };
  }

  for (const pick of groupPicks ?? []) {
    const uid = pick.user_id;
    if (!scores[uid]) continue;
    for (const m of groupMatches ?? []) {
      if (m.home_team_id === pick.team_id) {
        scores[uid].group_goals_scored += m.home_score ?? 0;
        scores[uid].group_defense += m.away_score ?? 0;
      } else if (m.away_team_id === pick.team_id) {
        scores[uid].group_goals_scored += m.away_score ?? 0;
        scores[uid].group_defense += m.home_score ?? 0;
      }
    }
    const advanced = (knockoutMatches ?? []).some(
      (m) => m.home_team_id === pick.team_id || m.away_team_id === pick.team_id
    );
    if (advanced) scores[uid].group_advancements += 1;
  }

  for (const pick of knockoutPicks ?? []) {
    const uid = pick.user_id;
    if (!scores[uid]) continue;
    for (const m of knockoutMatches ?? []) {
      const isHome = m.home_team_id === pick.team_id;
      const isAway = m.away_team_id === pick.team_id;
      if (!isHome && !isAway) continue;

      const pts = roundPoints[m.stage] ?? 0;
      if (m.winner_team_id === pick.team_id) {
        scores[uid].knockout_bracket += pts;
        if (m.stage === "final") scores[uid].knockout_bracket += 3;
      }
      scores[uid].knockout_goals += isHome ? (m.home_score ?? 0) : (m.away_score ?? 0);
    }
  }

  const contests = ["group_goals_scored", "group_defense", "group_advancements", "knockout_bracket", "knockout_goals"];
  const contestPointsMap = [5, 4, 3, 2, 1];

  for (const contest of contests) {
    const descending = contest !== "group_defense";
    const ranked = [...players].sort((a, b) => {
      const diff = (scores[b.id]?.[contest] ?? 0) - (scores[a.id]?.[contest] ?? 0);
      return descending ? diff : -diff;
    });

    for (let i = 0; i < ranked.length; i++) {
      const uid = ranked[i].id;
      await admin.from("contest_scores").upsert({
        user_id: uid,
        contest,
        score: scores[uid]?.[contest] ?? 0,
        rank: i + 1,
        contest_points: contestPointsMap[i] ?? 1,
      });
    }
  }
}
