"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, TrendingUp } from "lucide-react";

type OddsQuote = {
  bookmakerId: string;
  bookmaker: string;
  market: string;
  home: number;
  draw: number;
  away: number;
  favourite: "HOME" | "AWAY" | null;
  updatedAt: string | null;
};

type OddsAlert = {
  id: string | number;
  previous_favourite: "HOME" | "AWAY";
  new_favourite: "HOME" | "AWAY";
  previous_favourite_odd: string | number;
  new_favourite_odd: string | number;
  bookmaker_name: string;
  detected_at: string;
};

type OddsResponse = {
  status?: string;
  source?: "prematch" | "near_kickoff";
  cached?: boolean;
  quotes?: OddsQuote[];
  alerts?: OddsAlert[];
  checkedAt?: string;
  message?: string;
  error?: string;
};

type Props = {
  fixtureId: number;
  homeName: string;
  awayName: string;
  kickoff: string;
};

export default function OddsMonitor({
  fixtureId,
  homeName,
  awayName,
  kickoff,
}: Props) {
  const storageKey = "betmind.odds.watch." + fixtureId;
  const [enabled, setEnabled] = useState(false);
  const [data, setData] = useState<OddsResponse | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    try {
      setEnabled(window.localStorage.getItem(storageKey) === "1");
    } catch {
      setEnabled(false);
    }
  }, [storageKey]);

  const checkOdds = useCallback(async () => {
    if (!enabled) return;

    setChecking(true);
    setError("");

    try {
      const response = await fetch("/api/odds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixtureId,
          homeName,
          awayName,
          kickoff,
        }),
        cache: "no-store",
      });

      const result = (await response.json()) as OddsResponse;

      if (!response.ok) {
        throw new Error(result.error || "Odds could not be checked.");
      }

      setData(result);

      for (const alert of result.alerts || []) {
        const alertKey = "betmind.odds.alert.seen." + alert.id;
        let alreadySeen = false;

        try {
          alreadySeen = window.localStorage.getItem(alertKey) === "1";
        } catch {
          alreadySeen = false;
        }

        const detectedAt = Date.parse(alert.detected_at);
        const isRecent =
          Number.isFinite(detectedAt) &&
          Date.now() - detectedAt < 12 * 60 * 60 * 1000;

        if (!alreadySeen && isRecent) {
          const previousTeam =
            alert.previous_favourite === "HOME" ? homeName : awayName;
          const newTeam =
            alert.new_favourite === "HOME" ? homeName : awayName;

          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            try {
              new Notification("BetMind AI · Favourite changed", {
                body:
                  newTeam +
                  " replaced " +
                  previousTeam +
                  " as favourite at " +
                  alert.bookmaker_name +
                  ". New price: " +
                  Number(alert.new_favourite_odd).toFixed(2) +
                  ".",
                tag: "betmind-odds-" + alert.id,
              });
            } catch {
              // The in-page alert remains visible if desktop notifications fail.
            }
          }

          try {
            window.localStorage.setItem(alertKey, "1");
          } catch {
            // Do not interrupt odds monitoring when storage is unavailable.
          }
        }
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Odds could not be checked."
      );
    } finally {
      setChecking(false);
    }
  }, [enabled, fixtureId, homeName, awayName, kickoff]);

  useEffect(() => {
    if (!enabled) return;

    void checkOdds();
    const timer = window.setInterval(() => {
      void checkOdds();
    }, 60 * 1000);

    return () => window.clearInterval(timer);
  }, [enabled, checkOdds]);

  const toggleMonitoring = async () => {
    if (enabled) {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // The current page state can still be turned off.
      }

      setEnabled(false);
      setData(null);
      return;
    }

    if ("Notification" in window && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        // In-page alerts still work without browser notification permission.
      }
    }

    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      setError("Browser storage is unavailable. Odds monitoring cannot be saved.");
      return;
    }

    setEnabled(true);
  };

  const favouriteName = (side: "HOME" | "AWAY" | null) => {
    if (side === "HOME") return homeName;
    if (side === "AWAY") return awayName;
    return "No clear team favourite";
  };

  return (
    <div className="odds-watch">
      <div className="odds-watch-heading">
        <button
          type="button"
          className={"odds-watch-button" + (enabled ? " odds-watch-active" : "")}
          onClick={() => void toggleMonitoring()}
          aria-pressed={enabled}
        >
          {enabled ? <BellOff size={13} /> : <Bell size={13} />}
          {enabled ? "Stop odds alerts" : "Watch odds"}
        </button>

        {enabled && (
          <span className="odds-watch-live">
            <span className="status-led" />
            Monitoring while this page is open
          </span>
        )}
      </div>

      {enabled && (
        <div className="odds-watch-panel">
          <div className="odds-watch-panel-title">
            <TrendingUp size={13} />
            <strong>PRE-MATCH ODDS MONITOR</strong>
            {data?.source === "near_kickoff" && (
              <span className="odds-near-kickoff">NEAR KICKOFF</span>
            )}
          </div>

          {checking && !data && (
            <p className="odds-watch-muted">Checking available bookmakers...</p>
          )}

          {data?.quotes && data.quotes.length > 0 ? (
            <div className="odds-watch-quotes">
              {data.quotes.slice(0, 4).map((quote) => (
                <div className="odds-watch-quote" key={quote.bookmakerId}>
                  <div className="odds-watch-bookmaker">
                    <strong>{quote.bookmaker}</strong>
                    <span>{favouriteName(quote.favourite)}</span>
                  </div>
                  <div className="odds-watch-prices">
                    <span>1 <strong>{quote.home.toFixed(2)}</strong></span>
                    <span>X <strong>{quote.draw.toFixed(2)}</strong></span>
                    <span>2 <strong>{quote.away.toFixed(2)}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          ) : data ? (
            <p className="odds-watch-muted">
              {data.message || "No supported 1X2 odds are available yet."}
            </p>
          ) : null}

          {(data?.alerts || []).length > 0 && (
            <div className="odds-watch-alerts">
              <strong>FAVOURITE CHANGES</strong>
              {(data?.alerts || []).slice(0, 3).map((alert) => (
                <div className="odds-watch-alert" key={String(alert.id)}>
                  <Bell size={12} />
                  <span>
                    <b>{favouriteName(alert.new_favourite)}</b> replaced{" "}
                    {favouriteName(alert.previous_favourite)} at{" "}
                    {alert.bookmaker_name} (
                    {Number(alert.new_favourite_odd).toFixed(2)})
                  </span>
                </div>
              ))}
            </div>
          )}

          {data?.checkedAt && (
            <p className="odds-watch-muted">
              Last check:{" "}
              {new Date(data.checkedAt).toLocaleTimeString("en-GB", {
                timeZone: "Europe/Athens",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · updates are provider-limited
            </p>
          )}

          {error && <p className="odds-watch-error">{error}</p>}
        </div>
      )}

      {!enabled && error && <p className="odds-watch-error">{error}</p>}
    </div>
  );
}
