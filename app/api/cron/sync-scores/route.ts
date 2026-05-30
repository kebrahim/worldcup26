import { NextResponse } from "next/server";
import { syncScores } from "@/lib/scores";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncScores();
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }

  return NextResponse.json({ success: true, matchesUpserted: result.matchesUpserted });
}
