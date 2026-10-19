import type { Fixture } from "@/types/fixture";

const BASE_URL = (process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io").replace(/\/$/, "");
const TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Europe/Athens";
const SUPPORTED_LEAGUES = [39, 140, 78, 135, 61, 197, 2];

type ApiResponse = { response?: Fixture[]; errors?: Record<string, string | string[]>; results?: number };

export class FootballApiError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = "FootballApiError";
  }
}

export async function getFixtures(date: string, leagueId?: number): Promise<Fixture[]> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    throw new FootballApiError("API-Football is not configured. Add API_FOOTBALL_KEY in Vercel Environment Variables.", 503);
  }

  // Important: don't pass a season here. Free API-Football plans can reject
  // the current season when a league+season pair is requested. Fetch the
  // selected date globally, then keep only competitions supported by BetMind.
  const params = new URLSearchParams({ date, timezone: TIMEZONE });
  let response: Response;

  try {
    response = await fetch(`${BASE_URL}/fixtures?${params.toString()}`, {
      headers: { "x-apisports-key": key, accept: "application/json" },
      next: { revalidate: 300 },
    });
  } catch {
    throw new FootballApiError("Could not reach API-Football. Check your connection and provider status.");
  }

  if (!response.ok) {
    throw new FootballApiError(`API-Football returned HTTP ${response.status}. Check your API plan, key and quota.`, response.status);
  }

  const data = await response.json() as ApiResponse;
  if (data.errors && Object.keys(data.errors).length) {
    const message = Object.values(data.errors).flat().join(" ");
    throw new FootballApiError(`API-Football: ${message}`, 502);
  }

  const allowed = new Set(leagueId ? [leagueId] : SUPPORTED_LEAGUES);
  return (data.response ?? [])
    .filter((fixture) => allowed.has(fixture.league.id))
    .sort((a, b) => a.fixture.timestamp - b.fixture.timestamp);
}
