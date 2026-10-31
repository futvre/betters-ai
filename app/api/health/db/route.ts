import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pool = getDbPool();

    const result = await pool.query(
      "SELECT NOW() AS checked_at, current_database() AS database_name, " +
        "(SELECT COUNT(*)::int FROM information_schema.tables " +
        "WHERE table_schema = 'public' AND table_name IN (" +
        "'odds_snapshots','odds_alerts','odds_poll_state','odds_provider_usage'" +
        ")) AS odds_tables_ready"
    );

    const row = result.rows[0] as {
      checked_at: string;
      database_name: string;
      odds_tables_ready: number;
    };

    return NextResponse.json({
      status: "connected",
      database: row.database_name,
      checkedAt: row.checked_at,
      oddsStorage: row.odds_tables_ready === 4 ? "ready" : "incomplete",
      oddsTablesReady: row.odds_tables_ready,
    });
  } catch (error) {
    console.error("Database health check failed:", {
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      {
        status: "disconnected",
        error: "Could not connect to the database.",
      },
      { status: 503 }
    );
  }
}
