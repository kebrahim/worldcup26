"use client";

import { useState } from "react";
import Link from "next/link";

type Contest = { key: string; label: string; desc: string; higher: boolean };
type Row = { user_id: string; score: number; rank: number | null; contest_points: number };

interface Props {
  contests: Contest[];
  byContest: Record<string, Row[]>;
  playerMap: Record<string, string>;
  myUserId: string | undefined;
  rankColors: string[];
}

export default function ContestBreakdown({ contests, byContest, playerMap, myUserId, rankColors }: Props) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set(contests.map((c) => c.key)));

  function expandAll() {
    setOpenKeys(new Set(contests.map((c) => c.key)));
  }
  function collapseAll() {
    setOpenKeys(new Set());
  }
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm uppercase tracking-widest text-chalk/50">Contest Breakdown</h2>
        <div className="flex gap-2 text-xs">
          <button onClick={expandAll} className="text-chalk/50 hover:text-gold transition-colors underline">
            Expand all
          </button>
          <span className="text-chalk/20">·</span>
          <button onClick={collapseAll} className="text-chalk/50 hover:text-gold transition-colors underline">
            Collapse all
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        {contests.map((contest) => {
          const rows = byContest[contest.key] ?? [];
          const allZero = rows.every((r) => r.contest_points === 0);
          const isOpen = openKeys.has(contest.key);
          return (
            <details key={contest.key} className="card group" open={isOpen} onToggle={(e) => {
              const open = (e.target as HTMLDetailsElement).open;
              setOpenKeys((prev) => {
                const next = new Set(prev);
                if (open) next.add(contest.key);
                else next.delete(contest.key);
                return next;
              });
            }}>
              <summary className="cursor-pointer flex items-center justify-between list-none">
                <div>
                  <span className="text-chalk font-bold">{contest.label}</span>
                  <span className="text-chalk/40 text-xs ml-2">{contest.desc}</span>
                </div>
                <span className={`text-chalk/30 text-xs transition-transform ${isOpen ? "rotate-180" : ""}`}>▼</span>
              </summary>
              <div className="mt-4 flex flex-col gap-2">
                {rows.length === 0 ? (
                  <p className="text-chalk/30 text-sm">No data yet.</p>
                ) : allZero ? (
                  <p className="text-chalk/30 text-sm">No points awarded yet — scores are all zero.</p>
                ) : (
                  rows.map((row, i) => (
                    <div
                      key={row.user_id}
                      className={`flex items-center justify-between text-sm ${row.user_id === myUserId ? "text-gold" : "text-chalk"}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`font-mono w-5 ${rankColors[i] ?? "text-chalk/30"}`}>
                          {row.rank != null ? `#${row.rank}` : "—"}
                        </span>
                        <Link href={`/teams?player=${row.user_id}`} className="hover:text-gold transition-colors">
                          {playerMap[row.user_id] ?? "—"}{row.user_id === myUserId && " (you)"}
                        </Link>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-chalk/50 font-mono">{row.score}</span>
                        <span className={`font-mono font-bold ${rankColors[i] ?? "text-chalk/30"}`}>
                          +{row.contest_points}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}
