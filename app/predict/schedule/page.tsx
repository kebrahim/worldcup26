import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import MatchTime from "@/components/MatchTime";

export const revalidate = 60;

const DEADLINE = new Date("2026-06-28T19:00:00Z");

const STAGE_LABELS: Record<string, string> = {
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  third_place: "3rd Place Playoff",
  final: "Final",
};

type Team = { id: number; name: string; code: string; flag_emoji: string };

type Match = {
  id: number;
  stage: string;
  kickoff_utc: string | null;
  status: string;
  winner_team_id: number | null;
  home_score: number | null;
  away_score: number | null;
  home_score_pen: number | null;
  away_score_pen: number | null;
  home: Team | Team[] | null;
  away: Team | Team[] | null;
};

type PickRow = {
  user_id: string;
  match_id: number;
  predicted_winner_team_id: number;
  team: Team | Team[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function PredictSchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/predict/schedule");

  const admin = createAdminClient();
  const now = new Date();
  const afterDeadline = now >= DEADLINE;

  const { data: viewerProfile } = await admin
    .from("profiles")
    .select("is_commissioner")
    .eq("id", user.id)
    .maybeSingle();
  const isCommissioner = viewerProfile?.is_commissioner ?? false;
  const picksRevealed = afterDeadline || isCommissioner;

  const [{ data: rawMatches }, { data: rawPicks }, { data: profiles }] = await Promise.all([
    admin
      .from("matches")
      .select(
        "id, stage, kickoff_utc, status, winner_team_id, home_score, away_score, home_score_pen, away_score_pen, home:home_team_id(id, name, code, flag_emoji), away:away_team_id(id, name, code, flag_emoji)"
      )
      .neq("stage", "group")
      .order("kickoff_utc", { ascending: true }),
    picksRevealed
      ? admin
          .from("bracket_picks")
          .select(
            "user_id, match_id, predicted_winner_team_id, team:predicted_winner_team_id(id, name, code, flag_emoji)"
          )
      : Promise.resolve({ data: [] as PickRow[] }),
    picksRevealed
      ? admin.from("profiles").select("id, display_name")
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
  ]);

  const matches = (rawMatches ?? []) as unknown as Match[];

  const profileMap: Record<string, string> = {};
  for (const p of profiles ?? []) {
    profileMap[p.id] = p.display_name ?? "Anonymous";
  }

  const picksByMatch: Record<number, { userId: string; displayName: string; team: Team | null; isMe: boolean }[]> = {};
  for (const p of (rawPicks ?? []) as unknown as PickRow[]) {
    const team = one(p.team);
    if (!picksByMatch[p.match_id]) picksByMatch[p.match_id] = [];
    picksByMatch[p.match_id]!.push({
      userId: p.user_id,
      displayName: profileMap[p.user_id] ?? "Anonymous",
      team,
      isMe: p.user_id === user.id,
    });
  }
  for (const matchId of Object.keys(picksByMatch)) {
    picksByMatch[Number(matchId)]!.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/predict" className="text-chalk/40 hover:text-chalk text-sm mb-6 inline-block">
          ← Leaderboard
        </Link>
        <h1 className="text-3xl font-bold text-gold font-display uppercase tracking-wide mb-2">
          Bracket Prediction Contest
        </h1>

        {/* Sub-nav */}
        <div className="flex gap-4 mb-8 border-b border-border pb-3">
          <Link href="/predict" className="text-chalk/40 hover:text-chalk text-sm pb-3 -mb-3">
            Leaderboard
          </Link>
          <Link href="/predict/pick" className="text-chalk/40 hover:text-chalk text-sm pb-3 -mb-3">
            My Bracket
          </Link>
          <span className="text-gold font-bold text-sm border-b-2 border-gold pb-3 -mb-3">
            Schedule
          </span>
        </div>

        {!picksRevealed && (
          <div className="card mb-6 bg-gold/5 border-gold/30">
            <p className="text-chalk/50 text-sm">🔒 Picks will be revealed after the deadline passes.</p>
          </div>
        )}

        {matches.length === 0 ? (
          <div className="card">
            <p className="text-chalk/30 text-sm">No knockout matches scheduled yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {matches.map((match, idx) => {
              const home = one(match.home);
              const away = one(match.away);
              const picks = picksByMatch[match.id] ?? [];
              const prevMatch = matches[idx - 1];
              const showStageDivider = idx === 0 || prevMatch?.stage !== match.stage;

              return (
                <div key={match.id}>
                  {showStageDivider && (
                    <div className={`flex items-center gap-3 ${idx > 0 ? "mt-4" : ""} mb-2`}>
                      <h2 className="text-sm font-bold uppercase tracking-widest text-gold font-display whitespace-nowrap">
                        {STAGE_LABELS[match.stage] ?? match.stage}
                      </h2>
                      <div className="flex-1 h-px bg-gold/30" />
                    </div>
                  )}
                <div className="card">
                  <div className="flex items-center justify-end gap-2 flex-wrap mb-1">
                    <span className="text-xs text-chalk/30 font-mono">
                      {match.kickoff_utc ? <MatchTime value={match.kickoff_utc} /> : "TBD"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 my-3">
                    <Link
                      href={home ? `/country/${home.id}?hideOwner=1` : "#"}
                      className={`flex items-center gap-2 flex-1 ${home ? "hover:text-gold transition-colors" : "pointer-events-none"} ${
                        match.status === "completed" && match.winner_team_id === home?.id ? "text-gold" : "text-chalk"
                      }`}
                    >
                      <span className="text-xl">{home?.flag_emoji ?? "🏳️"}</span>
                      <div>
                        <div className="font-bold text-sm">{home?.code ?? "TBD"}</div>
                        <div className="text-xs text-chalk/30 hidden sm:block">{home?.name}</div>
                      </div>
                    </Link>
                    <div className="text-center min-w-[80px]">
                      {match.status === "completed" ? (
                        <>
                          <div className="font-mono font-bold text-chalk text-lg">
                            {match.home_score} – {match.away_score}
                          </div>
                          {match.home_score_pen != null && (
                            <div className="text-xs text-chalk/40">
                              ({match.home_score_pen}–{match.away_score_pen} pens)
                            </div>
                          )}
                        </>
                      ) : match.status === "live" ? (
                        <div className="text-gold font-bold text-sm animate-pulse">LIVE</div>
                      ) : (
                        <div className="text-chalk/20 text-xs">vs</div>
                      )}
                    </div>
                    <Link
                      href={away ? `/country/${away.id}?hideOwner=1` : "#"}
                      className={`flex items-center gap-2 flex-1 justify-end ${away ? "hover:text-gold transition-colors" : "pointer-events-none"} ${
                        match.status === "completed" && match.winner_team_id === away?.id ? "text-gold" : "text-chalk"
                      }`}
                    >
                      <div className="text-right">
                        <div className="font-bold text-sm">{away?.code ?? "TBD"}</div>
                        <div className="text-xs text-chalk/30 hidden sm:block">{away?.name}</div>
                      </div>
                      <span className="text-xl">{away?.flag_emoji ?? "🏳️"}</span>
                    </Link>
                  </div>

                  {picksRevealed && (
                    <div className="border-t border-border pt-3 mt-1">
                      {picks.length === 0 ? (
                        <p className="text-chalk/30 text-xs">No picks for this match.</p>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {(() => {
                            const byTeam = new Map<number, { team: Team; pickers: typeof picks }>();
                            for (const p of picks) {
                              if (!p.team) continue;
                              // Skip stale picks where the predicted team didn't advance to this match
                              if (home && away && p.team.id !== home.id && p.team.id !== away.id) continue;
                              if (!byTeam.has(p.team.id)) byTeam.set(p.team.id, { team: p.team, pickers: [] });
                              byTeam.get(p.team.id)!.pickers.push(p);
                            }
                            const groups = Array.from(byTeam.values()).sort((a, b) => b.pickers.length - a.pickers.length);
                            return groups.map(({ team, pickers }) => {
                              const isCorrect = match.status === "completed" && match.winner_team_id != null && team.id === match.winner_team_id;
                              const isWrong = match.status === "completed" && match.winner_team_id != null && team.id !== match.winner_team_id;
                              return (
                                <div key={team.id}>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-base">{team.flag_emoji}</span>
                                    <span className="font-mono text-xs font-bold text-chalk">{team.code}</span>
                                    <span className="text-chalk/30 text-xs">({pickers.length})</span>
                                    {isCorrect && <span className="text-green-400 text-xs">✓</span>}
                                    {isWrong && <span className="text-red-400 text-xs">✗</span>}
                                  </div>
                                  <div className="flex flex-wrap gap-x-3 gap-y-1 ml-6">
                                    {pickers.map((p) => (
                                      <Link
                                        key={p.userId}
                                        href={`/predict/${p.userId}`}
                                        className={`text-sm hover:text-gold transition-colors ${p.isMe ? "text-gold" : "text-chalk/70"}`}
                                      >
                                        {p.displayName}
                                        {p.isMe && <span className="text-gold text-xs ml-1">(you)</span>}
                                      </Link>
                                    ))}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  )}
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
