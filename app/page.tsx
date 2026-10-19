"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownUp, CalendarDays, ChevronLeft, ChevronRight, CircleHelp, Clock3, RefreshCw, ShieldCheck, Sparkles, Trophy, Wifi } from "lucide-react";
import { LEAGUES } from "@/lib/leagues";
import type { Fixture, FixturesResponse } from "@/types/fixture";

const pad = (value: number) => String(value).padStart(2, "0");
const todayInAthens = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}`;
};
const shiftDate = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const dateLabel = (date: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00Z`));
const timeLabel = (date: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(date));
const isLive = (short: string) => ["1H", "HT", "2H", "ET", "P", "LIVE"].includes(short);
const isFinished = (short: string) => ["FT", "AET", "PEN"].includes(short);

function TeamMark({ name, logo }: { name: string; logo?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (logo && !failed) return <img className="team-logo" src={logo} alt="" loading="lazy" onError={() => setFailed(true)} />;
  return <span className="team-fallback">{name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>;
}

type MatchInsight = {
  summary: string;
  pick: "HOME_WIN" | "DRAW" | "AWAY_WIN" | "NO_PICK";
  pickLabel: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  risk: 1 | 2 | 3 | 4 | 5;
  reasoning: string[];
  limitations: string;
};

function FixtureCard({
  fixture,
  onAnalyze,
  insight,
  insightLoading,
  insightError,
}: {
  fixture: Fixture;
  onAnalyze: (fixture: Fixture) => void;
  insight?: MatchInsight;
  insightLoading: boolean;
  insightError?: string;
}) {
  const live = isLive(fixture.fixture.status.short);
  const finished = isFinished(fixture.fixture.status.short);
  const status = fixture.fixture.status;
  return (
    <article className="fixture-card">
      <div className="fixture-league">
        <span className="league-dot" />
        <span>{fixture.league.name}</span>
        <span className="league-country">{fixture.league.country}</span>
        <span className={`match-state ${live ? "state-live" : finished ? "state-finished" : ""}`}>
          {live && <span className="live-pulse" />}
          {live && status.elapsed != null ? `${status.elapsed}'` : finished ? status.short : timeLabel(fixture.fixture.date)}
        </span>
      </div>
      <div className="fixture-teams">
        <div className="team-side">
          <TeamMark name={fixture.teams.home.name} logo={fixture.teams.home.logo} />
          <span className="team-name">{fixture.teams.home.name}</span>
        </div>
        <div className={`scoreline ${live || finished ? "scoreline-active" : ""}`}>
          <span>{fixture.goals.home ?? "–"}</span>
          <span className="score-separator">:</span>
          <span>{fixture.goals.away ?? "–"}</span>
        </div>
        <div className="team-side team-away">
          <span className="team-name">{fixture.teams.away.name}</span>
          <TeamMark name={fixture.teams.away.name} logo={fixture.teams.away.logo} />
        </div>
      </div>
      <div className="fixture-foot">
        <span>{fixture.fixture.venue?.name || fixture.league.round || "Match fixture"}</span>
        <button className="insight-button" onClick={() => onAnalyze(fixture)} disabled={insightLoading}>
          <Sparkles size={12} className={insightLoading ? "spin" : ""} />
          {insightLoading ? "Analyzing…" : insight ? "Refresh insight" : "AI insight"}
        </button>
      </div>
      {insightError && <div className="insight-error" role="alert">{insightError}</div>}
      {insight && (
        <section className="insight-panel" aria-label={`AI insight for ${fixture.teams.home.name} vs ${fixture.teams.away.name}`}>
          <div className="insight-topline">
            <span className="insight-label"><Sparkles size={13} /> BETMIND AI ANALYSIS</span>
            <span className={`confidence confidence-${insight.confidence.toLowerCase()}`}>{insight.confidence} CONFIDENCE</span>
          </div>
          <p className="insight-summary">{insight.summary}</p>
          <div className="insight-metrics">
            <div><small>PROVISIONAL PICK</small><strong>{insight.pickLabel}</strong></div>
            <div><small>RISK SCORE</small><strong>{insight.risk}/5</strong></div>
          </div>
          {insight.reasoning.length > 0 && <ul className="insight-reasons">{insight.reasoning.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
          <p className="insight-limitations"><strong>Data limitation:</strong> {insight.limitations}</p>
        </section>
      )}
    </article>
  );
}

export default function Home() {
  const [date, setDate] = useState("");
  const [league, setLeague] = useState("all");
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [insights, setInsights] = useState<Record<number, MatchInsight>>({});
  const [insightErrors, setInsightErrors] = useState<Record<number, string>>({});
  const [insightLoadingId, setInsightLoadingId] = useState<number | null>(null);

  useEffect(() => { setDate(todayInAthens()); }, []);

  const loadFixtures = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ date });
      const response = await fetch(`/api/fixtures?${params.toString()}`, { cache: "no-store" });
      const data = await response.json() as FixturesResponse;
      if (!response.ok) throw new Error(data.error || "Fixtures could not be loaded.");
      setFixtures(data.fixtures || []);
      setLastUpdated(new Date());
    } catch (err) {
      setFixtures([]);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { void loadFixtures(); }, [loadFixtures]);

  const analyzeFixture = useCallback(async (fixture: Fixture) => {
    const id = fixture.fixture.id;
    setInsightLoadingId(id);
    setInsightErrors((current) => ({ ...current, [id]: "" }));
    try {
      const response = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixture: {
            id,
            homeId: fixture.teams.home.id,
            awayId: fixture.teams.away.id,
            date: fixture.fixture.date,
            status: fixture.fixture.status.short,
            league: fixture.league.name,
            home: fixture.teams.home.name,
            away: fixture.teams.away.name,
            homeGoals: fixture.goals.home,
            awayGoals: fixture.goals.away,
          },
        }),
      });
      const data = await response.json() as { insight?: MatchInsight; error?: string };
      if (!response.ok || !data.insight) throw new Error(data.error || "Could not generate this insight.");
      setInsights((current) => ({ ...current, [id]: data.insight! }));
    } catch (err) {
      setInsightErrors((current) => ({ ...current, [id]: err instanceof Error ? err.message : "Could not generate this insight." }));
    } finally {
      setInsightLoadingId(null);
    }
  }, []);

  const visibleFixtures = useMemo(() => league === "all" ? fixtures : fixtures.filter((fixture) => String(fixture.league.id) === league), [fixtures, league]);
  const leagueCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const fixture of fixtures) counts[fixture.league.id] = (counts[fixture.league.id] || 0) + 1;
    return counts;
  }, [fixtures]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="BetMind AI home">
          <span className="brand-mark"><Activity size={22} strokeWidth={2.5} /></span>
          <span className="brand-copy"><strong>betmind<span>.ai</span></strong><small>FOOTBALL INTELLIGENCE</small></span>
        </a>
        <div className="side-label">WORKSPACE</div>
        <button className="nav-item nav-active"><Activity size={17} /><span>Match centre</span><span className="nav-key">01</span></button>
        <button className="nav-item" onClick={() => document.getElementById("coming-soon")?.scrollIntoView({ behavior: "smooth" })}><Sparkles size={17} /><span>AI insights</span><span className="soon-tag">SOON</span></button>
        <button className="nav-item" onClick={() => document.getElementById("coming-soon")?.scrollIntoView({ behavior: "smooth" })}><Trophy size={17} /><span>Performance</span><span className="soon-tag">SOON</span></button>
        <div className="sidebar-bottom">
          <div className="sidebar-status"><span className="status-led" /><div><strong>Data connection</strong><small>API-Football</small></div><Wifi size={15} /></div>
          <div className="sidebar-note"><ShieldCheck size={16} /><span>Built for transparent, data-led analysis.</span></div>
          <div className="side-version">BETMIND AI <span>v0.1.0</span></div>
        </div>
      </aside>

      <section className="main-panel">
        <div className="content">
          <div className="welcome-row">
            <div><div className="eyebrow"><span className="eyebrow-line" /> THE MATCHDAY BRIEFING</div><h1>See the game <span>in data.</span></h1><p className="page-subtitle">Your football dashboard for fixtures, live scores and smarter match insights.</p></div>
            <div className="date-display"><CalendarDays size={16} /><span>{date ? dateLabel(date) : "Loading date…"}</span></div>
          </div>

          <section className="hero-banner">
            <div className="hero-grid" />
            <div className="hero-content"><div className="hero-chip"><span className="hero-chip-dot" /> YOUR DAILY MATCH INTELLIGENCE</div><h2>Football is a game.<br /><span>Data tells the story.</span></h2><p>Fixtures first. Evidence always. Every insight should be measurable.</p><div className="hero-points"><span><span className="point-check">✓</span> Real fixtures</span><span><span className="point-check">✓</span> Transparent tracking</span><span><span className="point-check">✓</span> No guaranteed outcomes</span></div></div>
            <div className="hero-orb"><div className="orb-ring ring-one" /><div className="orb-ring ring-two" /><div className="orb-core"><Activity size={35} /></div><span className="orb-label orb-label-top">MATCH DATA</span><span className="orb-label orb-label-bottom">SIGNAL / NOISE</span></div>
          </section>

          <div className="matches-heading"><div><div className="heading-title-row"><h2>Fixtures & scores</h2><span className="count-pill">{loading ? "…" : visibleFixtures.length}</span></div><p>Match information sourced from API-Football.</p></div><div className="date-controls"><button className="refresh-button" onClick={() => void loadFixtures()} disabled={loading}><RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh</button><button aria-label="Previous day" onClick={() => setDate((d) => shiftDate(d, -1))} disabled={!date}><ChevronLeft size={16} /></button><input aria-label="Select fixture date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /><button aria-label="Next day" onClick={() => setDate((d) => shiftDate(d, 1))} disabled={!date}><ChevronRight size={16} /></button><button className="today-button" onClick={() => setDate(todayInAthens())}>Today</button></div></div>

          <div className="league-filters" aria-label="Filter by league"><button className={league === "all" ? "filter-active" : ""} onClick={() => setLeague("all")}><ArrowDownUp size={13} /> All leagues ({fixtures.length})</button>{LEAGUES.map((item) => <button key={item.id} className={league === String(item.id) ? "filter-active" : ""} onClick={() => setLeague(String(item.id))}>{item.shortName} ({leagueCounts[item.id] || 0})</button>)}</div>

          <div className="fixture-list">
            {loading && <div className="state-panel"><div className="loader-ring" /><strong>Loading matchday data</strong><span>Fetching fixtures for your selected competitions…</span></div>}
            {!loading && error && <div className="state-panel error-panel"><CircleHelp size={26} /><strong>We couldn&apos;t load the fixtures</strong><span>{error}</span><button className="retry-button" onClick={() => void loadFixtures()}><RefreshCw size={14} /> Try again</button></div>}
            {!loading && !error && visibleFixtures.length === 0 && <div className="state-panel"><CalendarDays size={26} /><strong>No fixtures found for this date</strong><span>Try another date or choose a different competition.</span><button className="retry-button" onClick={() => setDate(shiftDate(date, 1))}>Next day <ChevronRight size={14} /></button></div>}
            {!loading && !error && visibleFixtures.map((fixture) => <FixtureCard
              key={fixture.fixture.id}
              fixture={fixture}
              onAnalyze={analyzeFixture}
              insight={insights[fixture.fixture.id]}
              insightLoading={insightLoadingId === fixture.fixture.id}
              insightError={insightErrors[fixture.fixture.id]}
            />)}
          </div>
          <section id="coming-soon" className="roadmap-card"><div className="roadmap-icon"><Sparkles size={18} /></div><div className="roadmap-copy"><strong>AI insights · Initial version</strong><span>Generate a structured, cautious insight from each fixture card. Team form, injuries, lineups and odds are not yet connected, so the AI may recommend no pick.</span></div><span className="roadmap-badge">PHASE 2</span></section>
          <footer className="footer"><span>© {new Date().getFullYear()} BetMind AI</span><span><Clock3 size={12} /> All fixture times shown in Europe/Athens</span><span>DATA-DRIVEN. NEVER GUARANTEED.</span></footer>
        </div>
      </section>
    </main>
  );
}
