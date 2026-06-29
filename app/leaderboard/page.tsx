import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const revalidate = 60;

const CONTESTS = [
  { key: "group_goals_scored", label: "Group Goals Scored", desc: "Total goals scored in group stage", higher: true },
  { key: "group_defense", label: "Group Defense", desc: "Total goals conceded in group stage", higher: false },
  { key: "group_advancements", label: "Group Advancements", desc: "Teams that advanced to knockout", higher: true },
  { key: "knockout_bracket", label: "Knockout Bracket", desc: "Points earned per round won", higher: true },
  { key: "knockout_goals", label: "Knockout Goals", desc: "Total goals scored in knockout stage", higher: true },
];

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();

  const [{ data: players }, { data: contestScores }, { data: draftPickRows }] = await Promise.all([
    admin.from("profiles").select("id, display_name"),
    admin.from("contest_scores").select("*"),
    admin.from("draft_picks").select("user_id"),
  ]);

  // Only show users who actually drafted a team — exclude predict-only signups.
  const draftedUserIds = new Set((draftPickRows ?? []).map((r) => r.user_id));
  const draftPlayers = (players ?? []).filter((p) => draftedUserIds.has(p.id));

  const playerMap = Object.fromEntries(draftPlayers.map((p) => [p.id, p.display_name]));

  const totals: Record<string, number> = {};
  for (const cs of contestScores ?? []) {
    totals[cs.user_id] = (totals[cs.user_id] ?? 0) + (cs.contest_points ?? 0);
  }

  const overall = draftPlayers
    .map((p) => ({ ...p, total: totals[p.id] ?? 0 }))
    .sort((a, b) => b.total - a.total);

  const overallRanks: number[] = [];
  for (let i = 0; i < overall.length; i++) {
    overallRanks.push(i > 0 && overall[i].total === overall[i - 1].total ? overallRanks[i - 1] : i + 1);
  }

  const byContest: Record<string, Array<{ user_id: string; score: number; rank: number | null; contest_points: number }>> = {};
  for (const cs of contestScores ?? []) {
    if (!byContest[cs.contest]) byContest[cs.contest] = [];
    byContest[cs.contest].push(cs);
  }
  for (const key of Object.keys(byContest)) {
    byContest[key].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  }

  const rankColors = ["text-gold", "text-chalk/70", "text-amber-600", "text-chalk/40", "text-chalk/30"];

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <a href="/" className="text-chalk/40 hover:text-chalk text-sm mb-6 inline-block">← Home</a>
        <h1 className="text-3xl font-bold text-gold font-display uppercase tracking-wide mb-2">Leaderboard</h1>
        <p className="text-chalk/40 text-sm mb-8">Overall standings across all 5 contests</p>

        <div className="card mb-8">
          <h2 className="text-sm uppercase tracking-widest text-chalk/50 mb-4">Overall</h2>
          <div className="flex flex-col gap-3">
            {overall.length === 0 ? (
              <p className="text-chalk/30 text-sm">No scores yet — draft needs to complete and scores need to sync.</p>
            ) : (
              overall.map((p, i) => (
                <div key={p.id} className={`flex items-center justify-between ${p.id === user?.id ? "text-gold" : "text-chalk"}`}>
                  <div className="flex items-center gap-3">
                    <span className={`font-mono text-sm w-5 ${rankColors[overallRanks[i] - 1] ?? "text-chalk/30"}`}>#{overallRanks[i]}</span>
                    <Link href={`/teams?player=${p.id}`} className="font-bold hover:text-gold transition-colors">
                      {p.display_name}{p.id === user?.id && " (you)"}
                    </Link>
                  </div>
                  <span className="font-mono font-bold">{p.total} pts</span>
                </div>
              ))
            )}
          </div>
        </div>

        <h2 className="text-sm uppercase tracking-widest text-chalk/50 mb-4">Contest Breakdown</h2>
        <div className="flex flex-col gap-4">
          {CONTESTS.map((contest) => {
            const rows = byContest[contest.key] ?? [];
            const allZero = rows.every((r) => r.contest_points === 0);
            return (
              <details key={contest.key} className="card group">
                <summary className="cursor-pointer flex items-center justify-between list-none">
                  <div>
                    <span className="text-chalk font-bold">{contest.label}</span>
                    <span className="text-chalk/40 text-xs ml-2">{contest.desc}</span>
                  </div>
                  <span className="text-chalk/30 text-xs group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-4 flex flex-col gap-2">
                  {rows.length === 0 ? (
                    <p className="text-chalk/30 text-sm">No data yet.</p>
                  ) : allZero ? (
                    <p className="text-chalk/30 text-sm">No points awarded yet — scores are all zero.</p>
                  ) : (
                    rows.map((row, i) => (
                      <div
                        key={row.user_id}
                        className={`flex items-center justify-between text-sm ${row.user_id === user?.id ? "text-gold" : "text-chalk"}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`font-mono w-5 ${rankColors[i] ?? "text-chalk/30"}`}>
                            {row.rank != null ? `#${row.rank}` : "—"}
                          </span>
                          <Link href={`/teams?player=${row.user_id}`} className="hover:text-gold transition-colors">
                            {playerMap[row.user_id] ?? "—"}{row.user_id === user?.id && " (you)"}
                          </Link>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-chalk/50 font-mono">{row.score}</span>
                          <span className={`font-mono font-bold ${rankColors[i] ?? "text-chalk/30"}`}>
                            +{row.contest_points}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </main>
  );
}
