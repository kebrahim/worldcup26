import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, is_commissioner")
    .eq("id", user.id)
    .single();

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
      </div>
    </main>
  );
}
