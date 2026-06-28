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

  const [{ data: profiles }, { data: picks }, { data: tiebreakers }] =
    await Promise.all([
      admin.from("profiles").select("id, display_name"),
      admin
        .from("bracket_picks")
        .select(
          "user_id, match_id, predicted_winner_team_id, match:match_id(id, stage, winner_team_id, status), team:predicted_winner_team_id(id, name, code, flag_emoji)"
        ),
      admin.from("bracket_tiebreaker").select("user_id, predicted_total_goals"),
    ]);

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
    { score: number; correct: number; total: number }
  > = {};
  const championByUser: Record<string, Team> = {};
  for (const pick of (picks as unknown as BracketPick[]) ?? []) {
    if (!scoresByUser[pick.user_id]) {
      scoresByUser[pick.user_id] = { score: 0, correct: 0, total: 0 };
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
    })
  );

  leaderboard.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tiebreaker: closer to some reasonable number — just sort by guess ascending as secondary
    return (a.tiebreakerGuess ?? 999) - (b.tiebreakerGuess ?? 999);
  });

  const userHasPicks = user ? participantIds.has(user.id) : false;

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
            <div className="px-4 py-2 border-b border-border bg-surface/50">
              <span className="text-gold font-bold font-mono text-sm uppercase tracking-widest">
                Leaderboard
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-chalk/30 text-xs font-mono border-b border-border">
                  <th className="text-left px-4 py-2 font-normal">Rank</th>
                  <th className="text-left px-4 py-2 font-normal">Name</th>
                  <th className="px-3 py-2 font-normal text-right">Score</th>
                  <th className="px-3 py-2 font-normal text-right hidden sm:table-cell">
                    Correct
                  </th>
                  <th className="px-3 py-2 font-normal text-right">
                    Champion Pick
                  </th>
                  <th className="px-3 py-2 font-normal text-right hidden sm:table-cell">
                    Tiebreaker
                  </th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, i) => {
                  const isMe = user?.id === entry.userId;
                  return (
                    <tr
                      key={entry.userId}
                      className={`border-b border-border/50 last:border-0 ${isMe ? "bg-gold/10" : ""}`}
                    >
                      <td className="px-4 py-2 font-mono text-chalk/40 text-center w-12">
                        {i + 1}
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
                      <td className="px-3 py-2 text-right font-mono text-chalk/50 hidden sm:table-cell">
                        {afterDeadline
                          ? `${entry.correctPicks}/${entry.totalPicks}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-chalk/50">
                        {picksRevealed
                          ? entry.championPick
                            ? `${entry.championPick.flag_emoji} ${entry.championPick.code}`
                            : "—"
                          : "🔒"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-chalk/50 hidden sm:table-cell">
                        {picksRevealed
                          ? (entry.tiebreakerGuess ?? "—")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* View all brackets after deadline (or always, for the commissioner) */}
        {picksRevealed && leaderboard.length > 0 && (
          <div className="card">
            <h2 className="text-xs uppercase tracking-widest text-chalk/40 font-mono mb-3">
              All Brackets
            </h2>
            <div className="flex flex-col gap-1">
              {leaderboard.map((entry) => (
                <Link
                  key={entry.userId}
                  href={`/predict/${entry.userId}`}
                  className="flex items-center justify-between py-2 px-1 hover:bg-white/5 rounded transition-colors"
                >
                  <span className="text-chalk hover:text-gold transition-colors">
                    {entry.displayName}
                  </span>
                  <span className="text-chalk/40 font-mono text-sm">
                    {entry.score} pts
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
