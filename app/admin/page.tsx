import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import AdminPanel from "./AdminPanel";

export const revalidate = 0;

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_commissioner")
    .eq("id", user.id)
    .single();

  if (!profile?.is_commissioner) redirect("/");

  const admin = createAdminClient();

  const [{ data: sessions }, { data: picks }, { data: players }, { data: syncSetting }] = await Promise.all([
    admin.from("draft_sessions").select("*").order("created_at", { ascending: false }),
    admin.from("draft_picks")
      .select("*, profiles(display_name), teams(name, code, flag_emoji)")
      .order("pick_number", { ascending: false })
      .limit(20),
    admin.from("profiles").select("id, display_name, email"),
    admin.from("app_settings").select("value").eq("key", "last_sync_at").maybeSingle(),
  ]);

  return (
    <AdminPanel
      sessions={sessions ?? []}
      recentPicks={picks ?? []}
      players={players ?? []}
      lastSyncAt={syncSetting?.value ?? null}
    />
  );
}
