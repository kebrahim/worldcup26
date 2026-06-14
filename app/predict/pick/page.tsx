import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import PickClient from "./PickClient";

export const revalidate = 0;

const DEADLINE = new Date("2026-06-28T19:00:00Z");

type Team = { id: number; name: string; code: string; flag_emoji: string };

type Match = {
  id: number;
  stage: string;
  kickoff_utc: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  winner_team_id: number | null;
  status: string;
  home: Team | null;
  away: Team | null;
};

type BracketPick = { match_id: number; predicted_winner_team_id: number };
type Tiebreaker = { predicted_total_goals: number };

export default async function PickPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/predict/pick");

  const now = new Date();
  if (now >= DEADLINE) {
    redirect(`/predict/${user.id}`);
  }

  const admin = createAdminClient();

  const [{ data: matches }, { data: picks }, { data: tiebreakerRow }] =
    await Promise.all([
      admin
        .from("matches")
        .select(
          "id, stage, kickoff_utc, home_team_id, away_team_id, winner_team_id, status, home:home_team_id(id, name, code, flag_emoji), away:away_team_id(id, name, code, flag_emoji)"
        )
        .neq("stage", "group")
        .order("kickoff_utc", { ascending: true }),
      admin
        .from("bracket_picks")
        .select("match_id, predicted_winner_team_id")
        .eq("user_id", user.id),
      admin
        .from("bracket_tiebreaker")
        .select("predicted_total_goals")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  const existingPicks: Record<number, number> = {};
  for (const p of (picks as BracketPick[]) ?? []) {
    existingPicks[p.match_id] = p.predicted_winner_team_id;
  }

  const existingTiebreaker =
    (tiebreakerRow as Tiebreaker | null)?.predicted_total_goals ?? null;

  // Normalize joined team objects (Supabase may return array or object)
  const normalizedMatches: Match[] = (matches ?? []).map((m: Record<string, unknown>) => ({
    id: m.id as number,
    stage: m.stage as string,
    kickoff_utc: m.kickoff_utc as string | null,
    home_team_id: m.home_team_id as number | null,
    away_team_id: m.away_team_id as number | null,
    winner_team_id: m.winner_team_id as number | null,
    status: m.status as string,
    home: Array.isArray(m.home)
      ? ((m.home[0] as Team) ?? null)
      : ((m.home as Team) ?? null),
    away: Array.isArray(m.away)
      ? ((m.away[0] as Team) ?? null)
      : ((m.away as Team) ?? null),
  }));

  return (
    <PickClient
      matches={normalizedMatches}
      existingPicks={existingPicks}
      existingTiebreaker={existingTiebreaker}
    />
  );
}
