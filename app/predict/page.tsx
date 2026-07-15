import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

export const revalidate = 60;

const DEADLINE = new Date("2026-06-28T19:00:00Z");

const ROUND_POINTS: Record<string, number> = {
  round_of_32: 1,
  round_of_16: 2,
  quarterfinal: 4,
  semifinal: 8,
  third_place: 1,
  final: 16,
};

type Profile = { id: string; display_name: string | null };

type Team = { id: number; name: string; code: string; flag_emoji: string };

type BracketPick = {
  user_id: string;
  match_id: number;
  predicted_winner_team_id: number;
  match: {
    id: number;
    stage: string;
    winner_team_id: number | null;
    status: string;
  } | null;
  team: Team | Team[] | null;
};

type Tiebreaker = { user_id: string; predicted_total_goals: number };

type LeaderboardEntry = {
  userId: string;
  displayName: string;
  score: number;
  correctPicks: number;
  totalPicks: number;
  tiebreakerGuess: number | null;
  championPick: Team | null;
  roundPoints: Record<string, number>;
};

export default async function PredictPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const now = new Date();
  const afterDeadline = now >= DEADLINE;

  let { data: viewerProfile } = user
    ? await admin.from("profiles").select("display_name, is_commissioner").eq("id", user.id).maybeSingle()
    : { data: null };

  // Safety net: the on_auth_user_created trigger should always create a profile on
  // signup, but if it ever doesn't (e.g. a transient signup glitch), self-heal here
  // rather than leaving the user stuck without a profile.
  if (user && !viewerProfile) {
    const displayName =
      (user.user_metadata?.display_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "Anonymous";
    const { data: created } = await admin
      .from("profiles")
      .upsert(
        { id: user.id, display_name: displayName, email: user.email ?? "" },
        { onConflict: "id" }
      )
      .select("display_name, is_commissioner")
      .single();
    viewerProfile = created;
  }

  const isCommissioner = viewerProfile?.is_commissioner ?? false;
  const picksRevealed = afterDeadline || isCommissioner;

  const [{ data: profiles }, { data: picks }, { data: tiebreakers }, { count: expectedPickCount }, { data: allMatches }] =
    await Promise.all([
      admin.from("profiles").select("id, display_name"),
      admin
        .from("bracket_picks")
        .select(
          "user_id, match_id, predicted_winner_team_id, match:match_id(id, stage, winner_team_id, status), team:predicted_winner_team_id(id, name, code, flag_emoji)"
        ),
      admin.from("bracket_tiebreaker").select("user_id, predicted_total_goals"),
      admin.from("matches").select("*", { count: "exact", head: true }).neq("stage", "group"),
      admin.from("matches").select("home_score, away_score, status").neq("stage", "group"),
    ]);

  // Knockout-stage total goals for the tiebreaker — regulation + extra time only,
  // penalty shootout goals (home_score_pen/away_score_pen) are excluded, and group
  // stage goals don't count. Only counts completed matches, so this climbs toward
  // the final total as the knockout stage progresses.
  type GoalsRow = { home_score: number | null; away_score: number | null; status: string };
  const tournamentMatches = (allMatches as GoalsRow[]) ?? [];
  const completedMatchCount = tournamentMatches.filter((m) => m.status === "completed").length;
  const actualTotalGoals = tournamentMatches
    .filter((m) => m.status === "completed")
    .reduce((sum, m) => sum + (m.home_score ?? 0) + (m.away_score ?? 0), 0);
  const tournamentComplete =
    tournamentMatches.length > 0 && tournamentMatches.every((m) => m.status === "completed");

  // Build leaderboard
  const profileMap: Record<string, string> = {};
  for (const p of (profiles as unknown as Profile[]) ?? []) {
    profileMap[p.id] = p.display_name ?? "Anonymous";
  }

  const tiebreakerMap: Record<string, number> = {};
  for (const t of (tiebreakers as Tiebreaker[]) ?? []) {
    tiebreakerMap[t.user_id] = t.predicted_total_goals;
  }

  const scoresByUser: Record<
    string,
    { score: number; correct: number; total: number; roundPoints: Record<string, number> }
  > = {};
  const championByUser: Record<string, Team> = {};
  for (const pick of (picks as unknown as BracketPick[]) ?? []) {
    if (!scoresByUser[pick.user_id]) {
      scoresByUser[pick.user_id] = { score: 0, correct: 0, total: 0, roundPoints: {} };
    }
    const entry = scoresByUser[pick.user_id]!;
    const match = Array.isArray(pick.match) ? pick.match[0] : pick.match;
    if (!match) continue;
    entry.total++;
    if (match.status === "completed" && match.winner_team_id != null) {
      if (pick.predicted_winner_team_id === match.winner_team_id) {
        const pts = ROUND_POINTS[match.stage] ?? 1;
        entry.score += pts;
        entry.correct++;
        entry.roundPoints[match.stage] = (entry.roundPoints[match.stage] ?? 0) + pts;
      }
    }
    if (match.stage === "final") {
      const team = Array.isArray(pick.team) ? pick.team[0] : pick.team;
      if (team) championByUser[pick.user_id] = team;
    }
  }

  // Collect all users who have submitted picks
  const participantIds = new Set<string>([
    ...Object.keys(scoresByUser),
    ...Object.keys(tiebreakerMap),
  ]);

  const leaderboard: LeaderboardEntry[] = Array.from(participantIds).map(
    (uid) => ({
      userId: uid,
      displayName: profileMap[uid] ?? "Anonymous",
      score: scoresByUser[uid]?.score ?? 0,
      correctPicks: scoresByUser[uid]?.correct ?? 0,
      totalPicks: scoresByUser[uid]?.total ?? 0,
      tiebreakerGuess: tiebreakerMap[uid] ?? null,
      championPick: championByUser[uid] ?? null,
      roundPoints: scoresByUser[uid]?.roundPoints ?? {},
    })
  );

  const tiebreakerDistance = (entry: LeaderboardEntry) =>
    entry.tiebreakerGuess != null ? Math.abs(entry.tiebreakerGuess - actualTotalGoals) : Infinity;

  leaderboard.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tiebreaker: closest guess to the actual tournament total goals wins.
    return tiebreakerDistance(a) - tiebreakerDistance(b);
  });

  // Standard competition ranking: tied scores share a rank, and the next rank
  // skips ahead (e.g. 1, 1, 3 — not 1, 1, 2). Once the tournament is over, the
  // tiebreaker (closest guess to actual goals) is used to actually separate
  // tied scores instead of leaving them tied.
  const ranks: number[] = [];
  leaderboard.forEach((entry, i) => {
    const prev = leaderboard[i - 1];
    const tied =
      i > 0 &&
      entry.score === prev!.score &&
      (!tournamentComplete || tiebreakerDistance(entry) === tiebreakerDistance(prev!));
    ranks.push(tied ? ranks[i - 1]! : i + 1);
  });

  const userHasPicks = user ? participantIds.has(user.id) : false;

  // Commissioner-only: completion status across every registered profile, not
  // just those who've made at least one pick, so missing participants show too.
  const totalExpectedPicks = expectedPickCount ?? 0;
  const pickStatus = ((profiles as unknown as Profile[]) ?? [])
    .map((p) => {
      const picksMade = scoresByUser[p.id]?.total ?? 0;
      const hasTiebreaker = tiebreakerMap[p.id] != null;
      return {
        userId: p.id,
        displayName: p.display_name ?? "Anonymous",
        picksMade,
        hasTiebreaker,
        complete: picksMade === totalExpectedPicks && hasTiebreaker,
      };
    })
    .sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? 1 : -1;
      return a.displayName.localeCompare(b.displayName);
    });

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <a href="/" className="text-chalk/40 hover:text-chalk text-sm mb-6 inline-block">
          ← Home
        </a>
        <h1 className="text-3xl font-bold text-gold font-display uppercase tracking-wide mb-2">
          Bracket Prediction Contest
        </h1>

        {/* Sub-nav */}
        <div className="flex gap-4 mb-8 border-b border-border pb-3">
          <span className="text-gold font-bold text-sm border-b-2 border-gold pb-3 -mb-3">
            Leaderboard
          </span>
          <Link
            href="/predict/pick"
            className="text-chalk/40 hover:text-chalk text-sm pb-3 -mb-3"
          >
            My Bracket
          </Link>
          <Link
            href="/predict/schedule"
            className="text-chalk/40 hover:text-chalk text-sm pb-3 -mb-3"
          >
            Schedule
          </Link>
        </div>

        {/* Auth / action banner */}
        <div className="card mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {!user ? (
            <>
              <p className="text-chalk/60 text-sm">
                Sign in to enter the bracket prediction contest.
              </p>
              <Link
                href="/login"
                className="bg-gold text-black font-bold px-4 py-2 rounded text-sm hover:bg-gold/80 transition-colors whitespace-nowrap"
              >
                Sign in / Register
              </Link>
            </>
          ) : !afterDeadline ? (
            <>
              <div>
                <p className="text-chalk font-bold text-sm">
                  {userHasPicks ? "Your picks are saved!" : "You haven't made your picks yet."}
                </p>
                <p className="text-chalk/40 text-xs mt-0.5">
                  Deadline:{" "}
                  {DEADLINE.toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZoneName: "short",
                    timeZone: "America/New_York",
                  })}
                </p>
              </div>
              <Link
                href="/predict/pick"
                className="bg-gold text-black font-bold px-4 py-2 rounded text-sm hover:bg-gold/80 transition-colors whitespace-nowrap"
              >
                {userHasPicks ? "Edit your picks" : "Make your picks"}
              </Link>
            </>
          ) : (
            <>
              <p className="text-chalk/60 text-sm">Picks are locked. Good luck!</p>
              {userHasPicks && (
                <Link
                  href={`/predict/${user.id}`}
                  className="bg-gold text-black font-bold px-4 py-2 rounded text-sm hover:bg-gold/80 transition-colors whitespace-nowrap"
                >
                  View your bracket
                </Link>
              )}
            </>
          )}
        </div>

        {/* Before deadline notice */}
        {!afterDeadline && !isCommissioner && (
          <div className="card mb-6 bg-gold/5 border-gold/30">
            <p className="text-chalk/50 text-sm">
              🔒 Picks will be revealed after the deadline passes.
            </p>
          </div>
        )}
        {!afterDeadline && isCommissioner && (
          <div className="card mb-6 bg-gold/5 border-gold/30">
            <p className="text-chalk/50 text-sm">
              🔓 Commissioner view — picks are visible to you before the deadline; other participants still see them locked.
            </p>
          </div>
        )}

        {/* Leaderboard */}
        {leaderboard.length === 0 ? (
          <div className="card">
            <p className="text-chalk/30 text-sm">No picks submitted yet.</p>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden mb-8">
            <div className="px-4 py-2 border-b border-border bg-surface/50 flex flex-wrap items-center justify-between gap-2">
              <span className="text-gold font-bold font-mono text-sm uppercase tracking-widest">
                Leaderboard
              </span>
              <span className="text-chalk/30 text-xs font-mono">
                Points per correct pick — R32: 1 · R16: 2 · QF: 4 · SF: 8 · 3rd: 1 · F: 16
              </span>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-chalk/30 text-xs font-mono border-b border-border">
                  <th className="text-left px-4 py-2 font-normal">Rank</th>
                  <th className="text-left px-4 py-2 font-normal">Name</th>
                  <th className="px-3 py-2 font-normal text-right font-bold">Total</th>
                  <th className="px-3 py-2 font-normal text-right hidden md:table-cell">R32</th>
                  <th className="px-3 py-2 font-normal text-right hidden md:table-cell">R16</th>
                  <th className="px-3 py-2 font-normal text-right hidden md:table-cell">QF</th>
                  <th className="px-3 py-2 font-normal text-right hidden md:table-cell">SF</th>
                  <th className="px-3 py-2 font-normal text-right hidden md:table-cell">3rd</th>
                  <th className="px-3 py-2 font-normal text-right hidden md:table-cell">F</th>
                  <th className="px-3 py-2 font-normal text-right hidden sm:table-cell">
                    Correct
                  </th>
                  <th className="px-3 py-2 font-normal text-right">
                    Champion
                  </th>
                  <th className="px-3 py-2 font-normal text-right hidden sm:table-cell">
                    Tiebreaker
                  </th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, i) => {
                  const isMe = user?.id === entry.userId;
                  const rnd = (stage: string) =>
                    afterDeadline ? (entry.roundPoints[stage] ?? 0) || "·" : "—";
                  return (
                    <tr
                      key={entry.userId}
                      className={`border-b border-border/50 last:border-0 ${isMe ? "bg-gold/10" : ""}`}
                    >
                      <td className="px-4 py-2 font-mono text-chalk/40 text-center w-12">
                        {ranks[i]}
                      </td>
                      <td className="px-4 py-2">
                        {picksRevealed ? (
                          <Link
                            href={`/predict/${entry.userId}`}
                            className="text-chalk hover:text-gold transition-colors font-bold"
                          >
                            {entry.displayName}
                            {isMe && (
                              <span className="text-gold text-xs ml-1">(you)</span>
                            )}
                          </Link>
                        ) : (
                          <span className={`font-bold ${isMe ? "text-gold" : "text-chalk"}`}>
                            {entry.displayName}
                            {isMe && (
                              <span className="text-gold text-xs ml-1">(you)</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-chalk">
                        {afterDeadline ? entry.score : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-chalk/50 hidden md:table-cell">{rnd("round_of_32")}</td>
                      <td className="px-3 py-2 text-right font-mono text-chalk/50 hidden md:table-cell">{rnd("round_of_16")}</td>
                      <td className="px-3 py-2 text-right font-mono text-chalk/50 hidden md:table-cell">{rnd("quarterfinal")}</td>
                      <td className="px-3 py-2 text-right font-mono text-chalk/50 hidden md:table-cell">{rnd("semifinal")}</td>
                      <td className="px-3 py-2 text-right font-mono text-chalk/50 hidden md:table-cell">{rnd("third_place")}</td>
                      <td className="px-3 py-2 text-right font-mono text-chalk/50 hidden md:table-cell">{rnd("final")}</td>
                      <td className="px-3 py-2 text-right font-mono text-chalk/50 hidden sm:table-cell">
                        {afterDeadline
                          ? `${entry.correctPicks}/${completedMatchCount}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-chalk/50">
                        {picksRevealed || isMe
                          ? entry.championPick
                            ? `${entry.championPick.flag_emoji} ${entry.championPick.code}`
                            : "—"
                          : "🔒"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-chalk/50 hidden sm:table-cell">
                        {picksRevealed || isMe
                          ? (entry.tiebreakerGuess ?? "—")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* Actual tournament goals, for tiebreaker transparency */}
        <div className="card mb-6 bg-surface/50">
          <p className="text-chalk/50 text-sm">
            {tournamentComplete ? (
              <>Final knockout-stage total: <span className="text-gold font-mono font-bold">{actualTotalGoals}</span> goals (knockout stage only, regulation + extra time, excludes penalty shootouts).</>
            ) : (
              <>Knockout-stage goals so far: <span className="text-gold font-mono font-bold">{actualTotalGoals}</span> (knockout stage only, regulation + extra time, excludes penalty shootouts) — the tiebreaker is decided by the closest guess once the tournament ends.</>
            )}
          </p>
        </div>

        {/* Commissioner-only: who has/hasn't finished their picks */}
        {isCommissioner && (
          <div className="card p-0 overflow-hidden mb-8">
            <div className="px-4 py-2 border-b border-border bg-surface/50">
              <span className="text-gold font-bold font-mono text-sm uppercase tracking-widest">
                Pick Completion (Commissioner)
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-chalk/30 text-xs font-mono border-b border-border">
                  <th className="text-left px-4 py-2 font-normal">Name</th>
                  <th className="px-3 py-2 font-normal text-right">Picks</th>
                  <th className="px-3 py-2 font-normal text-right">Tiebreaker</th>
                  <th className="px-3 py-2 font-normal text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {pickStatus.map((p) => (
                  <tr key={p.userId} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2 text-chalk">{p.displayName}</td>
                    <td className="px-3 py-2 text-right font-mono text-chalk/50">
                      {p.picksMade}/{totalExpectedPicks}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-chalk/50">
                      {p.hasTiebreaker ? "✓" : "✗"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {p.complete ? (
                        <span className="text-xs font-bold uppercase tracking-widest text-green-400 border border-green-500/40 rounded px-2 py-0.5">
                          Complete
                        </span>
                      ) : (
                        <span className="text-xs font-bold uppercase tracking-widest text-red-400 border border-red-500/40 rounded px-2 py-0.5">
                          Incomplete
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
