import type { Fixture } from "@/types/fixture";

const BASE_URL = (process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io").replace(/\/$/, "");
const TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Europe/Athens";

type ApiResponse = { response?: Fixture[]; errors?: Record<string, string | string[]>; results?: number };

export class FootballApiError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = "FootballApiError";
  }
}

export async function getFixtures(date: string, leagueId?: number): Promise<Fixture[]> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new FootballApiError("API-Football is not configured. Add API_FOOTBALL_KEY in Vercel Environment Variables.", 503);

  const selectedLeagues = leagueId ? [leagueId] : [39, 140, 78, 135, 61, 197, 2];
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const season = month >= 7 ? year : year - 1;

  const results = await Promise.all(selectedLeagues.map(async (id) => {
    const params = new URLSearchParams({ date, league: String(id), season: String(season), timezone: TIMEZONE });
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
    return data.response ?? [];
  }));

  return results.flat().sort((a, b) => a.fixture.timestamp - b.fixture.timestamp);
}
