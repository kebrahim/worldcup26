"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

type Team = { id: number; name: string; code: string; group_name: string; flag_emoji: string };
type Pick = { pick_number: number; team_id: number; user_id: string; profiles: { display_name: string }; teams: { name: string; code: string; flag_emoji: string } };
type Player = { id: string; display_name: string };
type Session = { id: string; stage: string; status: string; current_pick_index: number; current_round: number; snake_order: string[]; total_rounds: number };

interface Props {
  session: Session | null;
  teams: Team[];
  picks: Pick[];
  players: Player[];
  currentUserId: string | null;
  myUserId: string | null;
  pickedTeamIds: number[];
}

export default function DraftBoard({ session, teams, picks, players, currentUserId, myUserId, pickedTeamIds: initialPickedIds }: Props) {
  const [pickedTeamIds] = useState(new Set(initialPickedIds));
  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmTeam, setConfirmTeam] = useState<Team | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel("draft-picks")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "draft_picks", filter: `session_id=eq.${session.id}` },
        () => { router.refresh(); }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "draft_sessions", filter: `id=eq.${session.id}` },
        () => { router.refresh(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, supabase, router]);

  async function confirmPick() {
    if (!confirmTeam) return;
    setError(null);
    setLoading(true);
    setConfirmTeam(null);
    const res = await fetch("/api/draft/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: confirmTeam.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to pick");
    } else {
      router.refresh();
    }
    setLoading(false);
  }

  const playerMap = Object.fromEntries(players.map((p) => [p.id, p.display_name]));
  const isMyTurn = myUserId === currentUserId;
  const filteredTeams = groupFilter === "ALL" ? teams : teams.filter((t) => t.group_name === groupFilter);

  if (!session) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <a href="/" className="text-chalk/40 hover:text-chalk text-sm mb-6 inline-block">← Home</a>
          <h1 className="text-3xl font-bold text-gold font-display uppercase tracking-wide mb-4">Draft Board</h1>
          <div className="card">
            <p className="text-chalk/60">No active draft session. The commissioner needs to start the draft from the Admin panel.</p>
          </div>
        </div>
      </main>
    );
  }

  const totalPicks = 45;
  const picksMade = picks.length;
  const progressPct = Math.round((picksMade / totalPicks) * 100);

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <a href="/" className="text-chalk/40 hover:text-chalk text-sm mb-6 inline-block">← Home</a>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gold font-display uppercase tracking-wide">
              World Cup Draft
            </h1>
            <p className="text-chalk/50 text-sm mt-1">
              Pick {picksMade + 1} of {totalPicks} · Round {session.current_round} of {session.total_rounds}
            </p>
          </div>
          <div className="text-right">
            {isMyTurn ? (
              <div className="text-gold font-bold animate-pulse">YOUR TURN TO PICK</div>
            ) : (
              <div className="text-chalk/60 text-sm">
                On the clock: <span className="text-chalk font-bold">{playerMap[currentUserId ?? ""] ?? "—"}</span>
              </div>
            )}
          </div>
        </div>

        <div className="w-full bg-surface border border-border rounded h-2 mb-6">
          <div className="bg-gold h-2 rounded transition-all" style={{ width: `${progressPct}%` }} />
        </div>

        <div className="flex gap-2 flex-wrap mb-6">
          {session.snake_order.map((uid, i) => (
            <div key={uid} className={`text-xs px-2 py-1 rounded border font-mono ${uid === currentUserId ? "border-gold text-gold" : "border-border text-chalk/40"}`}>
              {i + 1}. {playerMap[uid] ?? uid.slice(0, 6)}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="flex gap-1 flex-wrap mb-4">
              {["ALL", ...GROUPS].map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupFilter(g)}
                  className={`text-xs px-2 py-1 rounded border font-mono transition-colors ${groupFilter === g ? "bg-gold text-bg border-gold font-bold" : "border-border text-chalk/50 hover:text-chalk"}`}
                >
                  {g}
                </button>
              ))}
            </div>

            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filteredTeams.map((team) => {
                const isPicked = pickedTeamIds.has(team.id);
                const canPick = isMyTurn && !isPicked && !loading;
                return (
                  <button
                    key={team.id}
                    disabled={!canPick}
                    onClick={() => canPick && setConfirmTeam(team)}
                    className={`p-2 rounded border text-left transition-colors ${
                      isPicked
                        ? "border-border bg-surface opacity-40 cursor-not-allowed"
                        : canPick
                        ? "border-gold/50 hover:border-gold hover:bg-gold/10 cursor-pointer"
                        : "border-border cursor-not-allowed"
                    }`}
                  >
                    <div className="text-xl">{team.flag_emoji}</div>
                    <div className={`text-sm font-bold mt-1 leading-tight ${isPicked ? "text-chalk/30" : "text-chalk"}`}>{team.name}</div>
                    <div className={`text-xs mt-0.5 ${isPicked ? "text-chalk/20" : "text-chalk/50"}`}>Grp {team.group_name}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="text-sm uppercase tracking-widest text-chalk/50 mb-3">Recent Picks</h2>
            <div className="flex flex-col gap-2">
              {picks.slice().reverse().slice(0, 15).map((pick) => (
                <div key={pick.pick_number} className="card py-2 px-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-chalk/40 font-mono">#{pick.pick_number}</span>
                    <span className="text-xs text-chalk/60">{pick.profiles?.display_name}</span>
                  </div>
                  <div className="text-sm font-bold text-chalk mt-0.5">
                    {pick.teams?.flag_emoji} {pick.teams?.name}
                  </div>
                </div>
              ))}
              {picks.length === 0 && (
                <p className="text-chalk/30 text-sm">No picks yet</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmTeam && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-lg p-6 max-w-sm w-full" style={{ borderLeftColor: "#e8b820", borderLeftWidth: 3 }}>
            <div className="text-4xl mb-3">{confirmTeam.flag_emoji}</div>
            <h2 className="text-xl font-bold text-chalk mb-1">{confirmTeam.name}</h2>
            <p className="text-chalk/40 text-sm mb-6">Group {confirmTeam.group_name} · Are you sure you want to select this team?</p>
            <div className="flex gap-3">
              <button
                onClick={confirmPick}
                disabled={loading}
                className="flex-1 bg-gold text-bg font-bold py-2 rounded text-sm uppercase tracking-widest hover:bg-gold-light transition-colors disabled:opacity-50"
              >
                {loading ? "Picking..." : "Confirm Pick"}
              </button>
              <button
                onClick={() => setConfirmTeam(null)}
                className="flex-1 border border-border text-chalk/60 hover:text-chalk py-2 rounded text-sm uppercase tracking-widest transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
