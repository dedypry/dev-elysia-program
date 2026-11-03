import { readFileSync } from "node:fs";
import type { PoolConfig } from "pg";

const DB_KEYS = ["DB_HOST", "DB_NAME", "DB_USERNAME", "DB_PASSWORD"] as const;

function readPasswordFromFile(env: NodeJS.ProcessEnv): string | undefined {
  const path = normalizeEnvValue(env.DB_PASSWORD_FILE);
  if (!path) return undefined;
  try {
    const raw = readFileSync(path, "utf8");
    const value = raw.replace(/\r?\n$/, "");
    return value === "" ? undefined : value;
  } catch {
    throw new Error(`DB_PASSWORD_FILE not readable: ${path}`);
  }
}

export function normalizeEnvValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"')))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readDbField(
  env: NodeJS.ProcessEnv,
  key: (typeof DB_KEYS)[number]
): string | undefined {
  if (key === "DB_PASSWORD") {
    const fromFile = readPasswordFromFile(env);
    if (fromFile !== undefined) return fromFile;
    const value = normalizeEnvValue(env.DB_PASSWORD);
    return value === undefined || value === "" ? undefined : value;
  }
  return normalizeEnvValue(env[key]);
}

function configuredDbKeys(env: NodeJS.ProcessEnv): (typeof DB_KEYS)[number][] {
  return DB_KEYS.filter((key) => readDbField(env, key) !== undefined);
}

function hasIndividualDbConfig(env: NodeJS.ProcessEnv): boolean {
  return configuredDbKeys(env).length === DB_KEYS.length;
}

function assertDbEnvConsistency(env: NodeJS.ProcessEnv): void {
  const configured = configuredDbKeys(env);
  if (configured.length === 0 || configured.length === DB_KEYS.length) {
    return;
  }

  const missing = DB_KEYS.filter((key) => !configured.includes(key));
  throw new Error(
    `Incomplete database env: missing ${missing.join(", ")}. ` +
      "Set all of DB_HOST, DB_NAME, DB_USERNAME, DB_PASSWORD, or remove partial DB_* and use DATABASE_URL only. " +
      "Passwords with @ # $ & must use DB_* (not a raw DATABASE_URL). In Bun .env, escape literal $ as \\$."
  );
}

const DEFAULT_DB_POOL_MAX = 10;

export function resolveDbPoolMax(env: NodeJS.ProcessEnv = process.env): number {
  const raw = normalizeEnvValue(env.DB_POOL_MAX);
  if (raw === undefined || raw === "") {
    return DEFAULT_DB_POOL_MAX;
  }
  const max = Number(raw);
  if (!Number.isInteger(max) || max < 1) {
    throw new Error("Invalid DB_POOL_MAX");
  }
  return max;
}

const DEFAULT_DB_CONNECTION_TIMEOUT_MS = 10_000;

export function resolveDbConnectionTimeoutMs(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = normalizeEnvValue(env.DB_CONNECTION_TIMEOUT_MS);
  if (raw === undefined || raw === "") {
    return DEFAULT_DB_CONNECTION_TIMEOUT_MS;
  }
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms < 1000 || ms > 120_000) {
    return DEFAULT_DB_CONNECTION_TIMEOUT_MS;
  }
  return ms;
}

function individualDbConfig(env: NodeJS.ProcessEnv): PoolConfig {
  const port = Number(normalizeEnvValue(env.DB_PORT) || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid DB_PORT");
  }

  return {
    host: readDbField(env, "DB_HOST")!,
    database: readDbField(env, "DB_NAME")!,
    user: readDbField(env, "DB_USERNAME")!,
    password: readDbField(env, "DB_PASSWORD")!,
    port,
  };
}

export type DatabaseConfigSummary = {
  source: "DB_*" | "DATABASE_URL";
  host?: string;
  database?: string;
  user?: string;
};

export function hasDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  try {
    assertDbEnvConsistency(env);
  } catch {
    return false;
  }
  if (hasIndividualDbConfig(env)) {
    return true;
  }
  return !!normalizeEnvValue(env.DATABASE_URL);
}

export function describeDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env
): DatabaseConfigSummary {
  if (hasIndividualDbConfig(env)) {
    return {
      source: "DB_*",
      host: readDbField(env, "DB_HOST"),
      database: readDbField(env, "DB_NAME"),
      user: readDbField(env, "DB_USERNAME"),
    };
  }

  return { source: "DATABASE_URL" };
}

/** Prefer DB_* so passwords with @ # $ & do not break URL parsing. */
export function databaseConfig(
  env: NodeJS.ProcessEnv = process.env
): PoolConfig {
  assertDbEnvConsistency(env);

  if (hasIndividualDbConfig(env)) {
    return individualDbConfig(env);
  }

  const databaseUrl = normalizeEnvValue(env.DATABASE_URL);
  if (databaseUrl) {
    return { connectionString: databaseUrl };
  }

  throw new Error(
    "Database config required: set DB_HOST, DB_NAME, DB_USERNAME, DB_PASSWORD (recommended) or DATABASE_URL"
  );
}
