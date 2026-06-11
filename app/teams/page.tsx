import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import TeamsClient from "./TeamsClient";

export const revalidate = 60;

type TeamShape = { id: number; name: string; code: string; group_name: string; flag_emoji: string };

function extractTeam(teams: unknown): TeamShape {
  const t = Array.isArray(teams) ? teams[0] : teams;
  return t as TeamShape;
}

export default async function TeamsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [{ data: allPicks }, { data: allScores }, { data: profiles }] = await Promise.all([
    admin
      .from("draft_picks")
      .select("user_id, team_id, teams(id, name, code, group_name, flag_emoji), draft_sessions!inner(stage)")
      .eq("draft_sessions.stage", "group_stage"),
    admin.from("contest_scores").select("*"),
    admin.from("profiles").select("id, display_name").order("display_name"),
  ]);

  // Collect all unique team ids across all players to fetch match stats
  const allTeamIds = [...new Set((allPicks ?? []).map((p) => p.team_id))];
  const { data: groupMatches } = allTeamIds.length > 0
    ? await admin
        .from("matches")
        .select("home_team_id, away_team_id, home_score, away_score, status")
        .eq("stage", "group")
        .eq("status", "completed")
        .or(allTeamIds.map((id) => `home_team_id.eq.${id},away_team_id.eq.${id}`).join(","))
    : { data: [] };

  // Build global team stats
  const teamStats: Record<number, { gf: number; ga: number }> = {};
  for (const m of groupMatches ?? []) {
    if (allTeamIds.includes(m.home_team_id)) {
      if (!teamStats[m.home_team_id]) teamStats[m.home_team_id] = { gf: 0, ga: 0 };
      teamStats[m.home_team_id].gf += m.home_score ?? 0;
      teamStats[m.home_team_id].ga += m.away_score ?? 0;
    }
    if (allTeamIds.includes(m.away_team_id)) {
      if (!teamStats[m.away_team_id]) teamStats[m.away_team_id] = { gf: 0, ga: 0 };
      teamStats[m.away_team_id].gf += m.away_score ?? 0;
      teamStats[m.away_team_id].ga += m.home_score ?? 0;
    }
  }

  // Group picks and scores by player
  const players = (profiles ?? []).map((profile) => {
    const picks = (allPicks ?? [])
      .filter((p) => p.user_id === profile.id)
      .map((p) => ({ team_id: p.team_id, teams: extractTeam(p.teams) }));
    const contestScores = (allScores ?? []).filter((cs) => cs.user_id === profile.id);
    return { id: profile.id, display_name: profile.display_name, picks, contestScores, teamStats };
  });

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <a href="/" className="text-chalk/40 hover:text-chalk text-sm mb-6 inline-block">← Home</a>
        <h1 className="text-3xl font-bold text-gold font-display uppercase tracking-wide mb-2">Teams</h1>
        <p className="text-chalk/40 text-sm mb-6">Roster and contest scores by player</p>
        <TeamsClient players={players} myUserId={user.id} />
      </div>
    </main>
  );
}
