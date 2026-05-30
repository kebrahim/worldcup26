import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export const revalidate = 60;

const STAGE_LABELS: Record<string, string> = {
  group: "Group Stage",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  final: "Final",
};

export default async function SchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [{ data: matches }, { data: myPicks }] = await Promise.all([
    admin
      .from("matches")
      .select("*, home:home_team_id(id, name, code, flag_emoji), away:away_team_id(id, name, code, flag_emoji)")
      .order("kickoff_utc", { ascending: true }),
    admin
      .from("draft_picks")
      .select("team_id")
      .eq("user_id", user.id),
  ]);

  const myTeamIds = new Set((myPicks ?? []).map((p) => p.team_id));

  const byDate: Record<string, typeof matches> = {};
  for (const match of matches ?? []) {
    const date = match.kickoff_utc
      ? new Date(match.kickoff_utc).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
      : "TBD";
    if (!byDate[date]) byDate[date] = [];
    byDate[date]!.push(match);
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <a href="/" className="text-chalk/40 hover:text-chalk text-sm mb-6 inline-block">← Home</a>
        <h1 className="text-3xl font-bold text-gold font-display uppercase tracking-wide mb-2">Schedule</h1>
        <p className="text-chalk/40 text-sm mb-8">All matches — your teams are highlighted</p>

        {Object.keys(byDate).length === 0 ? (
          <div className="card">
            <p className="text-chalk/30 text-sm">No matches yet — scores will populate once the tournament begins.</p>
          </div>
        ) : (
          Object.entries(byDate).map(([date, dayMatches]) => (
            <div key={date} className="mb-8">
              <h2 className="text-xs uppercase tracking-widest text-chalk/40 mb-3 font-mono">{date}</h2>
              <div className="flex flex-col gap-2">
                {(dayMatches ?? []).map((match) => {
                  const home = Array.isArray(match.home) ? match.home[0] : match.home;
                  const away = Array.isArray(match.away) ? match.away[0] : match.away;
                  const isMyMatch = myTeamIds.has(home?.id) || myTeamIds.has(away?.id);
                  const kickoff = match.kickoff_utc
                    ? new Date(match.kickoff_utc).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
                    : "TBD";

                  return (
                    <div
                      key={match.id}
                      className={`card py-3 ${isMyMatch ? "border-l-gold-light" : ""}`}
                      style={isMyMatch ? { borderLeftColor: "#f5c842" } : {}}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className={`flex items-center gap-2 flex-1 ${myTeamIds.has(home?.id) ? "text-gold" : "text-chalk"}`}>
                          <span className="text-xl">{home?.flag_emoji}</span>
                          <div>
                            <div className="font-bold text-sm">{home?.code ?? "TBD"}</div>
                            <div className="text-xs text-chalk/40 hidden sm:block">{home?.name}</div>
                          </div>
                        </div>

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
                          ) : (
                            <div className="text-chalk/40 font-mono text-sm">{kickoff}</div>
                          )}
                          <div className="text-xs text-chalk/30 mt-0.5">
                            {match.stage === "group" && match.group_name
                              ? `Group ${match.group_name}`
                              : STAGE_LABELS[match.stage] ?? match.stage}
                          </div>
                        </div>

                        <div className={`flex items-center gap-2 flex-1 justify-end ${myTeamIds.has(away?.id) ? "text-gold" : "text-chalk"}`}>
                          <div className="text-right">
                            <div className="font-bold text-sm">{away?.code ?? "TBD"}</div>
                            <div className="text-xs text-chalk/40 hidden sm:block">{away?.name}</div>
                          </div>
                          <span className="text-xl">{away?.flag_emoji}</span>
                        </div>
                      </div>

                      {match.venue && (
                        <div className="text-xs text-chalk/20 mt-2 text-center">{match.venue}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
