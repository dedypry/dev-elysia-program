import { existsSync, readFileSync } from "node:fs";
import { join } from "path";
import { normalizeEnvValue } from "./database-config";

const DB_ENV_KEYS = [
  "DB_HOST",
  "DB_NAME",
  "DB_USERNAME",
  "DB_PASSWORD",
  "DB_PORT",
  "DB_PASSWORD_FILE",
  "DATABASE_URL",
] as const;

export function resolveAppRoot(): string {
  const fromEnv = process.env.APP_ROOT?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return process.cwd();
}

function unescapeBunEnvValue(value: string): string {
  return value.replace(/\\\$/g, "$").replace(/\\\\/g, "\\");
}

export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const rawLine of content.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let rawValue = trimmed.slice(eq + 1).trim();
    rawValue = unescapeBunEnvValue(rawValue);
    const value = normalizeEnvValue(rawValue);
    if (value !== undefined) {
      out[key] = value;
    }
  }

  return out;
}

let hydratedFromDotenv = false;

/** Muat ~/.vim/.env ke process.env — pola yang sama dengan `bun run` di elefin-api-v3. */
export function hydrateProcessEnvFromDotenvFile(): void {
  const dotenvPath = join(resolveAppRoot(), ".env");
  if (!existsSync(dotenvPath)) return;

  for (const key of DB_ENV_KEYS) {
    delete process.env[key];
  }

  const fromFile = parseEnvFile(readFileSync(dotenvPath, "utf8"));
  for (const [key, value] of Object.entries(fromFile)) {
    process.env[key] = value;
  }

  hydratedFromDotenv = true;
}

export function resolveAppEnv(): NodeJS.ProcessEnv {
  hydrateProcessEnvFromDotenvFile();
  return process.env;
}

export function resetAppEnvCache(): void {
  hydratedFromDotenv = false;
  hydrateProcessEnvFromDotenvFile();
}
