import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import ScheduleClient from "./ScheduleClient";

export const revalidate = 60;

export default async function SchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [{ data: matches }, { data: myPicks }] = await Promise.all([
    admin
      .from("matches")
      .select("*, home:home_team_id(id, name, code, flag_emoji), away:away_team_id(id, name, code, flag_emoji)")
      .order("kickoff_utc", { ascending: true }),
    admin
      .from("draft_picks")
      .select("team_id")
      .eq("user_id", user.id),
  ]);

  const myTeamIds = (myPicks ?? []).map((p) => p.team_id);

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <a href="/" className="text-chalk/40 hover:text-chalk text-sm mb-6 inline-block">← Home</a>
        <h1 className="text-3xl font-bold text-gold font-display uppercase tracking-wide mb-2">Schedule</h1>
        <p className="text-chalk/40 text-sm mb-8">All matches — your teams are highlighted</p>
        <ScheduleClient matches={matches ?? []} myTeamIds={myTeamIds} />
      </div>
    </main>
  );
}
