"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { triggerScoreSync } from "./actions";

type Session = { id: string; stage: string; status: string; current_pick_index: number; total_rounds: number; snake_order: string[]; created_at: string; completed_at: string | null };
type Pick = { pick_number: number; profiles: { display_name: string }; teams: { name: string; code: string; flag_emoji: string } };
type Player = { id: string; display_name: string; email: string };

interface Props {
  sessions: Session[];
  recentPicks: Pick[];
  players: Player[];
  lastSyncAt: string | null;
}

export default function AdminPanel({ sessions, recentPicks, players, lastSyncAt }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const groupSession = sessions.find((s) => s.stage === "group_stage");

  async function startDraft() {
    setError(null);
    setMessage(null);
    setLoading("group_stage");
    const res = await fetch("/api/draft/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "group_stage" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to start draft");
    } else {
      setMessage("Draft started!");
      router.refresh();
    }
    setLoading(null);
  }

  async function triggerSync() {
    setError(null);
    setMessage(null);
    setLoading("sync");
    const result = await triggerScoreSync();
    if ("error" in result) {
      setError(result.error ?? "Sync failed");
    } else {
      setMessage("Score sync completed.");
      router.refresh();
    }
    setLoading(null);
  }

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      pending: "text-chalk/50 border-chalk/20",
      active: "text-gold border-gold",
      completed: "text-green-400 border-green-400/40",
    };
    return (
      <span className={`text-xs border px-1.5 py-0.5 rounded font-mono uppercase ${colors[status] ?? ""}`}>
        {status}
      </span>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <a href="/" className="text-chalk/40 hover:text-chalk text-sm mb-6 inline-block">← Home</a>
        <h1 className="text-3xl font-bold text-gold font-display uppercase tracking-wide mb-2">Admin</h1>
        <p className="text-chalk/40 text-sm mb-8">Commissioner controls</p>

        {message && <p className="text-green-400 text-sm mb-4">{message}</p>}
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <div className="card mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-chalk font-bold">Draft</h2>
            {groupSession ? statusBadge(groupSession.status) : statusBadge("pending")}
          </div>
          {groupSession ? (
            <div className="text-chalk/50 text-sm space-y-1">
              <div>Pick {groupSession.current_pick_index} / 45</div>
              <div>Round {Math.ceil((groupSession.current_pick_index + 1) / groupSession.snake_order.length)} of {groupSession.total_rounds}</div>
              <div>Started {new Date(groupSession.created_at).toLocaleDateString()}</div>
              {groupSession.completed_at && <div>Completed {new Date(groupSession.completed_at).toLocaleDateString()}</div>}
            </div>
          ) : (
            <p className="text-chalk/40 text-sm mb-3">Not started yet. Starts a snake draft for all {players.length} players.</p>
          )}
          {!groupSession && (
            <button
              onClick={startDraft}
              disabled={loading !== null}
              className="mt-3 w-full bg-gold text-bg font-bold py-2 rounded text-sm uppercase tracking-widest hover:bg-gold-light transition-colors disabled:opacity-50"
            >
              {loading === "group_stage" ? "Starting..." : "Start Draft"}
            </button>
          )}
        </div>

        <div className="card mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-chalk font-bold mb-1">Score Sync</h2>
              <p className="text-chalk/40 text-sm">Fetch latest match results and recalculate all contest scores.</p>
              {lastSyncAt && (
                <p className="text-chalk/30 text-xs mt-1">
                  Last synced: {new Date(lastSyncAt).toLocaleString()}
                </p>
              )}
            </div>
            <button
              onClick={triggerSync}
              disabled={loading !== null}
              className="ml-4 bg-surface border border-border hover:border-gold text-chalk hover:text-gold font-bold py-2 px-4 rounded text-sm uppercase tracking-widest transition-colors disabled:opacity-50"
            >
              {loading === "sync" ? "Syncing..." : "Sync Now"}
            </button>
          </div>
        </div>

        <div className="card mb-8">
          <h2 className="text-chalk font-bold mb-3">Players ({players.length})</h2>
          <div className="flex flex-col gap-2">
            {players.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-chalk">{p.display_name}</span>
                <span className="text-chalk/40 font-mono">{p.email}</span>
              </div>
            ))}
          </div>
        </div>

        {recentPicks.length > 0 && (
          <div className="card">
            <h2 className="text-chalk font-bold mb-3">Recent Picks</h2>
            <div className="flex flex-col gap-2">
              {recentPicks.map((pick) => (
                <div key={pick.pick_number} className="flex items-center justify-between text-sm">
                  <span className="text-chalk/40 font-mono">#{pick.pick_number}</span>
                  <span className="text-chalk">{pick.teams?.flag_emoji} {pick.teams?.name}</span>
                  <span className="text-chalk/50">{pick.profiles?.display_name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
