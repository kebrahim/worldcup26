"use client";

import { useState } from "react";

const CONTESTS = [
  { key: "group_goals_scored", label: "Group Goals", higher: true, unit: "goals" },
  { key: "group_defense", label: "Group Defense", higher: false, unit: "conceded" },
  { key: "group_advancements", label: "Advancements", higher: true, unit: "teams" },
  { key: "knockout_bracket", label: "Knockout Bracket", higher: true, unit: "pts" },
  { key: "knockout_goals", label: "Knockout Goals", higher: true, unit: "goals" },
];

const rankColors = ["text-gold", "text-chalk/70", "text-amber-600", "text-chalk/40", "text-chalk/30"];

type Team = { id: number; name: string; code: string; group_name: string; flag_emoji: string };
type Pick = { team_id: number; teams: Team };
type ContestScore = { contest: string; score: number; rank: number | null; contest_points: number };
type PlayerData = {
  id: string;
  display_name: string;
  picks: Pick[];
  contestScores: ContestScore[];
  teamStats: Record<number, { gf: number; ga: number }>;
};

export default function TeamsClient({
  players,
  myUserId,
}: {
  players: PlayerData[];
  myUserId: string | null;
}) {
  const defaultId = myUserId ?? players[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(defaultId);

  const player = players.find((p) => p.id === selectedId) ?? players[0];
  if (!player) return <div className="card"><p className="text-chalk/30 text-sm">No players found.</p></div>;

  const scoreMap = Object.fromEntries(player.contestScores.map((cs) => [cs.contest, cs]));

  return (
    <>
      {/* Player tabs */}
      <div className="flex gap-2 flex-wrap mb-8">
        {players.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedId(p.id)}
            className={`text-sm px-3 py-1.5 rounded border font-mono transition-colors ${
              p.id === selectedId
                ? "bg-gold text-bg border-gold font-bold"
                : "border-border text-chalk/50 hover:text-chalk"
            }`}
          >
            {p.display_name}{p.id === myUserId ? " (you)" : ""}
          </button>
        ))}
      </div>

      {/* Contest scores */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {CONTESTS.map((c) => {
          const cs = scoreMap[c.key];
          return (
            <div key={c.key} className="card text-center">
              <div className="text-chalk/40 text-xs uppercase tracking-widest mb-1">{c.label}</div>
              <div className="text-2xl font-bold font-mono text-chalk">{cs?.score ?? "—"}</div>
              <div className="text-xs text-chalk/30 mb-2">{c.unit}</div>
              {cs && (
                <div className={`text-xs font-bold ${rankColors[(cs.rank ?? 1) - 1] ?? "text-chalk/30"}`}>
                  #{cs.rank} · +{cs.contest_points}pts
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Teams */}
      <h2 className="text-sm uppercase tracking-widest text-chalk/50 mb-3">
        Teams ({player.picks.length}/9)
      </h2>
      {player.picks.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {player.picks.map((pick) => {
            const team = pick.teams;
            const stats = player.teamStats[pick.team_id] ?? { gf: 0, ga: 0 };
            return (
              <div key={pick.team_id} className="card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{team.flag_emoji}</span>
                  <span className="text-xs text-chalk/40 font-mono">Group {team.group_name}</span>
                </div>
                <div className="font-bold text-chalk">{team.name}</div>
                <div className="text-xs text-chalk/40 font-mono mt-1">{team.code}</div>
                <div className="flex gap-4 mt-3 text-sm font-mono">
                  <span className="text-green-400">{stats.gf} GF</span>
                  <span className="text-red-400">{stats.ga} GA</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <p className="text-chalk/30 text-sm">No picks yet.</p>
        </div>
      )}
    </>
  );
}
