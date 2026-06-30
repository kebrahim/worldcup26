import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect, notFound } from "next/navigation";
import MatchList from "./MatchList";

export const revalidate = 60;

const STAGE_LABELS: Record<string, string> = {
  group: "Group Stage",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  final: "Final",
};

export default async function CountryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hideOwner?: string }>;
}) {
  const { id } = await params;
  const { hideOwner } = await searchParams;
  const teamId = parseInt(id, 10);
  if (isNaN(teamId)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [{ data: team }, { data: matches }, { data: pick }] = await Promise.all([
    admin.from("teams").select("*").eq("id", teamId).single(),
    admin
      .from("matches")
      .select("*, home:home_team_id(id, name, code, flag_emoji), away:away_team_id(id, name, code, flag_emoji)")
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .order("kickoff_utc", { ascending: true }),
    admin
      .from("draft_picks")
      .select("user_id, profiles(display_name)")
      .eq("team_id", teamId)
      .maybeSingle(),
  ]);

  if (!team) notFound();

  // Compute stats from completed matches
  let gf = 0, ga = 0, wins = 0, draws = 0, losses = 0, played = 0;
  for (const m of matches ?? []) {
    if (m.status !== "completed") continue;
    played++;
    const isHome = m.home_team_id === teamId;
    const scored = isHome ? (m.home_score ?? 0) : (m.away_score ?? 0);
    const conceded = isHome ? (m.away_score ?? 0) : (m.home_score ?? 0);
    gf += scored;
    ga += conceded;
    if (scored > conceded) wins++;
    else if (scored === conceded) draws++;
    else losses++;
  }

  const owner = pick
    ? (Array.isArray(pick.profiles) ? pick.profiles[0] : pick.profiles) as { display_name: string } | null
    : null;

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <a href="/teams" className="text-chalk/40 hover:text-chalk text-sm mb-6 inline-block">← Teams</a>

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <span className="text-6xl">{team.flag_emoji}</span>
          <div>
            <h1 className="text-3xl font-bold text-gold font-display uppercase tracking-wide">{team.name}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-chalk/50 text-sm font-mono">{team.code}</span>
              <span className="text-chalk/30 text-sm">·</span>
              <span className="text-chalk/50 text-sm">Group {team.group_name}</span>
              {!hideOwner && owner && (
                <>
                  <span className="text-chalk/30 text-sm">·</span>
                  <span className="text-chalk/50 text-sm">Drafted by <span className="text-chalk font-semibold">{owner.display_name}</span></span>
                </>
              )}
              {!hideOwner && !pick && (
                <>
                  <span className="text-chalk/30 text-sm">·</span>
                  <span className="text-chalk/30 text-sm italic">Undrafted</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Stats row */}
        {played > 0 && (
          <div className="grid grid-cols-6 gap-3 mb-8">
            {[
              { label: "Played", value: played, color: "text-chalk" },
              { label: "W", value: wins, color: "text-green-400" },
              { label: "D", value: draws, color: "text-chalk/60" },
              { label: "L", value: losses, color: "text-red-400" },
              { label: "GF", value: gf, color: "text-green-400" },
              { label: "GA", value: ga, color: "text-red-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="card text-center py-3">
                <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
                <div className="text-xs text-chalk/40 uppercase tracking-widest mt-1">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Matches */}
        <h2 className="text-sm uppercase tracking-widest text-chalk/50 mb-3">Matches</h2>
        {(matches ?? []).length === 0 ? (
          <div className="card">
            <p className="text-chalk/30 text-sm">No matches scheduled yet.</p>
          </div>
        ) : (
          <MatchList matches={matches ?? []} teamId={teamId} stageLabels={STAGE_LABELS} />
        )}
      </div>
    </main>
  );
}
