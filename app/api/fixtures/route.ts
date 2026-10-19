import { NextRequest, NextResponse } from "next/server";
import { getFixtures, FootballApiError } from "@/lib/api-football";
import { LEAGUE_IDS } from "@/lib/leagues";

export const runtime = "nodejs";

function athensDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.NEXT_PUBLIC_APP_TIMEZONE || "Europe/Athens",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function GET(request: NextRequest) {
  const requestedDate = request.nextUrl.searchParams.get("date") || athensDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || Number.isNaN(Date.parse(`${requestedDate}T00:00:00Z`))) {
    return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD." }, { status: 400 });
  }

  const leagueParam = request.nextUrl.searchParams.get("league");
  const leagueId = leagueParam ? Number(leagueParam) : undefined;
  if (leagueParam && (!Number.isInteger(leagueId) || !LEAGUE_IDS.has(leagueId!))) {
    return NextResponse.json({ error: "Unsupported league filter." }, { status: 400 });
  }

  try {
    const fixtures = await getFixtures(requestedDate, leagueId);
    return NextResponse.json({
      fixtures,
      meta: {
        date: requestedDate,
        timezone: process.env.NEXT_PUBLIC_APP_TIMEZONE || "Europe/Athens",
        count: fixtures.length,
        source: "api-football",
      },
    }, { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=240" } });
  } catch (error) {
    const message = error instanceof FootballApiError ? error.message : "Unexpected error while loading fixtures.";
    const status = error instanceof FootballApiError ? error.status : 500;
    return NextResponse.json({ error: message, fixtures: [], meta: { date: requestedDate, count: 0, source: "empty" } }, { status });
  }
}
