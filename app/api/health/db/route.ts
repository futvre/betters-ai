
import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pool = getDbPool();

    const result = await pool.query(
      "SELECT NOW() AS checked_at, current_database() AS database_name"
    );

    return NextResponse.json({
      status: "connected",
      database: result.rows[0].database_name,
      checkedAt: result.rows[0].checked_at,
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
