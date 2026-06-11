"use client";

type Team = { id: number; name: string; code: string; flag_emoji: string } | null;
type Match = {
  id: number;
  kickoff_utc: string | null;
  status: string;
  stage: string;
  group_name: string | null;
  venue: string | null;
  home_team_id: number;
  away_team_id: number;
  home_score: number | null;
  away_score: number | null;
  home_score_pen: number | null;
  away_score_pen: number | null;
  home: Team | Team[];
  away: Team | Team[];
};

export default function MatchList({
  matches,
  teamId,
  stageLabels,
}: {
  matches: Match[];
  teamId: number;
  stageLabels: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-2">
      {matches.map((match) => {
        const home = Array.isArray(match.home) ? match.home[0] : match.home;
        const away = Array.isArray(match.away) ? match.away[0] : match.away;
        const isHome = match.home_team_id === teamId;
        const opponent = isHome ? away : home;
        const myScore = isHome ? match.home_score : match.away_score;
        const oppScore = isHome ? match.away_score : match.home_score;

        let resultColor = "text-chalk/50";
        let resultLabel = "";
        if (match.status === "completed") {
          if (myScore! > oppScore!) { resultColor = "text-green-400"; resultLabel = "W"; }
          else if (myScore! < oppScore!) { resultColor = "text-red-400"; resultLabel = "L"; }
          else { resultColor = "text-chalk/50"; resultLabel = "D"; }
        }

        const kickoff = match.kickoff_utc
          ? new Date(match.kickoff_utc).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
            " · " +
            new Date(match.kickoff_utc).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
          : "TBD";

        const stageLabel = match.stage === "group" && match.group_name
          ? `Group ${match.group_name}`
          : stageLabels[match.stage] ?? match.stage;

        return (
          <div key={match.id} className="card py-3">
            <div className="flex items-center gap-3">
              {/* Result badge */}
              <div className={`w-6 text-center font-bold font-mono text-sm ${resultColor}`}>
                {resultLabel || "–"}
              </div>

              {/* Opponent */}
              <a href={opponent?.id ? `/country/${opponent.id}` : undefined} className="flex items-center gap-2 flex-1 hover:opacity-80 transition-opacity">
                <span className="text-xl">{opponent?.flag_emoji}</span>
                <div>
                  <div className="font-bold text-chalk text-sm">
                    {isHome ? "vs" : "@"} {opponent?.name ?? "TBD"}
                  </div>
                  <div className="text-xs text-chalk/40">{stageLabel}</div>
                </div>
              </a>

              {/* Score or time */}
              <div className="text-right">
                {match.status === "completed" ? (
                  <div className="font-mono font-bold text-chalk">
                    {myScore} – {oppScore}
                    {match.home_score_pen != null && (
                      <div className="text-xs text-chalk/40">
                        ({isHome ? match.home_score_pen : match.away_score_pen}–
                        {isHome ? match.away_score_pen : match.home_score_pen} pens)
                      </div>
                    )}
                  </div>
                ) : match.status === "live" ? (
                  <div className="text-gold font-bold text-sm animate-pulse">LIVE</div>
                ) : (
                  <div className="text-chalk/40 text-xs font-mono">{kickoff}</div>
                )}
              </div>
            </div>

            {match.venue && (
              <div className="text-xs text-chalk/20 mt-2 pl-9">{match.venue}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
