import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient();

  let [{ data: profile }, { count: draftPickCount }] = await Promise.all([
    supabase.from("profiles").select("display_name, is_commissioner").eq("id", user.id).maybeSingle(),
    admin.from("draft_picks").select("*", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  // Safety net: the on_auth_user_created trigger should always create a profile on
  // signup, but if it ever doesn't (e.g. a transient signup glitch), self-heal here
  // rather than leaving the user stuck without a profile.
  if (!profile) {
    const displayName =
      (user.user_metadata?.display_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "Anonymous";
    const { data: created } = await admin
      .from("profiles")
      .upsert(
        { id: user.id, display_name: displayName, email: user.email ?? "" },
        { onConflict: "id" }
      )
      .select("display_name, is_commissioner")
      .single();
    profile = created;
  }

  if (!draftPickCount) redirect("/predict");

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gold font-display tracking-wide uppercase">
              World Cup 2026
            </h1>
            <p className="text-chalk/50 text-sm mt-1">
              Welcome, {profile?.display_name ?? user.email}
              {profile?.is_commissioner && (
                <span className="ml-2 text-gold text-xs uppercase tracking-widest border border-gold px-1 rounded">
                  Commissioner
                </span>
              )}
            </p>
          </div>
          <SignOutButton />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: "Leaderboard", href: "/leaderboard", desc: "Overall standings" },
            { label: "Schedule", href: "/schedule", desc: "All matches" },
            { label: "Group Standings", href: "/standings", desc: "Group stage tables" },
            { label: "My Teams", href: "/teams", desc: "Your roster & stats" },
            { label: "Bracket", href: "/bracket", desc: "Knockout bracket" },
            { label: "Draft Board", href: "/draft", desc: "Draft results" },
            ...(profile?.is_commissioner
              ? [{ label: "Admin", href: "/admin", desc: "Commissioner controls" }]
              : []),
          ].map((item) => (
            <a key={item.href} href={item.href} className="card hover:border-gold transition-colors group">
              <div className="text-chalk font-bold group-hover:text-gold transition-colors">{item.label}</div>
              <div className="text-chalk/50 text-sm mt-1">{item.desc}</div>
            </a>
          ))}
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <p className="text-xs uppercase tracking-widest text-chalk/30 font-mono mb-3">Separate Contest</p>
          <a href="/predict" className="block w-full card hover:border-chalk/40 transition-colors group border-dashed">
            <div className="text-chalk font-bold group-hover:text-chalk transition-colors">Bracket Prediction Contest</div>
            <div className="text-chalk/50 text-sm mt-1">Pick the knockout bracket winners — open to everyone</div>
          </a>
        </div>
      </div>
    </main>
  );
}
