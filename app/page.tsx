
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownUp,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { LEAGUES } from "@/lib/leagues";
import OddsMonitor from "@/components/OddsMonitor";
import type { Fixture, FixturesResponse } from "@/types/fixture";

type MatchFilter = "all" | "live" | "upcoming" | "finished";

type MatchInsight = {
  summary: string;
  pick: "HOME_WIN" | "DRAW" | "AWAY_WIN" | "NO_PICK";
  pickLabel: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  risk: 1 | 2 | 3 | 4 | 5;
  reasoning: string[];
  limitations: string;
};

type MatchEvent = {
  time?: { elapsed?: number | null; extra?: number | null };
  team?: { name?: string | null };
  player?: { name?: string | null };
  assist?: { name?: string | null };
  type?: string;
  detail?: string;
};

type MatchStatistic = {
  type?: string;
  value?: string | number | null;
};

type MatchLineupPlayer = {
  player?: {
    id?: number;
    name?: string;
    number?: number;
    pos?: string;
  };
};

type MatchLineup = {
  team?: { name?: string | null };
  coach?: { name?: string | null };
  formation?: string | null;
  startXI?: MatchLineupPlayer[];
  substitutes?: MatchLineupPlayer[];
};

type MatchDetailsData = {
  events?: MatchEvent[];
  statistics?: {
    team?: { name?: string | null };
    statistics?: MatchStatistic[];
  }[];
  lineups?: MatchLineup[];
  message?: string;
};

const pad = (value: number) => String(value).padStart(2, "0");

const todayInAthens = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
};

const shiftDate = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return `${value.getUTCFullYear()}-${pad(
    value.getUTCMonth() + 1
  )}-${pad(value.getUTCDate())}`;
};

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));

const timeLabel = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(date));

const isLive = (status: string) =>
  ["1H", "HT", "2H", "ET", "P", "LIVE", "BT"].includes(status);

const isFinished = (status: string) =>
  ["FT", "AET", "PEN"].includes(status);

