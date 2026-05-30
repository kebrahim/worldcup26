"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { syncScores } from "@/lib/scores";

export async function triggerScoreSync() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_commissioner")
    .eq("id", user.id)
    .single();

  if (!profile?.is_commissioner) return { error: "Forbidden" };

  return await syncScores();
}
