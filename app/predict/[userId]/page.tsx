import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect, notFound } from "next/navigation";
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

const ROUNDS: { key: string; label: string }[] = [
  { key: "round_of_32", label: "Round of 32" },
  { key: "round_of_16", label: "Round of 16" },
  { key: "quarterfinal", label: "Quarterfinals" },
  { key: "semifinal", label: "Semifinals" },
  { key: "third_place", label: "3rd Place Playoff" },
  { key: "final", label: "Final" },
];

type Team = { id: number; name: string; code: string; flag_emoji: string };

type PickRow = {
  match_id: number;
  predicted_winner_team_id: number;
  match: {
    id: number;
    stage: string;
    kickoff_utc: string | null;
    winner_team_id: number | null;
    status: string;
    home: Team | null;
    away: Team | null;
  } | null;
};

export default async function UserBracketPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/predict");

  const now = new Date();
  const afterDeadline = now >= DEADLINE;
  const isOwnBracket = user.id === userId;

  const admin = createAdminClient();

  const { data: viewerProfile } = await admin
    .from("profiles")
    .select("is_commissioner")
    .eq("id", user.id)
    .maybeSingle();
  const isCommissioner = viewerProfile?.is_commissioner ?? false;

  // Only allow viewing other people's brackets after the deadline, unless you're the commissioner
  if (!isOwnBracket && !afterDeadline && !isCommissioner) {
    redirect("/predict");
  }

  const [{ data: profile }, { data: rawPicks }, { data: tiebreakerRow }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, display_name")
        .eq("id", userId)
        .maybeSingle(),
      admin
        .from("bracket_picks")
        .select(
          "match_id, predicted_winner_team_id, match:match_id(id, stage, kickoff_utc, winner_team_id, status, home:home_team_id(id, name, code, flag_emoji), away:away_team_id(id, name, code, flag_emoji))"
        )
        .eq("user_id", userId),
      admin
        .from("bracket_tiebreaker")
        .select("predicted_total_goals")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

  if (!profile) notFound();

  const displayName = (profile as { id: string; display_name: string | null }).display_name ?? "Anonymous";
  const tiebreaker = (tiebreakerRow as { predicted_total_goals: number } | null)?.predicted_total_goals ?? null;

  // Normalize picks
  const picks: PickRow[] = ((rawPicks ?? []) as Record<string, unknown>[]).map((p) => {
    const rawMatch = p.match as Record<string, unknown> | Record<string, unknown>[] | null;
    const matchObj = Array.isArray(rawMatch) ? (rawMatch[0] as Record<string, unknown>) : rawMatch;
    const home = matchObj
      ? Array.isArray(matchObj.home)
        ? ((matchObj.home[0] as Team) ?? null)
        : ((matchObj.home as Team) ?? null)
      : null;
    const away = matchObj
      ? Array.isArray(matchObj.away)
        ? ((matchObj.away[0] as Team) ?? null)
        : ((matchObj.away as Team) ?? null)
      : null;
    return {
      match_id: p.match_id as number,
      predicted_winner_team_id: p.predicted_winner_team_id as number,
      match: matchObj
        ? {
            id: matchObj.id as number,
            stage: matchObj.stage as string,
            kickoff_utc: matchObj.kickoff_utc as string | null,
            winner_team_id: matchObj.winner_team_id as number | null,
            status: matchObj.status as string,
            home,
            away,
          }
        : null,
    };
  });

  // Every team that has appeared as a home/away side anywhere in this user's picks —
  // used to resolve the predicted team even for future rounds where the real matchup
  // (and therefore match.home/away) isn't determined yet.
  const teamMap: Record<number, Team> = {};
  for (const p of picks) {
    if (p.match?.home) teamMap[p.match.home.id] = p.match.home;
    if (p.match?.away) teamMap[p.match.away.id] = p.match.away;
  }

  // Group by round
  const byRound: Record<string, PickRow[]> = {};
  for (const p of picks) {
    const stage = p.match?.stage ?? "unknown";
    if (!byRound[stage]) byRound[stage] = [];
    byRound[stage]!.push(p);
  }

  // Calculate score
  let totalScore = 0;
  let correctPicks = 0;
  for (const pick of picks) {
    if (!pick.match) continue;
    if (pick.match.status === "completed" && pick.match.winner_team_id != null) {
      if (pick.predicted_winner_team_id === pick.match.winner_team_id) {
        totalScore += ROUND_POINTS[pick.match.stage] ?? 1;
        correctPicks++;
      }
    }
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/predict" className="text-chalk/40 hover:text-chalk text-sm mb-6 inline-block">
          ← Leaderboard
        </Link>
        <h1 className="text-3xl font-bold text-gold font-display uppercase tracking-wide mb-1">
          {displayName}&apos;s Bracket
        </h1>
        {isOwnBracket && (
          <p className="text-chalk/40 text-sm mb-2">Your bracket</p>
        )}
        {!isOwnBracket && !afterDeadline && isCommissioner && (
          <p className="text-gold/60 text-sm mb-2">🔓 Viewing as commissioner — picks are still locked for other participants.</p>
        )}

        {/* Sub-nav */}
        <div className="flex gap-4 mb-6 border-b border-border pb-3">
          <Link
            href="/predict"
            className="text-chalk/40 hover:text-chalk text-sm pb-3 -mb-3"
          >
            Leaderboard
          </Link>
          {isOwnBracket && (
            <span className="text-gold font-bold text-sm border-b-2 border-gold pb-3 -mb-3">
              My Bracket
            </span>
          )}
        </div>

        {/* Score card */}
        <div className="card mb-8 flex flex-wrap gap-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-chalk/30 font-mono mb-1">
              Score
            </p>
            <p className="text-3xl font-bold font-mono text-gold">{totalScore}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-chalk/30 font-mono mb-1">
              Correct Picks
            </p>
            <p className="text-3xl font-bold font-mono text-chalk">
              {correctPicks}
              <span className="text-chalk/30 text-lg">/{picks.length}</span>
            </p>
          </div>
          {tiebreaker != null && (
            <div>
              <p className="text-xs uppercase tracking-widest text-chalk/30 font-mono mb-1">
                Tiebreaker Guess
              </p>
              <p className="text-3xl font-bold font-mono text-chalk">{tiebreaker}</p>
            </div>
          )}
        </div>

        {picks.length === 0 ? (
          <div className="card">
            <p className="text-chalk/30 text-sm">No picks submitted.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {ROUNDS.map(({ key, label }) => {
              const roundPicks = byRound[key] ?? [];
              if (roundPicks.length === 0) return null;
              return (
                <div key={key}>
                  <h2 className="text-xs uppercase tracking-widest text-chalk/40 font-mono mb-3">
                    {label}
                  </h2>
                  <div className="flex flex-col gap-2">
                    {roundPicks.map((pick) => {
                      const match = pick.match;
                      const home = match?.home ?? null;
                      const away = match?.away ?? null;
                      const predictedId = pick.predicted_winner_team_id;
                      const actualWinnerId = match?.winner_team_id ?? null;
                      const isCompleted = match?.status === "completed";

                      let result: "correct" | "wrong" | "pending" = "pending";
                      if (isCompleted && actualWinnerId != null) {
                        result =
                          predictedId === actualWinnerId ? "correct" : "wrong";
                      }

                      const predictedTeam =
                        predictedId === home?.id
                          ? home
                          : predictedId === away?.id
                          ? away
                          : teamMap[predictedId] ?? null;

                      return (
                        <div
                          key={pick.match_id}
                          className={`card py-3 ${
                            result === "correct"
                              ? "border-l-2 border-l-green-500"
                              : result === "wrong"
                              ? "border-l-2 border-l-red-500"
                              : "border-l-2 border-l-border"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            {/* Home */}
                            <div
                              className={`flex items-center gap-2 flex-1 ${
                                predictedId === home?.id
                                  ? "text-gold"
                                  : "text-chalk/50"
                              }`}
                            >
                              <span className="text-xl">
                                {home?.flag_emoji ?? "🏳️"}
                              </span>
                              <div>
                                <div className="font-bold text-sm">
                                  {home?.code ?? "TBD"}
                                </div>
                                <div className="text-xs text-chalk/30 hidden sm:block">
                                  {home?.name}
                                </div>
                              </div>
                            </div>

                            {/* Center: date + result */}
                            <div className="text-center min-w-[80px]">
                              {match?.kickoff_utc && (
                                <div className="text-chalk/30 font-mono text-xs mb-1">
                                  {new Date(match.kickoff_utc).toLocaleDateString(
                                    "en-US",
                                    { month: "short", day: "numeric" }
                                  )}
                                </div>
                              )}
                              {result === "correct" && (
                                <div className="text-green-400 text-sm font-bold">✓ Correct</div>
                              )}
                              {result === "wrong" && (
                                <div className="text-red-400 text-sm font-bold">✗ Wrong</div>
                              )}
                              {result === "pending" && (
                                <div className="text-chalk/20 text-xs">Pending</div>
                              )}
                            </div>

                            {/* Away */}
                            <div
                              className={`flex items-center gap-2 flex-1 justify-end ${
                                predictedId === away?.id
                                  ? "text-gold"
                                  : "text-chalk/50"
                              }`}
                            >
                              <div className="text-right">
                                <div className="font-bold text-sm">
                                  {away?.code ?? "TBD"}
                                </div>
                                <div className="text-xs text-chalk/30 hidden sm:block">
                                  {away?.name}
                                </div>
                              </div>
                              <span className="text-xl">
                                {away?.flag_emoji ?? "🏳️"}
                              </span>
                            </div>
                          </div>

                          {/* Prediction note */}
                          <div className="mt-1 px-1 flex items-center gap-2">
                            <p className="text-xs text-chalk/30">
                              Pick:{" "}
                              <span className="text-gold/70">
                                {predictedTeam?.flag_emoji ?? ""}{" "}
                                {predictedTeam?.code ?? "Unknown"}
                              </span>
                            </p>
                            {result === "correct" && (
                              <span className="text-xs text-green-400">
                                +{ROUND_POINTS[match?.stage ?? ""] ?? 0} pts
                              </span>
                            )}
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
