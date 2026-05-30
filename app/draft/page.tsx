import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPickOwner } from "@/lib/draft";
import DraftBoard from "./DraftBoard";

export const revalidate = 0;

export default async function DraftPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();

  const [{ data: session }, { data: teams }, { data: picks }, { data: players }] =
    await Promise.all([
      admin.from("draft_sessions").select("*").eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("teams").select("*").order("group_name").order("name"),
      admin.from("draft_picks").select("*, profiles(display_name), teams(name, code, flag_emoji)").order("pick_number"),
      admin.from("profiles").select("id, display_name"),
    ]);

  const currentUserId = session
    ? getPickOwner(session.current_pick_index, session.snake_order)
    : null;

  const pickedTeamIds = new Set((picks ?? []).map((p: { team_id: number }) => p.team_id));

  return (
    <DraftBoard
      session={session}
      teams={teams ?? []}
      picks={picks ?? []}
      players={players ?? []}
      currentUserId={currentUserId}
      myUserId={user?.id ?? null}
      pickedTeamIds={Array.from(pickedTeamIds)}
    />
  );
}
