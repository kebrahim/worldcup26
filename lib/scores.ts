import { createAdminClient } from "@/lib/supabase/admin";

function mapStage(stage: string): string {
  const map: Record<string, string> = {
    "GROUP_STAGE": "group",
    "LAST_32": "round_of_32",
    "LAST_16": "round_of_16",
    "QUARTER_FINALS": "quarterfinal",
    "SEMI_FINALS": "semifinal",
    "FINAL": "final",
  };
  return map[stage] ?? "group";
}

export async function syncScores(): Promise<{ error?: string; matchesUpserted?: number }> {
  const apiKey = process.env.WC2026_API_KEY;
  if (!apiKey) return { error: "WC2026_API_KEY not configured" };

  const admin = createAdminClient();

  const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
    headers: { "X-Auth-Token": apiKey },
  });

  if (!res.ok) return { error: `Failed to fetch matches: ${res.status}` };

  const { matches } = await res.json();

  const { data: teams } = await admin.from("teams").select("id, code");
  const teamCodeMap = Object.fromEntries(
    (teams ?? []).map((t: { id: number; code: string }) => [t.code, t.id])
  );

  let upserted = 0;
  for (const match of matches) {
    const homeCode = match.homeTeam?.tla;
    const awayCode = match.awayTeam?.tla;
    const homeId = teamCodeMap[homeCode];
    const awayId = teamCodeMap[awayCode];
    if (!homeId || !awayId) continue;

    const status = match.status === "FINISHED" ? "completed"
      : match.status === "IN_PLAY" || match.status === "PAUSED" ? "live"
      : "scheduled";

    const stage = mapStage(match.stage);
    const groupName = match.group ? match.group.replace("GROUP_", "") : null;

    const homeScore = match.score?.fullTime?.home ?? null;
    const awayScore = match.score?.fullTime?.away ?? null;
    const homePen = match.score?.penalties?.home ?? null;
    const awayPen = match.score?.penalties?.away ?? null;

    let winnerId: number | null = null;
    if (match.score?.winner === "HOME_TEAM") winnerId = homeId;
    else if (match.score?.winner === "AWAY_TEAM") winnerId = awayId;

    await admin.from("matches").upsert({
      id: match.id,
      stage,
      group_name: groupName,
      home_team_id: homeId,
      away_team_id: awayId,
      home_score: homeScore,
      away_score: awayScore,
      home_score_pen: homePen,
      away_score_pen: awayPen,
      winner_team_id: winnerId,
      kickoff_utc: match.utcDate,
      status,
      venue: match.venue ?? null,
    });
    upserted++;
  }

  await recalculateContestScores(admin);

  await admin.from("app_settings").upsert(
    { key: "last_sync_at", value: new Date().toISOString() },
    { onConflict: "key" }
  );

  return { matchesUpserted: upserted };
}

async function recalculateContestScores(admin: ReturnType<typeof createAdminClient>) {
  const { data: players } = await admin.from("profiles").select("id");
  if (!players) return;

  const { data: picks } = await admin
    .from("draft_picks")
    .select("user_id, team_id, draft_sessions!inner(stage)")
    .eq("draft_sessions.stage", "group_stage");

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

  const { data: knockoutTeamsData } = await admin
    .from("matches")
    .select("home_team_id, away_team_id")
    .neq("stage", "group");
  const advancedTeamIds = new Set<number>();
  for (const m of knockoutTeamsData ?? []) {
    if (m.home_team_id) advancedTeamIds.add(m.home_team_id);
    if (m.away_team_id) advancedTeamIds.add(m.away_team_id);
  }

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

  for (const pick of picks ?? []) {
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
    if (advancedTeamIds.has(pick.team_id)) scores[uid].group_advancements += 1;

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
  const groupContests = new Set(["group_goals_scored", "group_defense", "group_advancements"]);
  const groupMatchesExist = (groupMatches ?? []).length > 0;
  const knockoutMatchesExist = (knockoutMatches ?? []).length > 0;

  for (const contest of contests) {
    const hasData = groupContests.has(contest) ? groupMatchesExist : knockoutMatchesExist;
    const everyoneZero = players.every((p) => (scores[p.id]?.[contest] ?? 0) === 0);
    const allZero = !hasData || everyoneZero;
    const descending = contest !== "group_defense";
    const ranked = [...players].sort((a, b) => {
      const diff = (scores[b.id]?.[contest] ?? 0) - (scores[a.id]?.[contest] ?? 0);
      return descending ? diff : -diff;
    });

    // Assign ranks and points accounting for ties
    let i = 0;
    while (i < ranked.length) {
      const currentScore = scores[ranked[i].id]?.[contest] ?? 0;
      let j = i;
      while (j < ranked.length && (scores[ranked[j].id]?.[contest] ?? 0) === currentScore) j++;
      const rank = i + 1;
      const pts = contestPointsMap[i] ?? 1;
      for (let k = i; k < j; k++) {
        const uid = ranked[k].id;
        await admin.from("contest_scores").upsert({
          user_id: uid,
          contest,
          score: currentScore,
          rank: allZero ? null : rank,
          contest_points: allZero ? 0 : pts,
        }, { onConflict: "user_id,contest" });
      }
      i = j;
    }
  }
}
