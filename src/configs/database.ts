import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { hydrateProcessEnvFromDotenvFile } from "../config/app-env";
import {
  databaseConfig,
  resolveDbConnectionTimeoutMs,
  resolveDbPoolMax,
} from "../config/database-config";

export type Database = NodePgDatabase;

type DatabaseHandle = {
  db: Database;
  close: () => Promise<void>;
};

let handle: DatabaseHandle | undefined;

function activeDb(): Database {
  return initDatabase().db;
}

function pgPool(): Pool {
  const client = activeDb() as Database & { session?: { client: Pool } };
  const pool = client.session?.client;
  if (!pool?.query) {
    throw new Error("PostgreSQL pool is not available on Drizzle session");
  }
  return pool;
}

export async function queryRaw<T extends Record<string, unknown>>(
  text: string,
  values: unknown[] = []
): Promise<T[]> {
  const result = await pgPool().query(text, values);
  return result.rows as T[];
}

export type ScriptSqlResult = {
  rows: Record<string, unknown>[];
  rowCount: number;
  command: string;
};

export async function executeScriptSql(sql: string): Promise<ScriptSqlResult> {
  const result = await pgPool().query(sql);
  return {
    rows: (result.rows ?? []) as Record<string, unknown>[],
    rowCount: result.rowCount ?? 0,
    command: result.command ?? "",
  };
}

export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const client = activeDb();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

function buildDatabaseHandle(): DatabaseHandle {
  hydrateProcessEnvFromDotenvFile();

  const pool = new Pool({
    ...databaseConfig(),
    max: resolveDbPoolMax(),
    connectionTimeoutMillis: resolveDbConnectionTimeoutMs(),
    idleTimeoutMillis: 30_000,
    keepAlive: true,
  });
  pool.on("error", () => undefined);
  return { db: drizzle(pool), close: () => pool.end() };
}

export function initDatabase(): DatabaseHandle {
  if (!handle) {
    handle = buildDatabaseHandle();
  }
  return handle;
}

export async function closeDatabase(): Promise<void> {
  if (handle) {
    await handle.close();
    handle = undefined;
  }
}

export async function reloadDatabase(): Promise<void> {
  await closeDatabase();
  initDatabase();
}
