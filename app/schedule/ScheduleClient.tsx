"use client";

import { useMemo } from "react";

const STAGE_LABELS: Record<string, string> = {
  group: "Group Stage",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  final: "Final",
};

type Team = { id: number; name: string; code: string; flag_emoji: string } | null;
type Match = {
  id: number;
  kickoff_utc: string | null;
  status: string;
  stage: string;
  group_name: string | null;
  venue: string | null;
  home_score: number | null;
  away_score: number | null;
  home_score_pen: number | null;
  away_score_pen: number | null;
  home: Team | Team[];
  away: Team | Team[];
};

export default function ScheduleClient({ matches, myTeamIds: myTeamIdsArr, teamOwners }: { matches: Match[]; myTeamIds: number[]; teamOwners: Record<number, string> }) {
  const myTeamIds = useMemo(() => new Set(myTeamIdsArr), [myTeamIdsArr]);

  const byDate = useMemo(() => {
    const map: Record<string, Match[]> = {};
    for (const match of matches) {
      const date = match.kickoff_utc
        ? new Date(match.kickoff_utc).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
        : "TBD";
      if (!map[date]) map[date] = [];
      map[date]!.push(match);
    }
    return map;
  }, [matches]);

  if (Object.keys(byDate).length === 0) {
    return (
      <div className="card">
        <p className="text-chalk/30 text-sm">No matches yet — scores will populate once the tournament begins.</p>
      </div>
    );
  }

  return (
    <>
      {Object.entries(byDate).map(([date, dayMatches]) => (
        <div key={date} className="mb-8">
          <h2 className="text-xs uppercase tracking-widest text-chalk/40 mb-3 font-mono">{date}</h2>
          <div className="flex flex-col gap-2">
            {dayMatches.map((match) => {
              const home = Array.isArray(match.home) ? match.home[0] : match.home;
              const away = Array.isArray(match.away) ? match.away[0] : match.away;
              const isMyMatch = myTeamIds.has(home?.id ?? -1) || myTeamIds.has(away?.id ?? -1);
              const kickoff = match.kickoff_utc
                ? new Date(match.kickoff_utc).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                : "TBD";

              return (
                <div
                  key={match.id}
                  className={`card py-3 ${isMyMatch ? "border-l-gold-light" : ""}`}
                  style={isMyMatch ? { borderLeftColor: "#f5c842" } : {}}
                >
                  <div className="flex items-center justify-between gap-2">
                    <a href={home?.id ? `/country/${home.id}` : undefined} className={`flex items-center gap-2 flex-1 ${myTeamIds.has(home?.id ?? -1) ? "text-gold" : "text-chalk"} hover:opacity-80 transition-opacity`}>
                      <span className="text-xl">{home?.flag_emoji}</span>
                      <div>
                        <div className="font-bold text-sm">{home?.code ?? "TBD"}</div>
                        <div className="text-xs text-chalk/40 hidden sm:block">{home?.name}</div>
                        {home?.id && teamOwners[home.id] && (
                          <div className="text-xs text-chalk/30 hidden sm:block">{teamOwners[home.id]}</div>
                        )}
                      </div>
                    </a>

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

                    <a href={away?.id ? `/country/${away.id}` : undefined} className={`flex items-center gap-2 flex-1 justify-end ${myTeamIds.has(away?.id ?? -1) ? "text-gold" : "text-chalk"} hover:opacity-80 transition-opacity`}>
                      <div className="text-right">
                        <div className="font-bold text-sm">{away?.code ?? "TBD"}</div>
                        <div className="text-xs text-chalk/40 hidden sm:block">{away?.name}</div>
                        {away?.id && teamOwners[away.id] && (
                          <div className="text-xs text-chalk/30 hidden sm:block">{teamOwners[away.id]}</div>
                        )}
                      </div>
                      <span className="text-xl">{away?.flag_emoji}</span>
                    </a>
                  </div>

                  {match.venue && (
                    <div className="text-xs text-chalk/20 mt-2 text-center">{match.venue}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
