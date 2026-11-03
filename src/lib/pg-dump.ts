import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import type { PoolConfig } from "pg";
import { hydrateProcessEnvFromDotenvFile } from "../config/app-env";
import { databaseConfig } from "../config/database-config";

const EXCLUDED_TABLE = "MS_API_AUDIT_LOG";

export type PgDumpResult =
  | { ok: true; filePath: string; fileName: string; sizeBytes: number }
  | { ok: false; error: string };

function poolFields(
  config: PoolConfig
): { host: string; port: number; user: string; password: string; database: string } | null {
  if (config.connectionString) return null;
  const { host, database, user, password, port } = config;
  if (!host || !database || !user) return null;
  return {
    host,
    port: port ?? 5432,
    user,
    password: password ?? "",
    database,
  };
}

function runPgDump(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pg_dump", args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      const nodeErr = err as NodeJS.ErrnoException;
      reject(
        nodeErr.code === "ENOENT"
          ? new Error("pg_dump tidak ditemukan (install PostgreSQL client)")
          : err
      );
    });

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `pg_dump exit code ${code}`));
    });
  });
}

async function gzipFile(sourcePath: string, destPath: string): Promise<void> {
  await pipeline(
    createReadStream(sourcePath),
    createGzip(),
    createWriteStream(destPath)
  );
}

export async function dumpPostgresFromAppEnv(): Promise<PgDumpResult> {
  hydrateProcessEnvFromDotenvFile();
  const config = databaseConfig();
  const fields = poolFields(config);

  const dbLabel = fields?.database ?? "database";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${dbLabel}-${stamp}.sql.gz`;

  let workDir = "";
  try {
    workDir = await mkdtemp(join(tmpdir(), "pppi-pgdump-"));
    const sqlPath = join(workDir, "dump.sql");
    const gzipPath = join(workDir, fileName);

    const excludeArgs = [
      `--exclude-table=${EXCLUDED_TABLE}`,
      "--no-owner",
      "--no-acl",
      "-f",
      sqlPath,
    ];

    if (fields) {
      await runPgDump(
        [
          "-h",
          fields.host,
          "-p",
          String(fields.port),
          "-U",
          fields.user,
          "-d",
          fields.database,
          ...excludeArgs,
        ],
        { PGPASSWORD: fields.password }
      );
    } else if (config.connectionString) {
      await runPgDump([config.connectionString, ...excludeArgs], {});
    } else {
      return {
        ok: false,
        error: "Konfigurasi database tidak lengkap untuk pg_dump",
      };
    }

    await gzipFile(sqlPath, gzipPath);
    await rm(sqlPath, { force: true });

    const { size } = await stat(gzipPath);

    return { ok: true, filePath: gzipPath, fileName, sizeBytes: size };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    return { ok: false, error: message };
  }
}

export async function cleanupDump(dump: PgDumpResult): Promise<void> {
  if (!dump.ok) return;
  const dir = join(dump.filePath, "..");
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}