function TeamMark({
  name,
  logo,
}: {
  name: string;
  logo?: string | null;
}) {
  const [failed, setFailed] = useState(false);

  if (logo && !failed) {
    return (
      <img
        className="team-logo"
        src={logo}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className="team-fallback">
      {name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()}
    </span>
  );
}

function MatchDetails({
  fixtureId,
  homeName,
  awayName,
}: {
  fixtureId: number;
  homeName: string;
  awayName: string;
}) {
  const [data, setData] = useState<MatchDetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDetails() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/fixtures/${fixtureId}`, {
          cache: "no-store",
        });

        const result = (await response.json()) as MatchDetailsData & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error || "Match details could not be loaded.");
        }

        if (!cancelled) setData(result);
      } catch (reason) {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Match details could not be loaded."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [fixtureId]);

  const events = useMemo(
    () =>
      [...(data?.events || [])].sort((a, b) => {
        const aMinute =
          (a.time?.elapsed || 0) * 100 + (a.time?.extra || 0);
        const bMinute =
          (b.time?.elapsed || 0) * 100 + (b.time?.extra || 0);
        return aMinute - bMinute;
      }),
    [data]
  );

  if (loading) {
    return (
      <div className="match-details">
        <RefreshCw size={15} className="spin" />
        Loading match details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="match-details detail-error" role="alert">
        {error}
      </div>
    );
  }

  const homeStats = data?.statistics?.[0]?.statistics || [];
  const awayStats = data?.statistics?.[1]?.statistics || [];
  const lineups = data?.lineups || [];

  return (
    <section className="match-details">
      <div className="detail-section">
        <h3>
          <Clock3 size={14} /> Match timeline
        </h3>

        {events.length > 0 ? (
          <div className="event-timeline">
            {events.map((event, index) => (
              <div className="event-row" key={`${fixtureId}-event-${index}`}>
                <span className="event-minute">
                  {event.time?.elapsed != null
                    ? `${event.time.elapsed}${
                        event.time.extra ? `+${event.time.extra}` : ""
                      }'`
                    : "—"}
                </span>

                <span className="event-marker">
                  {event.type === "Goal"
                    ? "⚽"
                    : event.type === "Card"
                      ? "▰"
                      : event.type === "subst"
                        ? "↔"
                        : "•"}
                </span>

                <div className="event-copy">
                  <strong>
                    {event.player?.name || event.detail || event.type || "Event"}
                  </strong>
                  <span>
                    {[event.team?.name, event.detail,
                      event.assist?.name
                        ? `Assist: ${event.assist.name}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="detail-empty">
            No match events are available yet.
          </p>
        )}
      </div>

      <div className="detail-section">
        <h3>
          <Activity size={14} /> Match statistics
        </h3>

        {homeStats.length > 0 ? (
          <div className="stats-table">
            <div className="stats-head">
              <span>{homeName}</span>
              <span>Statistic</span>
              <span>{awayName}</span>
            </div>

            {homeStats.map((stat) => {
              const awayValue = awayStats.find(
                (item) => item.type === stat.type
              )?.value;

              return (
                <div className="stats-row" key={stat.type}>
                  <strong>{stat.value ?? "—"}</strong>
                  <span>{stat.type || "Statistic"}</span>
                  <strong>{awayValue ?? "—"}</strong>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="detail-empty">
            Statistics are normally available once the match has started.
          </p>
        )}
      </div>

      <div className="detail-section">
        <h3>
          <Users size={14} /> Lineups
        </h3>

        {lineups.length > 0 ? (
          <div className="lineups-grid">
            {lineups.map((lineup, index) => (
              <div
                className="lineup-team"
                key={lineup.team?.name || String(index)}
              >
                <div className="lineup-heading">
                  <strong>
                    {lineup.team?.name || (index === 0 ? homeName : awayName)}
                  </strong>
                  <span>{lineup.formation || "Formation unavailable"}</span>
                </div>

                {lineup.coach?.name && (
                  <p className="lineup-coach">
                    Coach: {lineup.coach.name}
                  </p>
                )}

                <small>STARTING XI</small>

                <ul>
                  {(lineup.startXI || []).map((entry, playerIndex) => (
                    <li
                      key={
                        entry.player?.id ||
                        entry.player?.name ||
                        String(playerIndex)
                      }
                    >
                      <span>{entry.player?.number ?? "—"}</span>
                      {entry.player?.name || "Player"}
                      <em>{entry.player?.pos || ""}</em>
                    </li>
                  ))}
                </ul>

                {(lineup.substitutes || []).length > 0 && (
                  <>
                    <small>SUBSTITUTES</small>
                    <ul>
                      {(lineup.substitutes || []).map((entry, playerIndex) => (
                        <li
                          key={
                            entry.player?.id ||
                            entry.player?.name ||
                            `sub-${playerIndex}`
                          }
                        >
                          <span>{entry.player?.number ?? "—"}</span>
                          {entry.player?.name || "Player"}
                          <em>{entry.player?.pos || ""}</em>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="detail-empty">
            Lineups are usually published around 20–40 minutes before kickoff,
            depending on competition coverage.
          </p>
        )}
      </div>

      {data?.message && <p className="detail-note">{data.message}</p>}
    </section>
  );
}

function FixtureCard({
  fixture,
  onAnalyze,
  insight,
  insightLoading,
  insightError,
  expanded,
  onToggleDetails,
}: {
  fixture: Fixture;
  onAnalyze: (fixture: Fixture) => void;
  insight?: MatchInsight;
  insightLoading: boolean;
  insightError?: string;
  expanded: boolean;
  onToggleDetails: () => void;
}) {
  const status = fixture.fixture.status;
  const live = isLive(status.short);
  const finished = isFinished(status.short);

  return (
    <article className="fixture-card">
      <div className="fixture-league">
        <span className="league-dot" />
        <span>{fixture.league.name}</span>
        <span className="league-country">{fixture.league.country}</span>

        <span
          className={`match-state ${
            live ? "state-live" : finished ? "state-finished" : ""
          }`}
        >
          {live && <span className="live-pulse" />}
          {live && status.elapsed != null
            ? `${status.elapsed}'`
            : finished
              ? status.short
              : timeLabel(fixture.fixture.date)}
        </span>
      </div>

      <div className="fixture-teams">
        <div className="team-side">
          <TeamMark
            name={fixture.teams.home.name}
            logo={fixture.teams.home.logo}
          />
          <span className="team-name">{fixture.teams.home.name}</span>
        </div>

        <div className={`scoreline ${live || finished ? "scoreline-active" : ""}`}>
          <span>{fixture.goals.home ?? "–"}</span>
          <span className="score-separator">:</span>
          <span>{fixture.goals.away ?? "–"}</span>
        </div>

        <div className="team-side team-away">
          <span className="team-name">{fixture.teams.away.name}</span>
          <TeamMark
            name={fixture.teams.away.name}
            logo={fixture.teams.away.logo}
          />
        </div>
      </div>

      <div className="fixture-foot">
        <span>
          {fixture.fixture.venue?.name ||
            fixture.league.round ||
            "Match fixture"}
        </span>

        <div className="fixture-actions">
          <button
            className="insight-button"
            onClick={onToggleDetails}
            type="button"
          >
            {expanded ? <X size={12} /> : <Activity size={12} />}
            {expanded ? "Close details" : "Match details"}
          </button>

          <button
            className="insight-button"
            onClick={() => onAnalyze(fixture)}
            disabled={insightLoading}
            type="button"
          >
            <Sparkles size={12} className={insightLoading ? "spin" : ""} />
            {insightLoading
              ? "Analyzing..."
              : insight
                ? "Refresh insight"
                : "AI insight"}
          </button>
        </div>
      </div>

      <OddsMonitor
        fixtureId={fixture.fixture.id}
        homeName={fixture.teams.home.name}
        awayName={fixture.teams.away.name}
        kickoff={fixture.fixture.date}
      />

      {expanded && (
        <MatchDetails
          fixtureId={fixture.fixture.id}
          homeName={fixture.teams.home.name}
          awayName={fixture.teams.away.name}
        />
      )}

      {insightError && (
        <div className="insight-error" role="alert">
          {insightError}
        </div>
      )}

      {insight && (
        <section className="insight-panel">
          <div className="insight-topline">
            <span className="insight-label">
              <Sparkles size={13} /> BETMIND AI ANALYSIS
            </span>
            <span
              className={`confidence confidence-${insight.confidence.toLowerCase()}`}
            >
              {insight.confidence} CONFIDENCE
            </span>
          </div>

          <p className="insight-summary">{insight.summary}</p>

          <div className="insight-metrics">
            <div>
              <small>PROVISIONAL PICK</small>
              <strong>{insight.pickLabel}</strong>
            </div>
            <div>
              <small>RISK SCORE</small>
              <strong>{insight.risk}/5</strong>
            </div>
          </div>

          {insight.reasoning.length > 0 && (
            <ul className="insight-reasons">
              {insight.reasoning.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
          )}

          <p className="insight-limitations">
            <strong>Data limitation:</strong> {insight.limitations}
          </p>
        </section>
      )}
    </article>
  );
}

export default function Home() {
  const [date, setDate] = useState("");
  const [league, setLeague] = useState("all");
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("all");
  const [search, setSearch] = useState("");
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [insights, setInsights] = useState<Record<number, MatchInsight>>({});
  const [insightErrors, setInsightErrors] = useState<Record<number, string>>({});
  const [insightLoadingId, setInsightLoadingId] = useState<number | null>(null);
  const [expandedFixtureId, setExpandedFixtureId] = useState<number | null>(null);

  useEffect(() => {
    setDate(todayInAthens());
  }, []);

  const loadFixtures = useCallback(async () => {
    if (!date) return;

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ date });
      const response = await fetch(`/api/fixtures?${params.toString()}`, {
        cache: "no-store",
      });

      const data = (await response.json()) as FixturesResponse;

      if (!response.ok) {
        throw new Error(data.error || "Fixtures could not be loaded.");
      }

      setFixtures(data.fixtures || []);
      setLastUpdated(new Date());
    } catch (reason) {
      setFixtures([]);
      setError(
        reason instanceof Error ? reason.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void loadFixtures();
  }, [loadFixtures]);

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

      const data = (await response.json()) as {
        insight?: MatchInsight;
        error?: string;
      };

      if (!response.ok || !data.insight) {
        throw new Error(data.error || "Could not generate this insight.");
      }

      setInsights((current) => ({ ...current, [id]: data.insight! }));
    } catch (reason) {
      setInsightErrors((current) => ({
        ...current,
        [id]:
          reason instanceof Error
            ? reason.message
            : "Could not generate this insight.",
      }));
    } finally {
      setInsightLoadingId(null);
    }
  }, []);

  const counts = useMemo(() => {
    return {
      all: fixtures.length,
      live: fixtures.filter((item) => isLive(item.fixture.status.short)).length,
      finished: fixtures.filter((item) => isFinished(item.fixture.status.short))
        .length,
      upcoming: fixtures.filter(
        (item) =>
          !isLive(item.fixture.status.short) &&
          !isFinished(item.fixture.status.short)
      ).length,
    };
  }, [fixtures]);

  const leagueCounts = useMemo(() => {
    const result: Record<number, number> = {};

    for (const fixture of fixtures) {
      result[fixture.league.id] = (result[fixture.league.id] || 0) + 1;
    }

    return result;
  }, [fixtures]);

  const visibleFixtures = useMemo(() => {
    const query = search.trim().toLowerCase();

    return fixtures.filter((fixture) => {
      const status = fixture.fixture.status.short;
      const matchesLeague =
        league === "all" || String(fixture.league.id) === league;

      const matchesStatus =
        matchFilter === "all" ||
        (matchFilter === "live" && isLive(status)) ||
        (matchFilter === "finished" && isFinished(status)) ||
        (matchFilter === "upcoming" &&
          !isLive(status) &&
          !isFinished(status));

      const searchableText = [
        fixture.teams.home.name,
        fixture.teams.away.name,
        fixture.league.name,
        fixture.league.country,
      ]
        .join(" ")
        .toLowerCase();

      return (
        matchesLeague &&
        matchesStatus &&
        (!query || searchableText.includes(query))
      );
    });
  }, [fixtures, league, matchFilter, search]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="BetMind AI home">
          <span className="brand-mark">
            <Activity size={22} strokeWidth={2.5} />
          </span>
          <span className="brand-copy">
            <strong>
              betmind<span>.ai</span>
            </strong>
            <small>FOOTBALL INTELLIGENCE</small>
          </span>
        </a>

        <div className="side-label">WORKSPACE</div>

        <button className="nav-item nav-active" type="button">
          <Activity size={17} />
          <span>Match centre</span>
          <span className="nav-key">01</span>
        </button>

        <button
          className="nav-item"
          type="button"
          onClick={() =>
            document
              .getElementById("coming-soon")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          <Sparkles size={17} />
          <span>AI insights</span>
          <span className="soon-tag">SOON</span>
        </button>

        <button
          className="nav-item"
          type="button"
          onClick={() =>
            document
              .getElementById("coming-soon")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          <Trophy size={17} />
          <span>Performance</span>
          <span className="soon-tag">SOON</span>
        </button>

        <div className="sidebar-bottom">
          <div className="sidebar-status">
            <span className="status-led" />
            <div>
              <strong>Data connection</strong>
              <small>API-Football</small>
            </div>
            <Wifi size={15} />
          </div>

          <div className="sidebar-note">
            <ShieldCheck size={16} />
            <span>Built for transparent, data-led analysis.</span>
          </div>

          <div className="side-version">
            BETMIND AI <span>v0.2.0</span>
          </div>
        </div>
      </aside>

      <section className="main-panel">
        <div className="content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" /> THE MATCHDAY BRIEFING
              </div>
              <h1>
                See the game <span>in data.</span>
              </h1>
              <p className="page-subtitle">
                Your football dashboard for fixtures, live scores and smarter
                match insights.
              </p>
            </div>

            <div className="date-display">
              <CalendarDays size={16} />
              <span>{date ? dateLabel(date) : "Loading date..."}</span>
            </div>
          </div>

          <section className="hero-banner">
            <div className="hero-grid" />
            <div className="hero-content">
              <div className="hero-chip">
                <span className="hero-chip-dot" /> YOUR DAILY MATCH INTELLIGENCE
              </div>
              <h2>
                Football is a game.
                <br />
                <span>Data tells the story.</span>
              </h2>
              <p>
                Fixtures first. Evidence always. Every insight should be
                measurable.
              </p>
              <div className="hero-points">
                <span>
                  <span className="point-check">✓</span> Real fixtures
                </span>
                <span>
                  <span className="point-check">✓</span> Transparent tracking
                </span>
                <span>
                  <span className="point-check">✓</span> No guaranteed outcomes
                </span>
              </div>
            </div>

            <div className="hero-orb">
              <div className="orb-ring ring-one" />
              <div className="orb-ring ring-two" />
              <div className="orb-core">
                <Activity size={35} />
              </div>
              <span className="orb-label orb-label-top">MATCH DATA</span>
              <span className="orb-label orb-label-bottom">SIGNAL / NOISE</span>
            </div>
          </section>

          <div className="matches-heading">
            <div>
              <div className="heading-title-row">
                <h2>Fixtures & scores</h2>
                <span className="count-pill">
                  {loading ? "..." : visibleFixtures.length}
                </span>
              </div>
              <p>Match information sourced from API-Football.</p>
            </div>

            <div className="date-controls">
              <button
                className="refresh-button"
                onClick={() => void loadFixtures()}
                disabled={loading}
                type="button"
              >
                <RefreshCw
                  size={14}
                  className={loading ? "spin" : ""}
                />
                Refresh
              </button>

              <button
                aria-label="Previous day"
                onClick={() => setDate((value) => shiftDate(value, -1))}
                disabled={!date}
                type="button"
              >
                <ChevronLeft size={16} />
              </button>

              <input
                aria-label="Select fixture date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />

              <button
                aria-label="Next day"
                onClick={() => setDate((value) => shiftDate(value, 1))}
                disabled={!date}
                type="button"
              >
                <ChevronRight size={16} />
              </button>

              <button
                className="today-button"
                onClick={() => setDate(todayInAthens())}
                type="button"
              >
                Today
              </button>
            </div>
          </div>

          <div className="match-status-filters">
            {(
              [
                ["all", "All matches", counts.all],
                ["live", "Live", counts.live],
                ["upcoming", "Upcoming", counts.upcoming],
                ["finished", "Finished", counts.finished],
              ] as [MatchFilter, string, number][]
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                className={matchFilter === key ? "filter-active" : ""}
                onClick={() => setMatchFilter(key)}
              >
                {key === "live" && <span className="live-pulse" />}
                {label} ({count})
              </button>
            ))}
          </div>

          <div className="match-search-row">
            <div className="match-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search team, league or country..."
                aria-label="Search matches"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="league-filters" aria-label="Filter by league">
            <button
              className={league === "all" ? "filter-active" : ""}
              onClick={() => setLeague("all")}
              type="button"
            >
              <ArrowDownUp size={13} /> All leagues ({fixtures.length})
            </button>

            {LEAGUES.map((item) => (
              <button
                key={item.id}
                className={league === String(item.id) ? "filter-active" : ""}
                onClick={() => setLeague(String(item.id))}
                type="button"
              >
                {item.shortName} ({leagueCounts[item.id] || 0})
              </button>
            ))}
          </div>

          <div className="last-updated">
            {lastUpdated
              ? `Last updated: ${lastUpdated.toLocaleTimeString("en-GB", {
                  timeZone: "Europe/Athens",
                  hour: "2-digit",
                  minute: "2-digit",
                })} · Europe/Athens`
              : "Waiting for match data..."}
          </div>

          <div className="fixture-list">
            {loading && (
              <div className="state-panel">
                <div className="loader-ring" />
                <strong>Loading matchday data</strong>
                <span>
                  Fetching fixtures for your selected competitions...
                </span>
              </div>
            )}

            {!loading && error && (
              <div className="state-panel error-panel">
                <CircleHelp size={26} />
                <strong>We couldn't load the fixtures</strong>
                <span>{error}</span>
                <button
                  className="retry-button"
                  onClick={() => void loadFixtures()}
                  type="button"
                >
                  <RefreshCw size={14} /> Try again
                </button>
              </div>
            )}

            {!loading && !error && visibleFixtures.length === 0 && (
              <div className="state-panel">
                <CalendarDays size={26} />
                <strong>No matches found</strong>
                <span>
                  Try another date, competition or search term.
                </span>
                <button
                  className="retry-button"
                  onClick={() => {
                    setSearch("");
                    setLeague("all");
                    setMatchFilter("all");
                  }}
                  type="button"
                >
                  Clear filters
                </button>
              </div>
            )}

            {!loading &&
              !error &&
              visibleFixtures.map((fixture) => (
                <FixtureCard
                  key={fixture.fixture.id}
                  fixture={fixture}
                  onAnalyze={analyzeFixture}
                  insight={insights[fixture.fixture.id]}
                  insightLoading={insightLoadingId === fixture.fixture.id}
                  insightError={insightErrors[fixture.fixture.id]}
                  expanded={expandedFixtureId === fixture.fixture.id}
                  onToggleDetails={() =>
                    setExpandedFixtureId((current) =>
                      current === fixture.fixture.id
                        ? null
                        : fixture.fixture.id
                    )
                  }
                />
              ))}
          </div>

          <section id="coming-soon" className="roadmap-card">
            <div className="roadmap-icon">
              <Sparkles size={18} />
            </div>
            <div className="roadmap-copy">
              <strong>Match Centre · Phase 1</strong>
              <span>
                Status filters, team and league search, plus expandable match
                details. Events, statistics and lineups depend on API-Football
                coverage.
              </span>
            </div>
            <span className="roadmap-badge">PHASE 1</span>
          </section>

          <footer className="footer">
            <span>© {new Date().getFullYear()} BetMind AI</span>
            <span>
              <Clock3 size={12} /> All fixture times shown in Europe/Athens
            </span>
            <span>DATA-DRIVEN. NEVER GUARANTEED.</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
