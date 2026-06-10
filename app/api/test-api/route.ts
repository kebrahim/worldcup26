import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("is_commissioner").eq("id", user.id).single();
  if (!profile?.is_commissioner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = process.env.WC2026_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "WC2026_API_KEY not configured" });

  const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
    headers: { "X-Auth-Token": apiKey },
  });

  if (!res.ok) return NextResponse.json({ error: `API error: ${res.status}` });

  const { matches } = await res.json();

  const teams: Record<string, { name: string; tla: string }> = {};
  for (const m of matches ?? []) {
    const h = m.homeTeam;
    const a = m.awayTeam;
    if (h?.tla) teams[h.tla] = { name: h.name, tla: h.tla };
    if (a?.tla) teams[a.tla] = { name: a.name, tla: a.tla };
  }

  return NextResponse.json({
    totalTeams: Object.keys(teams).length,
    teams: Object.values(teams).sort((a, b) => a.name.localeCompare(b.name)),
  });
}
