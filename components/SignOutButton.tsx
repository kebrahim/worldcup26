"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-chalk/50 hover:text-chalk text-sm border border-border hover:border-chalk/30 px-3 py-1 rounded transition-colors"
    >
      Sign Out
    </button>
  );
}
