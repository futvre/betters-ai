
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ProviderFixture = {
  events?: unknown[];
  lineups?: unknown[];
  statistics?: unknown[];
  players?: unknown[];
};

type ProviderResponse = {
  response?: ProviderFixture[];
  errors?: Record<string, string | string[]>;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const fixtureId = Number(params.id);

  if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
    return NextResponse.json(
      { error: "A valid fixture ID is required." },
      { status: 400 }
    );
  }

  const apiKey = process.env.API_FOOTBALL_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "API-Football is not configured." },
      { status: 503 }
    );
  }

  const baseUrl = (
    process.env.API_FOOTBALL_BASE_URL ||
    "https://v3.football.api-sports.io"
  ).replace(/\/$/, "");

  try {
    const url = new URL(`${baseUrl}/fixtures`);
    url.searchParams.set("id", String(fixtureId));
    url.searchParams.set(
      "timezone",
      process.env.NEXT_PUBLIC_APP_TIMEZONE || "Europe/Athens"
    );

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-apisports-key": apiKey,
        accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });

    if (response.status === 204) {
      return NextResponse.json({
        events: [],
        lineups: [],
        statistics: [],
        players: [],
        message: "No additional match data is available yet.",
      });
    }

    if (!response.ok) {
      console.error("API-Football match details error", {
        status: response.status,
        fixtureId,
      });

      return NextResponse.json(
        {
          error: `API-Football returned HTTP ${response.status} while loading match details.`,
        },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as ProviderResponse;

    if (payload.errors && Object.keys(payload.errors).length > 0) {
      const details = Object.values(payload.errors)
        .flat()
        .join(" ");

      return NextResponse.json(
        {
          error: `API-Football: ${details.slice(0, 220)}`,
        },
        { status: 502 }
      );
    }

    const fixture = payload.response?.[0];

    if (!fixture) {
      return NextResponse.json({
        events: [],
        lineups: [],
        statistics: [],
        players: [],
        message: "No extended details are available for this fixture yet.",
      });
    }

    return NextResponse.json(
      {
        events: fixture.events || [],
        lineups: fixture.lineups || [],
        statistics: fixture.statistics || [],
        players: fixture.players || [],
      },
      {
        headers: {
          "Cache-Control": "private, max-age=20, stale-while-revalidate=20",
        },
      }
    );
  } catch (error) {
    console.error("Match details request failed", {
      fixtureId,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      {
        error: "Could not reach API-Football. Please retry shortly.",
      },
      { status: 502 }
    );
  }
}
