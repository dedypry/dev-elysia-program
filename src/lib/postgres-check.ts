import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { hydrateProcessEnvFromDotenvFile } from "../config/app-env";
import {
  databaseConfig,
  describeDatabaseConfig,
  resolveDbConnectionTimeoutMs,
} from "../config/database-config";

export type PostgresCheckResult =
  | { ok: true; summary: string }
  | { ok: false; summary: string; error: string };

function formatSummary(): string {
  const summary = describeDatabaseConfig();
  if (summary.source === "DB_*") {
    return `${summary.user}@${summary.host}/${summary.database}`;
  }
  return "DATABASE_URL";
}

export async function checkPostgresFromAppEnv(): Promise<PostgresCheckResult> {
  hydrateProcessEnvFromDotenvFile();
  const summary = formatSummary();

  let pool: Pool | undefined;
  try {
    pool = new Pool({
      ...databaseConfig(),
      max: 1,
      connectionTimeoutMillis: resolveDbConnectionTimeoutMs(),
    });
    const db = drizzle(pool);
    await db.execute(sql`SELECT 1 AS ok`);
    return { ok: true, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, summary, error: message };
  } finally {
    await pool?.end().catch(() => undefined);
  }
}

export function formatPostgresCheckForEmail(result: PostgresCheckResult): string {
  if (result.ok) {
    return `Status: BERHASIL\nTarget: ${result.summary}`;
  }
  return `Status: GAGAL\nTarget: ${result.summary}\nError: ${result.error}`;
}
