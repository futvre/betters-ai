-- BetMind AI odds monitoring schema.
-- Idempotent migration: safe to run on the existing Neon database.

CREATE TABLE IF NOT EXISTS public.odds_snapshots (
  id BIGSERIAL PRIMARY KEY,
  fixture_id BIGINT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  bookmaker_id TEXT NOT NULL,
  bookmaker_name TEXT NOT NULL,
  market_key TEXT NOT NULL DEFAULT 'match_winner_1x2',
  market_name TEXT NOT NULL DEFAULT 'Match Winner',
  home_odd NUMERIC(10, 4) NOT NULL CHECK (home_odd > 1),
  draw_odd NUMERIC(10, 4) NOT NULL CHECK (draw_odd > 1),
  away_odd NUMERIC(10, 4) NOT NULL CHECK (away_odd > 1),
  favourite_side TEXT CHECK (favourite_side IN ('HOME', 'AWAY')),
  source TEXT NOT NULL CHECK (source IN ('prematch', 'near_kickoff')),
  provider_updated_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS odds_snapshots_fixture_bookmaker_time_idx
  ON public.odds_snapshots (fixture_id, bookmaker_id, market_key, captured_at DESC);

CREATE TABLE IF NOT EXISTS public.odds_alerts (
  id BIGSERIAL PRIMARY KEY,
  fixture_id BIGINT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  bookmaker_id TEXT NOT NULL,
  bookmaker_name TEXT NOT NULL,
  market_key TEXT NOT NULL DEFAULT 'match_winner_1x2',
  previous_favourite TEXT NOT NULL CHECK (previous_favourite IN ('HOME', 'AWAY')),
  new_favourite TEXT NOT NULL CHECK (new_favourite IN ('HOME', 'AWAY')),
  previous_favourite_odd NUMERIC(10, 4) NOT NULL,
  new_favourite_odd NUMERIC(10, 4) NOT NULL,
  previous_snapshot_id BIGINT NOT NULL REFERENCES public.odds_snapshots(id),
  current_snapshot_id BIGINT NOT NULL UNIQUE REFERENCES public.odds_snapshots(id),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS odds_alerts_fixture_time_idx
  ON public.odds_alerts (fixture_id, detected_at DESC);

CREATE TABLE IF NOT EXISTS public.odds_poll_state (
  fixture_id BIGINT PRIMARY KEY,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  kickoff_at TIMESTAMPTZ NOT NULL,
  last_checked_at TIMESTAMPTZ NOT NULL,
  last_source TEXT NOT NULL CHECK (last_source IN ('prematch', 'near_kickoff')),
  last_result JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.odds_provider_usage (
  usage_date DATE PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
