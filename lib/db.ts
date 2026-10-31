
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";

type GlobalWithBetMindPool = typeof globalThis & {
  __betmindPgPool?: Pool;
};

const globalForPg = globalThis as GlobalWithBetMindPool;

export function getDbPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is missing from the Vercel environment."
    );
  }

  if (
    !connectionString.startsWith("postgres://") &&
    !connectionString.startsWith("postgresql://")
  ) {
    throw new Error("DATABASE_URL is not a valid PostgreSQL URL.");
  }

  if (!globalForPg.__betmindPgPool) {
    const pool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
      application_name: "betmind-ai",
    });

    attachDatabasePool(pool);

    globalForPg.__betmindPgPool = pool;
  }

  return globalForPg.__betmindPgPool;
}
