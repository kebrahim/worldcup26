import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
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

  const teams: Record<string, { name: string; tla: string; group: string }> = {};
  for (const m of matches ?? []) {
    const group = m.group ? m.group.replace("GROUP_", "") : "";
    const h = m.homeTeam;
    const a = m.awayTeam;
    if (h?.tla) teams[h.tla] = { name: h.name, tla: h.tla, group };
    if (a?.tla) teams[a.tla] = { name: a.name, tla: a.tla, group };
  }

  const { data: dbTeams } = await admin.from("teams").select("id, code, name");
  const dbCodeMap = Object.fromEntries((dbTeams ?? []).map((t) => [t.code, t]));

  const searchParam = new URL(request.url).searchParams.get("search");
  const matchingRawMatches = searchParam
    ? (matches ?? []).filter((m: { homeTeam?: { name?: string }; awayTeam?: { name?: string } }) =>
        [m.homeTeam?.name, m.awayTeam?.name].some((n) =>
          n?.toLowerCase().includes(searchParam.toLowerCase())
        )
      )
    : [];

  const stageBreakdown: Record<string, { total: number; determined: number; tbd: number }> = {};
  for (const m of matches ?? []) {
    const key = m.stage ?? "UNKNOWN";
    if (!stageBreakdown[key]) stageBreakdown[key] = { total: 0, determined: 0, tbd: 0 };
    stageBreakdown[key].total++;
    if (m.homeTeam?.tla && m.awayTeam?.tla) stageBreakdown[key].determined++;
    else stageBreakdown[key].tbd++;
  }

  const round32Matches = (matches ?? [])
    .filter((m: { stage?: string }) => m.stage === "ROUND_OF_32" || m.stage === "LAST_32")
    .map((m: { id: number; homeTeam?: { name?: string }; awayTeam?: { name?: string }; status: string }) => ({
      id: m.id,
      home: m.homeTeam?.name ?? "TBD",
      away: m.awayTeam?.name ?? "TBD",
      status: m.status,
    }));

  return NextResponse.json({
    totalTeams: Object.keys(teams).length,
    teams: Object.values(teams).sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name)),
    codeMismatches: Object.values(teams).filter((t) => !dbCodeMap[t.tla]),
    matchingRawMatches,
    stageBreakdown,
    round32Matches,
  });
}
