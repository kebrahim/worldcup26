import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export const revalidate = 60;

const ROUNDS = [
  { key: "round_of_32", label: "Round of 32", matchCount: 16 },
  { key: "round_of_16", label: "Round of 16", matchCount: 8 },
  { key: "quarterfinal", label: "Quarterfinals", matchCount: 4 },
  { key: "semifinal", label: "Semifinals", matchCount: 2 },
  { key: "final", label: "Final", matchCount: 1 },
];

export default async function BracketPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [{ data: matches }, { data: picks }, { data: syncSetting }] = await Promise.all([
    admin
      .from("matches")
      .select("*, home:home_team_id(id, name, code, flag_emoji), away:away_team_id(id, name, code, flag_emoji)")
      .neq("stage", "group")
      .order("kickoff_utc", { ascending: true }),
    admin
      .from("draft_picks")
      .select("team_id, user_id, profiles(display_name), draft_sessions!inner(stage)")
      .eq("draft_sessions.stage", "group_stage")
      .eq("user_id", user.id),
    admin.from("app_settings").select("value").eq("key", "last_sync_at").maybeSingle(),
  ]);

  const myTeamIds = new Set((picks ?? []).map((p) => p.team_id));

  const byRound: Record<string, typeof matches> = {};
  for (const m of matches ?? []) {
    if (!byRound[m.stage]) byRound[m.stage] = [];
    byRound[m.stage]!.push(m);
  }

  const hasAnyMatches = (matches ?? []).length > 0;

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <a href="/" className="text-chalk/40 hover:text-chalk text-sm mb-6 inline-block">← Home</a>
        <h1 className="text-3xl font-bold text-gold font-display uppercase tracking-wide mb-2">Knockout Bracket</h1>
        <p className="text-chalk/40 text-sm mb-1">Your teams are highlighted in gold</p>
        {syncSetting?.value && (
          <p className="text-chalk/30 text-xs font-mono mb-8">
            Last synced: {new Date(syncSetting.value).toLocaleString()}
          </p>
        )}
        {!syncSetting?.value && <div className="mb-8" />}

        {!hasAnyMatches ? (
          <div className="card">
            <p className="text-chalk/30 text-sm">Bracket will be filled in once the group stage is complete.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {ROUNDS.map(({ key, label }) => {
              const roundMatches = byRound[key] ?? [];
              if (roundMatches.length === 0) return null;
              return (
                <div key={key}>
                  <h2 className="text-xs uppercase tracking-widest text-chalk/40 font-mono mb-3">{label}</h2>
                  <div className="flex flex-col gap-2">
                    {roundMatches.map((match) => {
                      const home = Array.isArray(match.home) ? match.home[0] : match.home;
                      const away = Array.isArray(match.away) ? match.away[0] : match.away;
                      const isMyMatch = myTeamIds.has(home?.id) || myTeamIds.has(away?.id);

                      return (
                        <div
                          key={match.id}
                          className="card py-3"
                          style={isMyMatch ? { borderLeftColor: "#f5c842" } : {}}
                        >
                          <div className="flex items-center justify-between gap-2">
                            {/* Home */}
                            <a href={home?.id ? `/country/${home.id}` : undefined} className={`flex items-center gap-2 flex-1 hover:opacity-80 transition-opacity ${myTeamIds.has(home?.id) ? "text-gold" : "text-chalk"}`}>
                              <span className="text-xl">{home?.flag_emoji ?? "🏳️"}</span>
                              <div>
                                <div className="font-bold text-sm">{home?.code ?? "TBD"}</div>
                                <div className="text-xs text-chalk/40 hidden sm:block">{home?.name}</div>
                              </div>
                            </a>

                            {/* Score / time */}
                            <div className="text-center min-w-[80px]">
                              {match.status === "completed" ? (
                                <div className="font-mono font-bold text-chalk text-lg">
                                  {match.home_score} – {match.away_score}
                                  {match.home_score_pen != null && (
                                    <div className="text-xs text-chalk/40">
                                      ({match.home_score_pen}–{match.away_score_pen} pens)
                                    </div>
                                  )}
                                </div>
                              ) : match.status === "live" ? (
                                <div className="text-gold font-bold text-sm animate-pulse">LIVE</div>
                              ) : match.kickoff_utc ? (
                                <div className="text-chalk/40 font-mono text-xs">
                                  {new Date(match.kickoff_utc).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </div>
                              ) : (
                                <div className="text-chalk/20 font-mono text-xs">TBD</div>
                              )}
                              {match.winner_team_id && (
                                <div className="text-xs text-green-400 mt-0.5">
                                  {match.winner_team_id === home?.id ? home?.code : away?.code} advances
                                </div>
                              )}
                            </div>

                            {/* Away */}
                            <a href={away?.id ? `/country/${away.id}` : undefined} className={`flex items-center gap-2 flex-1 justify-end hover:opacity-80 transition-opacity ${myTeamIds.has(away?.id) ? "text-gold" : "text-chalk"}`}>
                              <div className="text-right">
                                <div className="font-bold text-sm">{away?.code ?? "TBD"}</div>
                                <div className="text-xs text-chalk/40 hidden sm:block">{away?.name}</div>
                              </div>
                              <span className="text-xl">{away?.flag_emoji ?? "🏳️"}</span>
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
