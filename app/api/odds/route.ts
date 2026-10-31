import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Side = "HOME" | "AWAY";
type Source = "prematch" | "near_kickoff";

type RawOddValue = {
  value?: string;
  odd?: string;
  main?: boolean;
  suspended?: boolean;
};

type RawBet = {
  name?: string;
  values?: RawOddValue[];
};

type RawBookmaker = {
  id?: number;
  name?: string;
  bets?: RawBet[];
};

type RawOddsEntry = {
  update?: string;
  bookmakers?: RawBookmaker[];
};

type ProviderResponse = {
  response?: RawOddsEntry[];
  errors?: Record<string, string | string[]>;
};

type Quote = {
  bookmakerId: string;
  bookmaker: string;
  market: string;
  home: number;
  draw: number;
  away: number;
  favourite: Side | null;
  updatedAt: string | null;
};

type PreviousSnapshot = {
  id: string;
  favourite_side: Side | null;
  home_odd: string;
  draw_odd: string;
  away_odd: string;
};

type PollState = {
  last_checked_at: string;
  last_source: Source;
  last_result: Quote[];
};

const PREMATCH_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const NEAR_KICKOFF_COOLDOWN_MS = 60 * 1000;
const MAX_PROVIDER_CALLS_PER_UTC_DAY = 60;
const MARKET_KEY = "match_winner_1x2";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

function readOdd(values: RawOddValue[], labels: string[]): number | null {
  const candidates = values.filter(
    (item) =>
      !item.suspended && labels.includes(normalize(item.value || ""))
  );

  const selected =
    candidates.find((item) => item.main === true) || candidates[0];

  const value = Number(selected?.odd);
  return Number.isFinite(value) && value > 1 ? value : null;
}

function getFavourite(home: number, draw: number, away: number): Side | null {
  const lowest = Math.min(home, draw, away);

  if (home === lowest && home < draw && home < away) return "HOME";
  if (away === lowest && away < draw && away < home) return "AWAY";
  return null;
}

function parseQuotes(
  entries: RawOddsEntry[],
  homeName: string,
  awayName: string
): Quote[] {
  const quotes: Quote[] = [];

  for (const entry of entries) {
    for (const bookmaker of entry.bookmakers || []) {
      const market = (bookmaker.bets || []).find((bet) => {
        const name = normalize(bet.name || "");
        return [
          "matchwinner",
          "1x2",
          "fulltimeresult",
          "regulartimeresult",
        ].includes(name);
      });

      if (!market) continue;

      const values = market.values || [];
      const home = readOdd(values, ["home", "1", "team1", normalize(homeName)]);
      const draw = readOdd(values, ["draw", "x", "tie"]);
      const away = readOdd(values, ["away", "2", "team2", normalize(awayName)]);

      if (home === null || draw === null || away === null) continue;

      quotes.push({
        bookmakerId: String(
          bookmaker.id ?? normalize(bookmaker.name || "unknown")
        ),
        bookmaker: bookmaker.name || "Bookmaker",
        market: market.name || "Match Winner",
        home,
        draw,
        away,
        favourite: getFavourite(home, draw, away),
        updatedAt:
          entry.update && !Number.isNaN(Date.parse(entry.update))
            ? entry.update
            : null,
      });
    }
  }

  return quotes;
}

function sameOdds(previous: PreviousSnapshot, quote: Quote) {
  return (
    Number(previous.home_odd) === quote.home &&
    Number(previous.draw_odd) === quote.draw &&
    Number(previous.away_odd) === quote.away
  );
}

async function getRecentAlerts(client: import("pg").PoolClient, fixtureId: number) {
  const result = await client.query(
    "SELECT id, fixture_id, home_team, away_team, bookmaker_name, " +
      "previous_favourite, new_favourite, previous_favourite_odd, " +
      "new_favourite_odd, detected_at " +
      "FROM public.odds_alerts WHERE fixture_id = $1 " +
      "ORDER BY detected_at DESC LIMIT 5",
    [fixtureId]
  );

  return result.rows;
}

