import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import SyncTime from "@/components/SyncTime";

export const revalidate = 60;

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

type TeamRow = {
  id: number;
  name: string;
  code: string;
  flag_emoji: string;
  mp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  owner: string | null;
};

export default async function StandingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [{ data: teams }, { data: matches }, { data: picks }, { data: syncSetting }] = await Promise.all([
    admin.from("teams").select("id, name, code, flag_emoji, group_name").order("group_name").order("name"),
    admin
      .from("matches")
      .select("home_team_id, away_team_id, home_score, away_score, status")
      .eq("stage", "group")
      .eq("status", "completed"),
    admin
      .from("draft_picks")
      .select("team_id, profiles(display_name), draft_sessions!inner(stage)")
      .eq("draft_sessions.stage", "group_stage"),
    admin.from("app_settings").select("value").eq("key", "last_sync_at").maybeSingle(),
  ]);

  // Build owner map
  const ownerMap: Record<number, string> = {};
  for (const pick of picks ?? []) {
    const name = Array.isArray(pick.profiles)
      ? pick.profiles[0]?.display_name
      : (pick.profiles as { display_name: string } | null)?.display_name;
    if (name) ownerMap[pick.team_id] = name;
  }

  // Build standings per team
  const standingsMap: Record<number, TeamRow> = {};
  for (const team of teams ?? []) {
    standingsMap[team.id] = {
      id: team.id,
      name: team.name,
      code: team.code,
      flag_emoji: team.flag_emoji,
      mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0,
      owner: ownerMap[team.id] ?? null,
    };
  }

  for (const m of matches ?? []) {
    const home = standingsMap[m.home_team_id];
    const away = standingsMap[m.away_team_id];
    if (!home || !away) continue;
    const hg = m.home_score ?? 0;
    const ag = m.away_score ?? 0;
    home.mp++; home.gf += hg; home.ga += ag; home.gd += hg - ag;
    away.mp++; away.gf += ag; away.ga += hg; away.gd += ag - hg;
    if (hg > ag) { home.w++; home.pts += 3; away.l++; }
    else if (hg < ag) { away.w++; away.pts += 3; home.l++; }
    else { home.d++; home.pts++; away.d++; away.pts++; }
  }

  // Group teams by group_name
  const byGroup: Record<string, (TeamRow & { group_name: string })[]> = {};
  for (const team of teams ?? []) {
    const row = standingsMap[team.id];
    if (!row) continue;
    const g = (team as typeof team & { group_name: string }).group_name;
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g].push({ ...row, group_name: g });
  }

  // Sort each group: pts desc, gd desc, gf desc, name asc
  for (const g of Object.keys(byGroup)) {
    byGroup[g].sort((a, b) =>
      b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name)
    );
  }

  const hasMatches = (matches ?? []).length > 0;

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <a href="/" className="text-chalk/40 hover:text-chalk text-sm mb-6 inline-block">← Home</a>
        <h1 className="text-3xl font-bold text-gold font-display uppercase tracking-wide mb-2">Group Standings</h1>
        <p className="text-chalk/40 text-sm mb-1">
          {hasMatches ? "Top 2 teams in each group advance" : "No matches played yet"}
        </p>
        {syncSetting?.value && (
          <p className="text-chalk/30 text-xs font-mono mb-8">
            Last synced: <SyncTime value={syncSetting.value} />
          </p>
        )}
        {!syncSetting?.value && <div className="mb-8" />}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {GROUPS.map((g) => {
            const rows = byGroup[g] ?? [];
            return (
              <div key={g} className="card p-0 overflow-hidden">
                <div className="px-4 py-2 border-b border-border bg-surface/50">
                  <span className="text-gold font-bold font-mono text-sm uppercase tracking-widest">Group {g}</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-chalk/30 text-xs font-mono border-b border-border">
                      <th className="text-left px-4 py-2 font-normal">Team</th>
                      <th className="px-2 py-2 font-normal">MP</th>
                      <th className="px-2 py-2 font-normal">W</th>
                      <th className="px-2 py-2 font-normal">D</th>
                      <th className="px-2 py-2 font-normal">L</th>
                      <th className="px-2 py-2 font-normal">GD</th>
                      <th className="px-2 py-2 font-normal">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={row.id} className={`border-b border-border/50 last:border-0 ${i < 2 ? "bg-gold/5" : ""}`}>
                        <td className="px-4 py-2">
                          <a href={`/country/${row.id}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                            <span>{row.flag_emoji}</span>
                            <div>
                              <span className={`font-bold text-chalk`}>
                                {row.code}
                              </span>
                              {row.owner && (
                                <div className="text-xs text-chalk/30">{row.owner}</div>
                              )}
                            </div>
                          </a>
                        </td>
                        <td className="px-2 py-2 text-center text-chalk/50 font-mono">{row.mp}</td>
                        <td className="px-2 py-2 text-center text-chalk font-mono">{row.w}</td>
                        <td className="px-2 py-2 text-center text-chalk/50 font-mono">{row.d}</td>
                        <td className="px-2 py-2 text-center text-chalk/50 font-mono">{row.l}</td>
                        <td className="px-2 py-2 text-center text-chalk/50 font-mono">
                          {row.gd > 0 ? `+${row.gd}` : row.gd}
                        </td>
                        <td className="px-2 py-2 text-center font-bold font-mono text-chalk">{row.pts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
