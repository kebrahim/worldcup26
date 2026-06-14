"use client";

import { useState } from "react";
import Link from "next/link";

const ROUNDS: { key: string; label: string }[] = [
  { key: "round_of_32", label: "Round of 32" },
  { key: "round_of_16", label: "Round of 16" },
  { key: "quarterfinal", label: "Quarterfinals" },
  { key: "semifinal", label: "Semifinals" },
  { key: "final", label: "Final" },
];

type Team = { id: number; name: string; code: string; flag_emoji: string };

type Match = {
  id: number;
  stage: string;
  kickoff_utc: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  winner_team_id: number | null;
  status: string;
  home: Team | null;
  away: Team | null;
};

type Props = {
  matches: Match[];
  existingPicks: Record<number, number>;
  existingTiebreaker: number | null;
};

export default function PickClient({ matches, existingPicks, existingTiebreaker }: Props) {
  const [picks, setPicks] = useState<Record<number, number>>(existingPicks);
  const [tiebreaker, setTiebreaker] = useState<string>(
    existingTiebreaker != null ? String(existingTiebreaker) : ""
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byRound: Record<string, Match[]> = {};
  for (const m of matches) {
    if (!byRound[m.stage]) byRound[m.stage] = [];
    byRound[m.stage]!.push(m);
  }

  function selectWinner(matchId: number, teamId: number) {
    setPicks((prev) => ({ ...prev, [matchId]: teamId }));
    setSaved(false);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);

    const picksArray = Object.entries(picks).map(([matchId, teamId]) => ({
      matchId: Number(matchId),
      teamId,
    }));

    const totalGoals = tiebreaker === "" ? null : Number(tiebreaker);

    try {
      const res = await fetch("/api/predict/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picks: picksArray, totalGoals }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to save picks.");
      } else {
        setSaved(true);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  const totalMatches = matches.length;
  const pickedCount = Object.keys(picks).length;

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <a href="/predict" className="text-chalk/40 hover:text-chalk text-sm mb-6 inline-block">
          ← Leaderboard
        </a>
        <h1 className="text-3xl font-bold text-gold font-display uppercase tracking-wide mb-2">
          Bracket Prediction Contest
        </h1>

        {/* Sub-nav */}
        <div className="flex gap-4 mb-8 border-b border-border pb-3">
          <Link
            href="/predict"
            className="text-chalk/40 hover:text-chalk text-sm pb-3 -mb-3"
          >
            Leaderboard
          </Link>
          <span className="text-gold font-bold text-sm border-b-2 border-gold pb-3 -mb-3">
            My Bracket
          </span>
        </div>

        <div className="card mb-6 bg-gold/5 border-gold/30">
          <p className="text-chalk text-sm font-bold mb-1">Bracket not yet finalized</p>
          <p className="text-chalk/60 text-sm">
            The knockout bracket will be set once the group stage is complete. Come back on June 27 to make your picks.
          </p>
        </div>

        <p className="text-chalk/40 text-sm mb-6">
          {pickedCount} of {totalMatches} matches picked
        </p>

        <div className="flex flex-col gap-10">
          {ROUNDS.map(({ key, label }) => {
            const roundMatches = byRound[key] ?? [];
            if (roundMatches.length === 0) return null;
            return (
              <div key={key}>
                <h2 className="text-xs uppercase tracking-widest text-chalk/40 font-mono mb-3">
                  {label}
                </h2>
                <div className="flex flex-col gap-2">
                  {roundMatches.map((match) => {
                    const home = match.home;
                    const away = match.away;
                    const selectedId = picks[match.id];

                    return (
                      <div key={match.id} className="card py-3">
                        <div className="flex items-center gap-2">
                          {/* Home team */}
                          <button
                            type="button"
                            disabled={!home}
                            onClick={() => home && selectWinner(match.id, home.id)}
                            className={`flex items-center gap-2 flex-1 rounded px-2 py-1 text-left transition-all ${
                              home
                                ? selectedId === home.id
                                  ? "bg-gold/20 border border-gold text-gold"
                                  : "hover:bg-white/5 border border-transparent text-chalk"
                                : "opacity-30 cursor-not-allowed border border-transparent text-chalk"
                            }`}
                          >
                            <span className="text-xl">{home?.flag_emoji ?? "🏳️"}</span>
                            <div>
                              <div className="font-bold text-sm">{home?.code ?? "TBD"}</div>
                              <div className="text-xs text-chalk/40 hidden sm:block">
                                {home?.name}
                              </div>
                            </div>
                          </button>

                          {/* vs divider */}
                          <div className="text-chalk/20 font-mono text-xs min-w-[32px] text-center">
                            {match.kickoff_utc
                              ? new Date(match.kickoff_utc).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })
                              : "vs"}
                          </div>

                          {/* Away team */}
                          <button
                            type="button"
                            disabled={!away}
                            onClick={() => away && selectWinner(match.id, away.id)}
                            className={`flex items-center gap-2 flex-1 justify-end rounded px-2 py-1 text-right transition-all ${
                              away
                                ? selectedId === away.id
                                  ? "bg-gold/20 border border-gold text-gold"
                                  : "hover:bg-white/5 border border-transparent text-chalk"
                                : "opacity-30 cursor-not-allowed border border-transparent text-chalk"
                            }`}
                          >
                            <div>
                              <div className="font-bold text-sm">{away?.code ?? "TBD"}</div>
                              <div className="text-xs text-chalk/40 hidden sm:block">
                                {away?.name}
                              </div>
                            </div>
                            <span className="text-xl">{away?.flag_emoji ?? "🏳️"}</span>
                          </button>
                        </div>

                        {selectedId && (
                          <p className="text-xs text-gold/60 mt-1 px-1">
                            ✓ Picked:{" "}
                            {selectedId === home?.id ? home?.code : away?.code}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Tiebreaker */}
        <div className="card mt-10">
          <h2 className="text-xs uppercase tracking-widest text-chalk/40 font-mono mb-3">
            Tiebreaker
          </h2>
          <p className="text-chalk/60 text-sm mb-3">
            Predict the total number of goals scored in the entire tournament.
          </p>
          <input
            type="number"
            min={0}
            max={999}
            value={tiebreaker}
            onChange={(e) => {
              setTiebreaker(e.target.value);
              setSaved(false);
              setError(null);
            }}
            placeholder="e.g. 142"
            className="bg-surface border border-border rounded px-3 py-2 text-chalk font-mono w-32 focus:outline-none focus:border-gold"
          />
        </div>

        {/* Save button */}
        <div className="mt-8 flex items-center gap-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-gold text-black font-bold px-6 py-3 rounded hover:bg-gold/80 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Picks"}
          </button>

          {saved && (
            <p className="text-green-400 text-sm">
              ✓ Picks saved!
            </p>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
      </div>
    </main>
  );
}
