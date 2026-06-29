import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPickOwner } from "@/lib/draft";
import DraftBoard from "./DraftBoard";

export const revalidate = 0;

export default async function DraftPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();

  const [{ data: activeSession }, { data: completedSession }, { data: teams }, { data: picks }, { data: players }, { data: profile }] =
    await Promise.all([
      admin.from("draft_sessions").select("*").eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("draft_sessions").select("*").eq("status", "completed").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("teams").select("*").order("group_name").order("name"),
      admin.from("draft_picks").select("*, profiles(display_name), teams(name, code, flag_emoji, group_name)").order("pick_number"),
      admin.from("profiles").select("id, display_name"),
      user ? admin.from("profiles").select("is_commissioner").eq("id", user.id).single() : Promise.resolve({ data: null }),
    ]);

  const session = activeSession ?? completedSession;

  // Only show actual draft participants (the session's snake order), not every
  // signed-up profile — predict-only signups shouldn't appear on the draft board.
  const draftParticipantIds = new Set(session?.snake_order ?? []);
  const draftPlayers = (players ?? []).filter((p) => draftParticipantIds.has(p.id));

  const currentUserId = activeSession
    ? getPickOwner(activeSession.current_pick_index, activeSession.snake_order)
    : null;

  const pickedTeamIds = new Set((picks ?? []).map((p: { team_id: number }) => p.team_id));

  return (
    <DraftBoard
      session={session}
      teams={teams ?? []}
      picks={picks ?? []}
      players={draftPlayers}
      currentUserId={currentUserId}
      myUserId={user?.id ?? null}
      isCommissioner={profile?.is_commissioner ?? false}
      pickedTeamIds={Array.from(pickedTeamIds)}
    />
  );
}
