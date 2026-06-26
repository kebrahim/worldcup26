import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import ScheduleClient from "./ScheduleClient";
import SyncTime from "@/components/SyncTime";

export const revalidate = 60;

export default async function SchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [{ data: matches }, { data: myPicks }, { data: allPicks }, { data: syncSetting }] = await Promise.all([
    admin
      .from("matches")
      .select("*, home:home_team_id(id, name, code, flag_emoji), away:away_team_id(id, name, code, flag_emoji)")
      .order("kickoff_utc", { ascending: true }),
    admin
      .from("draft_picks")
      .select("team_id")
      .eq("user_id", user.id),
    admin
      .from("draft_picks")
      .select("team_id, profiles(display_name), draft_sessions!inner(stage)")
      .eq("draft_sessions.stage", "group_stage"),
    admin.from("app_settings").select("value").eq("key", "last_sync_at").maybeSingle(),
  ]);

  const myTeamIds = (myPicks ?? []).map((p) => p.team_id);

  // Map team_id → owner display_name
  const teamOwners: Record<number, string> = {};
  for (const pick of allPicks ?? []) {
    const name = Array.isArray(pick.profiles) ? pick.profiles[0]?.display_name : (pick.profiles as { display_name: string } | null)?.display_name;
    if (name) teamOwners[pick.team_id] = name;
  }

  const lastSyncAt = syncSetting?.value ?? null;

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <a href="/" className="text-chalk/40 hover:text-chalk text-sm mb-6 inline-block">← Home</a>
        <h1 className="text-3xl font-bold text-gold font-display uppercase tracking-wide mb-2">Schedule</h1>
        <p className="text-chalk/40 text-sm mb-6">All matches — your teams are highlighted</p>
        {lastSyncAt && (
          <p className="text-chalk/30 text-xs mb-6 font-mono">
            Results last synced: <SyncTime value={lastSyncAt} />
          </p>
        )}
        <ScheduleClient matches={matches ?? []} myTeamIds={myTeamIds} teamOwners={teamOwners} />
      </div>
    </main>
  );
}
