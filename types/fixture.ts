export type FixtureStatus = {
  short: string;
  long: string;
  elapsed: number | null;
};

export type Fixture = {
  fixture: {
    id: number;
    date: string;
    timestamp: number;
    status: FixtureStatus;
    venue?: { name?: string | null; city?: string | null } | null;
  };
  league: { id: number; name: string; country: string; logo?: string | null; round?: string };
  teams: {
    home: { id: number; name: string; logo?: string | null; winner?: boolean | null };
    away: { id: number; name: string; logo?: string | null; winner?: boolean | null };
  };
  goals: { home: number | null; away: number | null };
};

export type League = { id: number; name: string; shortName: string; country: string };

export type FixturesResponse = {
  fixtures: Fixture[];
  meta: { date: string; timezone: string; count: number; source: "api-football" | "empty" };
  error?: string;
};
