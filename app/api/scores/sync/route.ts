import { NextResponse } from "next/server";
import { syncScores } from "@/lib/scores";

export async function POST(request: Request) {
  const secret = request.headers.get("x-sync-secret");
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncScores();
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.error === "WC2026_API_KEY not configured" ? 503 : 502 });
  }

  return NextResponse.json({ success: true, matchesUpserted: result.matchesUpserted });
}
