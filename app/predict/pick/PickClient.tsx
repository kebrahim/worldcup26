"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const ROUNDS: { key: string; label: string }[] = [
  { key: "round_of_32", label: "Round of 32" },
  { key: "round_of_16", label: "Round of 16" },
  { key: "quarterfinal", label: "Quarterfinals" },
  { key: "semifinal", label: "Semifinals" },
  { key: "final", label: "Final" },
];

// Displayed alongside the main bracket, but derived from the semifinal losers
// rather than slotting into the winner-advancement chain above.
const THIRD_PLACE = { key: "third_place", label: "3rd Place Playoff" };

const DISPLAY_ROUNDS = [...ROUNDS.slice(0, 4), THIRD_PLACE, ROUNDS[4]];

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
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Group real matches by round, sorted by id so bracket pairing (winner of slot 2i
  // plays winner of slot 2i+1 in the next round) is stable across renders.
  const sortedRounds: Record<string, Match[]> = {};
  for (const { key } of DISPLAY_ROUNDS) {
    sortedRounds[key] = matches
      .filter((m) => m.stage === key)
      .slice()
      .sort((a, b) => a.id - b.id);
  }

  // Every team that has ever appeared as a home/away side anywhere in the bracket.
  const teamMap: Record<number, Team> = {};
  for (const m of matches) {
    if (m.home) teamMap[m.home.id] = m.home;
    if (m.away) teamMap[m.away.id] = m.away;
  }

  // Walk the rounds in order, deriving each match's effective home/away from the
  // (real or predicted) winners of the previous round, and each match's winner
  // from the user's pick — but only if that pick is still valid for the current
  // matchup (a pick becomes stale if an earlier-round selection changes).
  const effective: Record<number, { home: Team | null; away: Team | null }> = {};
  const winners: Record<number, Team | null> = {};

  function computeWinner(m: Match, eff: { home: Team | null; away: Team | null }): Team | null {
    if (m.status === "completed" && m.winner_team_id) {
      return teamMap[m.winner_team_id] ?? null;
    }
    const pickedId = picks[m.id];
    if (pickedId && (eff.home?.id === pickedId || eff.away?.id === pickedId)) {
      return teamMap[pickedId] ?? null;
    }
    return null;
  }

  for (const r32 of sortedRounds.round_of_32) {
    effective[r32.id] = { home: r32.home, away: r32.away };
  }

  for (let i = 1; i < ROUNDS.length; i++) {
    const prev = sortedRounds[ROUNDS[i - 1].key];
    const curr = sortedRounds[ROUNDS[i].key];
    for (const m of prev) {
      winners[m.id] = computeWinner(m, effective[m.id]);
    }
    curr.forEach((m, idx) => {
      const a = prev[idx * 2];
      const b = prev[idx * 2 + 1];
      effective[m.id] = {
        home: a ? winners[a.id] ?? null : null,
        away: b ? winners[b.id] ?? null : null,
      };
    });
  }
  // Winners of the final round (no downstream round needs these, but used for
  // validating the displayed selection / save payload below).
  const lastRound = sortedRounds[ROUNDS[ROUNDS.length - 1].key];
  for (const m of lastRound) {
    winners[m.id] = computeWinner(m, effective[m.id]);
  }

  // The 3rd place playoff is contested by the two semifinal losers, not winners —
  // derive its matchup from the same semifinal pairing the final uses.
  function computeLoser(m: Match, eff: { home: Team | null; away: Team | null }): Team | null {
    const winner = winners[m.id];
    if (!winner) return null;
    if (eff.home && eff.home.id !== winner.id) return eff.home;
    if (eff.away && eff.away.id !== winner.id) return eff.away;
    return null;
  }

  const semis = sortedRounds.semifinal;
  (sortedRounds.third_place ?? []).forEach((m, idx) => {
    const a = semis[idx * 2];
    const b = semis[idx * 2 + 1];
    effective[m.id] = {
      home: a ? computeLoser(a, effective[a.id]) : null,
      away: b ? computeLoser(b, effective[b.id]) : null,
    };
  });

  // Only picks that are still consistent with the current bracket state get saved.
  const validPicks: Record<number, number> = {};
  for (const { key } of DISPLAY_ROUNDS) {
    for (const m of sortedRounds[key]) {
      const eff = effective[m.id];
      const pickedId = picks[m.id];
      if (pickedId && eff && (eff.home?.id === pickedId || eff.away?.id === pickedId)) {
        validPicks[m.id] = pickedId;
      }
    }
  }

  function selectWinner(matchId: number, teamId: number) {
    setPicks((prev) => ({ ...prev, [matchId]: teamId }));
    setSaved(false);
    setError(null);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);

    const picksArray = Object.entries(validPicks).map(([matchId, teamId]) => ({
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
        setDirty(false);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  const totalMatches = matches.length;
  const pickedCount = Object.keys(validPicks).length;
  const tiebreakerMissing = tiebreaker === "";
  const picksComplete = pickedCount === totalMatches;
  const bracketComplete = picksComplete && !tiebreakerMissing;

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <a
          href="/predict"
          onClick={(e) => {
            if (dirty && !window.confirm("You have unsaved picks. Leave without saving?")) {
              e.preventDefault();
            }
          }}
          className="text-chalk/40 hover:text-chalk text-sm mb-6 inline-block"
        >
          ← Leaderboard
        </a>
        <h1 className="text-3xl font-bold text-gold font-display uppercase tracking-wide mb-2">
          Bracket Prediction Contest
        </h1>

        {/* Sub-nav */}
        <div className="flex gap-4 mb-8 border-b border-border pb-3">
          <Link
            href="/predict"
            onClick={(e) => {
              if (dirty && !window.confirm("You have unsaved picks. Leave without saving?")) {
                e.preventDefault();
              }
            }}
            className="text-chalk/40 hover:text-chalk text-sm pb-3 -mb-3"
          >
            Leaderboard
          </Link>
          <span className="text-gold font-bold text-sm border-b-2 border-gold pb-3 -mb-3">
            My Bracket
          </span>
        </div>

        <div className="card mb-6 bg-gold/5 border-gold/30">
          <p className="text-chalk text-sm font-bold mb-1">Pick your whole bracket now</p>
          <p className="text-chalk/60 text-sm">
            Picking a winner instantly advances them into the next round below — no need to save between
            rounds. Click <strong>Save Picks</strong> once you&apos;re happy with your full bracket.
          </p>
        </div>

        {dirty && (
          <div className="card mb-6 bg-red-500/5 border-red-500/30">
            <p className="text-red-400 text-sm font-bold">⚠ You have unsaved changes — click Save Picks below before leaving this page.</p>
          </div>
        )}

        <div className="flex items-center gap-2 mb-6">
          <p className="text-chalk/40 text-sm">
            {pickedCount} of {totalMatches} matches picked
          </p>
          {!bracketComplete ? (
            <span className="text-xs font-bold uppercase tracking-widest text-red-400 border border-red-500/40 rounded px-2 py-0.5">
              Incomplete
            </span>
          ) : (
            <span className="text-xs font-bold uppercase tracking-widest text-green-400 border border-green-500/40 rounded px-2 py-0.5">
              Complete
            </span>
          )}
        </div>

        {!bracketComplete && (
          <div className="card mb-6 bg-red-500/5 border-red-500/30">
            <p className="text-red-400 text-sm font-bold mb-1">⚠ Your bracket isn&apos;t complete yet</p>
            <ul className="text-chalk/60 text-sm list-disc list-inside">
              {!picksComplete && (
                <li>{totalMatches - pickedCount} match{totalMatches - pickedCount === 1 ? "" : "es"} still need a winner picked</li>
              )}
              {tiebreakerMissing && <li>Tiebreaker (total tournament goals) is required</li>}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-10">
          {DISPLAY_ROUNDS.map(({ key, label }) => {
            const roundMatches = sortedRounds[key] ?? [];
            if (roundMatches.length === 0) return null;
            return (
              <div key={key}>
                <h2 className="text-xs uppercase tracking-widest text-chalk/40 font-mono mb-3">
                  {label}
                </h2>
                <div className="flex flex-col gap-2">
                  {roundMatches.map((match) => {
                    const eff = effective[match.id] ?? { home: null, away: null };
                    const home = eff.home;
                    const away = eff.away;
                    const rawSelectedId = picks[match.id];
                    const selectedId =
                      rawSelectedId === home?.id || rawSelectedId === away?.id
                        ? rawSelectedId
                        : undefined;

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
                              <div className="text-xs text-chalk/40">
                                {home?.name}
                              </div>
                            </div>
                          </button>

                          {/* vs divider */}
                          <div className="text-chalk/20 font-mono text-xs min-w-[32px] text-center">
                            {key === "round_of_32" && match.kickoff_utc
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
                              <div className="text-xs text-chalk/40">
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
        <div className={`card mt-10 ${tiebreakerMissing ? "border-red-500/40" : ""}`}>
          <h2 className="text-xs uppercase tracking-widest text-chalk/40 font-mono mb-3">
            Tiebreaker <span className="text-red-400">*required</span>
          </h2>
          <p className="text-chalk/60 text-sm mb-3">
            Predict the total number of goals scored in the entire tournament. Your bracket is not
            complete without this.
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
              setDirty(true);
            }}
            placeholder="e.g. 142"
            className={`bg-surface border rounded px-3 py-2 text-chalk font-mono w-32 focus:outline-none focus:border-gold ${
              tiebreakerMissing ? "border-red-500/50" : "border-border"
            }`}
          />
          {tiebreakerMissing && (
            <p className="text-red-400 text-xs mt-2">⚠ Required — your bracket won&apos;t be complete until you enter a guess.</p>
          )}
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

          {saved && bracketComplete && (
            <p className="text-green-400 text-sm">
              ✓ Picks saved — your bracket is complete!
            </p>
          )}
          {saved && !bracketComplete && (
            <p className="text-gold/80 text-sm">
              ✓ Saved, but your bracket is still incomplete — see above.
            </p>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
      </div>
    </main>
  );
}
