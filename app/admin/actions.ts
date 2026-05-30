"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function triggerScoreSync() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_commissioner")
    .eq("id", user.id)
    .single();

  if (!profile?.is_commissioner) {
    return { error: "Forbidden" };
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/scores/sync`, {
    method: "POST",
    headers: { "x-sync-secret": process.env.SYNC_SECRET ?? "" },
  });

  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "Sync failed" };
  return { success: true, matchesUpserted: data.matchesUpserted };
}
