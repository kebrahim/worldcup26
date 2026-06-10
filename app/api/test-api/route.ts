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

  const apiKey = process.env.APISPORTS_KEY;
  if (!apiKey) return NextResponse.json({ error: "APISPORTS_KEY not configured" });

  const res = await fetch("https://v3.football.api-sports.io/fixtures?league=1&season=2026", {
    headers: { "x-apisports-key": apiKey },
  });

  if (!res.ok) return NextResponse.json({ error: `API error: ${res.status}` });

  const data = await res.json();
  const fixtures = data.response ?? [];

  const teams: Record<string, { name: string; code: string; group: string }> = {};
  for (const f of fixtures) {
    const group = f.league?.round ?? "";
    const home = f.teams?.home;
    const away = f.teams?.away;
    if (home) teams[home.id] = { name: home.name, code: home.code ?? "", group };
    if (away) teams[away.id] = { name: away.name, code: away.code ?? "", group };
  }

  return NextResponse.json({
    totalFixtures: fixtures.length,
    sampleFixture: fixtures[0],
    teams: Object.values(teams).sort((a, b) => a.group.localeCompare(b.group)),
  });
}
