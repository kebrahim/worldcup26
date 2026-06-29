import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";

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
  home: Team | Team[] | null;
  away: Team | Team[] | null;
};

type PickRow = {
  user_id: string;
  match_id: number;
  predicted_winner_team_id: number;
  profiles: { display_name: string | null } | { display_name: string | null }[] | null;
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

  const [{ data: rawMatches }, { data: rawPicks }] = await Promise.all([
    admin
      .from("matches")
      .select(
        "id, stage, kickoff_utc, status, winner_team_id, home:home_team_id(id, name, code, flag_emoji), away:away_team_id(id, name, code, flag_emoji)"
      )
      .neq("stage", "group")
      .order("kickoff_utc", { ascending: true }),
    picksRevealed
      ? admin
          .from("bracket_picks")
          .select(
            "user_id, match_id, predicted_winner_team_id, profiles(display_name), team:predicted_winner_team_id(id, name, code, flag_emoji)"
          )
      : Promise.resolve({ data: [] as PickRow[] }),
  ]);

  const matches = (rawMatches ?? []) as unknown as Match[];

  const picksByMatch: Record<number, { displayName: string; team: Team | null; isMe: boolean }[]> = {};
  for (const p of (rawPicks ?? []) as unknown as PickRow[]) {
    const profile = one(p.profiles);
    const team = one(p.team);
    if (!picksByMatch[p.match_id]) picksByMatch[p.match_id] = [];
    picksByMatch[p.match_id]!.push({
      displayName: profile?.display_name ?? "Anonymous",
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
            {matches.map((match) => {
              const home = one(match.home);
              const away = one(match.away);
              const picks = picksByMatch[match.id] ?? [];
              const kickoff = match.kickoff_utc
                ? new Date(match.kickoff_utc).toLocaleString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "TBD";

              return (
                <div key={match.id} className="card">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                    <span className="text-xs uppercase tracking-widest text-chalk/40 font-mono">
                      {STAGE_LABELS[match.stage] ?? match.stage}
                    </span>
                    <span className="text-xs text-chalk/30 font-mono">{kickoff}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2 my-3">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xl">{home?.flag_emoji ?? "🏳️"}</span>
                      <div>
                        <div className="font-bold text-sm text-chalk">{home?.code ?? "TBD"}</div>
                        <div className="text-xs text-chalk/30 hidden sm:block">{home?.name}</div>
                      </div>
                    </div>
                    <div className="text-center min-w-[80px]">
                      {match.status === "completed" ? (
                        <div className="text-chalk/40 text-xs font-mono">Final</div>
                      ) : match.status === "live" ? (
                        <div className="text-gold font-bold text-sm animate-pulse">LIVE</div>
                      ) : (
                        <div className="text-chalk/20 text-xs">vs</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      <div className="text-right">
                        <div className="font-bold text-sm text-chalk">{away?.code ?? "TBD"}</div>
                        <div className="text-xs text-chalk/30 hidden sm:block">{away?.name}</div>
                      </div>
                      <span className="text-xl">{away?.flag_emoji ?? "🏳️"}</span>
                    </div>
                  </div>

                  {picksRevealed && (
                    <div className="border-t border-border pt-3 mt-1">
                      {picks.length === 0 ? (
                        <p className="text-chalk/30 text-xs">No picks for this match.</p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {picks.map((p) => {
                            const isCorrect =
                              match.status === "completed" &&
                              match.winner_team_id != null &&
                              p.team?.id === match.winner_team_id;
                            const isWrong =
                              match.status === "completed" &&
                              match.winner_team_id != null &&
                              p.team?.id !== match.winner_team_id;
                            return (
                              <div
                                key={p.displayName}
                                className={`flex items-center justify-between text-sm ${p.isMe ? "text-gold" : "text-chalk"}`}
                              >
                                <span>
                                  {p.displayName}
                                  {p.isMe && <span className="text-gold text-xs ml-1">(you)</span>}
                                </span>
                                <span className="flex items-center gap-2 font-mono text-xs">
                                  {p.team?.flag_emoji} {p.team?.code ?? "—"}
                                  {isCorrect && <span className="text-green-400">✓</span>}
                                  {isWrong && <span className="text-red-400">✗</span>}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
