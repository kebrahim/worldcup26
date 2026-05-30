import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export const revalidate = 60;

const CONTESTS = [
  { key: "group_goals_scored", label: "Group Goals", higher: true, unit: "goals" },
  { key: "group_defense", label: "Group Defense", higher: false, unit: "conceded" },
  { key: "group_advancements", label: "Advancements", higher: true, unit: "teams" },
  { key: "knockout_bracket", label: "Knockout Bracket", higher: true, unit: "pts" },
  { key: "knockout_goals", label: "Knockout Goals", higher: true, unit: "goals" },
];

export default async function TeamsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [
    { data: groupPicks },
    { data: knockoutPicks },
    { data: contestScores },
  ] = await Promise.all([
    admin
      .from("draft_picks")
      .select("team_id, teams(id, name, code, group_name, flag_emoji), draft_sessions!inner(stage)")
      .eq("user_id", user.id)
      .eq("draft_sessions.stage", "group_stage"),
    admin
      .from("draft_picks")
      .select("team_id, teams(id, name, code, group_name, flag_emoji), draft_sessions!inner(stage)")
      .eq("user_id", user.id)
      .eq("draft_sessions.stage", "knockout"),
    admin
      .from("contest_scores")
      .select("*")
      .eq("user_id", user.id),
  ]);

  const groupTeamIds = (groupPicks ?? []).map((p) => p.team_id);
  const { data: groupMatches } = groupTeamIds.length > 0
    ? await admin
        .from("matches")
        .select("home_team_id, away_team_id, home_score, away_score, status")
        .eq("stage", "group")
        .eq("status", "completed")
        .or(groupTeamIds.map((id) => `home_team_id.eq.${id},away_team_id.eq.${id}`).join(","))
    : { data: [] };

  const teamStats: Record<number, { gf: number; ga: number }> = {};
  for (const m of groupMatches ?? []) {
    if (groupTeamIds.includes(m.home_team_id)) {
      if (!teamStats[m.home_team_id]) teamStats[m.home_team_id] = { gf: 0, ga: 0 };
      teamStats[m.home_team_id].gf += m.home_score ?? 0;
      teamStats[m.home_team_id].ga += m.away_score ?? 0;
    }
    if (groupTeamIds.includes(m.away_team_id)) {
      if (!teamStats[m.away_team_id]) teamStats[m.away_team_id] = { gf: 0, ga: 0 };
      teamStats[m.away_team_id].gf += m.away_score ?? 0;
      teamStats[m.away_team_id].ga += m.home_score ?? 0;
    }
  }

  const scoreMap = Object.fromEntries((contestScores ?? []).map((cs) => [cs.contest, cs]));
  const rankColors = ["text-gold", "text-chalk/70", "text-amber-600", "text-chalk/40", "text-chalk/30"];

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <a href="/" className="text-chalk/40 hover:text-chalk text-sm mb-6 inline-block">← Home</a>
        <h1 className="text-3xl font-bold text-gold font-display uppercase tracking-wide mb-2">My Teams</h1>
        <p className="text-chalk/40 text-sm mb-8">Your roster and contest scores</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {CONTESTS.map((c) => {
            const cs = scoreMap[c.key];
            return (
              <div key={c.key} className="card text-center">
                <div className="text-chalk/40 text-xs uppercase tracking-widest mb-1">{c.label}</div>
                <div className="text-2xl font-bold font-mono text-chalk">{cs?.score ?? "—"}</div>
                <div className="text-xs text-chalk/30 mb-2">{c.unit}</div>
                {cs && (
                  <div className={`text-xs font-bold ${rankColors[(cs.rank ?? 1) - 1] ?? "text-chalk/30"}`}>
                    #{cs.rank} · +{cs.contest_points}pts
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <h2 className="text-sm uppercase tracking-widest text-chalk/50 mb-3">
          Group Stage Teams ({groupPicks?.length ?? 0}/9)
        </h2>
        {groupPicks && groupPicks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-8">
            {groupPicks.map((pick) => {
              const team = pick.teams as { id: number; name: string; code: string; group_name: string; flag_emoji: string };
              const stats = teamStats[pick.team_id] ?? { gf: 0, ga: 0 };
              return (
                <div key={pick.team_id} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">{team.flag_emoji}</span>
                    <span className="text-xs text-chalk/40 font-mono">Group {team.group_name}</span>
                  </div>
                  <div className="font-bold text-chalk">{team.name}</div>
                  <div className="text-xs text-chalk/40 font-mono mt-1">{team.code}</div>
                  <div className="flex gap-4 mt-3 text-sm font-mono">
                    <span className="text-green-400">{stats.gf} GF</span>
                    <span className="text-red-400">{stats.ga} GA</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card mb-8">
            <p className="text-chalk/30 text-sm">No group stage picks yet — draft hasn't started.</p>
          </div>
        )}

        <h2 className="text-sm uppercase tracking-widest text-chalk/50 mb-3">
          Knockout Teams ({knockoutPicks?.length ?? 0})
        </h2>
        {knockoutPicks && knockoutPicks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {knockoutPicks.map((pick) => {
              const team = pick.teams as { id: number; name: string; code: string; group_name: string; flag_emoji: string };
              return (
                <div key={pick.team_id} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">{team.flag_emoji}</span>
                    <span className="text-xs text-chalk/40 font-mono">Group {team.group_name}</span>
                  </div>
                  <div className="font-bold text-chalk">{team.name}</div>
                  <div className="text-xs text-chalk/40 font-mono mt-1">{team.code}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card">
            <p className="text-chalk/30 text-sm">No knockout picks yet — knockout draft hasn't started.</p>
          </div>
        )}
      </div>
    </main>
  );
}