export async function POST(request: NextRequest) {
  let input: {
    fixtureId?: unknown;
    homeName?: unknown;
    awayName?: unknown;
    kickoff?: unknown;
  };

  try {
    input = (await request.json()) as typeof input;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  const fixtureId = Number(input.fixtureId);
  const homeName = typeof input.homeName === "string" ? input.homeName.trim() : "";
  const awayName = typeof input.awayName === "string" ? input.awayName.trim() : "";
  const kickoff = typeof input.kickoff === "string" ? input.kickoff : "";

  if (
    !Number.isSafeInteger(fixtureId) ||
    fixtureId <= 0 ||
    !homeName ||
    !awayName ||
    !kickoff ||
    Number.isNaN(Date.parse(kickoff))
  ) {
    return NextResponse.json(
      { error: "A valid fixture ID, team names and kickoff time are required." },
      { status: 400 }
    );
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== request.nextUrl.host) {
        return NextResponse.json(
          { error: "Cross-origin requests are not allowed." },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }
  }

  const kickoffTime = Date.parse(kickoff);
  const minutesToKickoff = (kickoffTime - Date.now()) / 60000;

  if (minutesToKickoff <= 0) {
    return NextResponse.json(
      {
        error:
          "Pre-match odds monitoring stops at kickoff. In-play odds are not used for this alert.",
      },
      { status: 409 }
    );
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "API-Football is not configured." },
      { status: 503 }
    );
  }

  const source: Source = minutesToKickoff <= 15 ? "near_kickoff" : "prematch";
  const cooldownMs =
    source === "near_kickoff"
      ? NEAR_KICKOFF_COOLDOWN_MS
      : PREMATCH_COOLDOWN_MS;

  const baseUrl = (
    process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io"
  ).replace(/\/$/, "");

  const endpoint = source === "near_kickoff" ? "/odds/live" : "/odds";
  const url = new URL(baseUrl + endpoint);
  url.searchParams.set("fixture", String(fixtureId));

  const pool = getDbPool();
  const client = await pool.connect();
  const lockKey = "betmind-odds:" + fixtureId;
  let lockAcquired = false;
  let transactionOpen = false;

  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [lockKey]);
    lockAcquired = true;

    const stateResult = await client.query(
      "SELECT last_checked_at, last_source, last_result " +
        "FROM public.odds_poll_state WHERE fixture_id = $1",
      [fixtureId]
    );

    const previousState = stateResult.rows[0] as PollState | undefined;

    if (
      previousState &&
      previousState.last_source === source &&
      Date.now() - new Date(previousState.last_checked_at).getTime() < cooldownMs
    ) {
      const alerts = await getRecentAlerts(client, fixtureId);

      return NextResponse.json({
        status: "ok",
        cached: true,
        source,
        quotes: previousState.last_result || [],
        alerts,
        checkedAt: previousState.last_checked_at,
        message: (previousState.last_result || []).length
          ? undefined
          : "No supported 1X2 odds are available yet.",
      });
    }

    const quotaResult = await client.query(
      "INSERT INTO public.odds_provider_usage (usage_date, request_count, updated_at) " +
        "VALUES (CURRENT_DATE, 1, NOW()) " +
        "ON CONFLICT (usage_date) DO UPDATE SET " +
        "request_count = public.odds_provider_usage.request_count + 1, " +
        "updated_at = NOW() " +
        "WHERE public.odds_provider_usage.request_count < $1 " +
        "RETURNING request_count",
      [MAX_PROVIDER_CALLS_PER_UTC_DAY]
    );

    if (quotaResult.rows.length === 0) {
      return NextResponse.json(
        {
          error:
            "The daily odds-monitoring safety limit has been reached. Try again after the UTC day resets.",
          dailyLimit: MAX_PROVIDER_CALLS_PER_UTC_DAY,
        },
        { status: 429 }
      );
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-apisports-key": apiKey,
        accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    let entries: RawOddsEntry[] = [];

    if (response.status !== 204) {
      if (!response.ok) {
        console.error("API-Football odds provider error", {
          fixtureId,
          status: response.status,
          source,
        });

        return NextResponse.json(
          { error: "API-Football odds request failed (HTTP " + response.status + ")." },
          { status: response.status === 429 ? 429 : 502 }
        );
      }

      const payload = (await response.json()) as ProviderResponse;

      if (payload.errors && Object.keys(payload.errors).length > 0) {
        const details = Object.values(payload.errors).flat().join(" ");
        return NextResponse.json(
          { error: "API-Football: " + details.slice(0, 220) },
          { status: 502 }
        );
      }

      entries = payload.response || [];
    }

    const quotes = parseQuotes(entries, homeName, awayName);
    const checkedAt = new Date();

    await client.query("BEGIN");
    transactionOpen = true;

    for (const quote of quotes) {
      const previousResult = await client.query(
        "SELECT id, favourite_side, home_odd, draw_odd, away_odd " +
          "FROM public.odds_snapshots " +
          "WHERE fixture_id = $1 AND bookmaker_id = $2 AND market_key = $3 " +
          "ORDER BY captured_at DESC LIMIT 1",
        [fixtureId, quote.bookmakerId, MARKET_KEY]
      );

      const previous = previousResult.rows[0] as PreviousSnapshot | undefined;
      if (previous && sameOdds(previous, quote)) continue;

      const snapshotResult = await client.query(
        "INSERT INTO public.odds_snapshots (" +
          "fixture_id, home_team, away_team, bookmaker_id, bookmaker_name, " +
          "market_key, market_name, home_odd, draw_odd, away_odd, " +
          "favourite_side, source, provider_updated_at" +
          ") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) " +
          "RETURNING id",
        [
          fixtureId,
          homeName,
          awayName,
          quote.bookmakerId,
          quote.bookmaker,
          MARKET_KEY,
          quote.market,
          quote.home,
          quote.draw,
          quote.away,
          quote.favourite,
          source,
          quote.updatedAt,
        ]
      );

      const currentSnapshotId = snapshotResult.rows[0].id as string;

      if (
        previous?.favourite_side &&
        quote.favourite &&
        previous.favourite_side !== quote.favourite
      ) {
        const oldFavouriteOdd =
          previous.favourite_side === "HOME"
            ? Number(previous.home_odd)
            : Number(previous.away_odd);

        const newFavouriteOdd =
          quote.favourite === "HOME" ? quote.home : quote.away;

        await client.query(
          "INSERT INTO public.odds_alerts (" +
            "fixture_id, home_team, away_team, bookmaker_id, bookmaker_name, " +
            "market_key, previous_favourite, new_favourite, " +
            "previous_favourite_odd, new_favourite_odd, " +
            "previous_snapshot_id, current_snapshot_id" +
            ") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) " +
            "ON CONFLICT (current_snapshot_id) DO NOTHING",
          [
            fixtureId,
            homeName,
            awayName,
            quote.bookmakerId,
            quote.bookmaker,
            MARKET_KEY,
            previous.favourite_side,
            quote.favourite,
            oldFavouriteOdd,
            newFavouriteOdd,
            previous.id,
            currentSnapshotId,
          ]
        );
      }
    }

    await client.query(
      "INSERT INTO public.odds_poll_state (" +
        "fixture_id, home_team, away_team, kickoff_at, last_checked_at, " +
        "last_source, last_result, updated_at" +
        ") VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,NOW()) " +
        "ON CONFLICT (fixture_id) DO UPDATE SET " +
        "home_team = EXCLUDED.home_team, " +
        "away_team = EXCLUDED.away_team, " +
        "kickoff_at = EXCLUDED.kickoff_at, " +
        "last_checked_at = EXCLUDED.last_checked_at, " +
        "last_source = EXCLUDED.last_source, " +
        "last_result = EXCLUDED.last_result, updated_at = NOW()",
      [
        fixtureId,
        homeName,
        awayName,
        new Date(kickoffTime),
        checkedAt,
        source,
        JSON.stringify(quotes),
      ]
    );

    await client.query("COMMIT");
    transactionOpen = false;

    const alerts = await getRecentAlerts(client, fixtureId);

    return NextResponse.json(
      {
        status: "ok",
        cached: false,
        source,
        quotes,
        alerts,
        checkedAt: checkedAt.toISOString(),
        nextCheckAt: new Date(checkedAt.getTime() + cooldownMs).toISOString(),
        dailySafetyLimit: MAX_PROVIDER_CALLS_PER_UTC_DAY,
        message: quotes.length
          ? undefined
          : source === "near_kickoff"
            ? "The near-kickoff odds feed has not published supported 1X2 quotes for this fixture yet."
            : "No pre-match 1X2 odds are currently available for this fixture.",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Keep the original failure.
      }
    }

    console.error("BetMind odds monitoring failed", {
      fixtureId,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      {
        error:
          "Odds monitoring failed. Check the database connection and provider availability.",
      },
      { status: 503 }
    );
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
      } catch {
        // The connection will be released below; the server drops locks on disconnect.
      }
    }

    client.release();
  }
}
