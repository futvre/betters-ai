-- Date-level odds scan state. Safe and additive.
CREATE TABLE IF NOT EXISTS public.odds_scan_state (
  scan_date DATE PRIMARY KEY,
  last_checked_at TIMESTAMPTZ NOT NULL,
  pages_processed INTEGER NOT NULL DEFAULT 0,
  complete BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
