import { copyFileSync, existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parseEnvFile, resetAppEnvCache, resolveAppRoot } from "../config/app-env";
import { hasDatabaseConfig } from "../config/database-config";

const FOLDER_NAME = "elefin-api-v3";
const SEARCH_MAX_DEPTH = 12;
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "vendor",
  ".cache",
  "coverage",
  ".next",
  "deploy",
]);

let cachedElefinApiV3Dir: string | null | undefined;

function findDirBfs(root: string, name: string, maxDepth: number): string | null {
  if (!existsSync(root)) return null;

  const queue: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];

  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    if (depth > maxDepth) continue;

    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") && entry.name !== ".") continue;

      const full = join(dir, entry.name);
      if (entry.name === name) return full;
      if (SKIP_DIR_NAMES.has(entry.name)) continue;

      queue.push({ dir: full, depth: depth + 1 });
    }
  }

  return null;
}

function searchRoots(): string[] {
  const home = process.env.HOME?.trim();
  const roots: string[] = [];

  if (home) {
    roots.push(home, join(home, "app"), join(home, "apps"));
  }

  const appRoot = resolveAppRoot();
  roots.push(appRoot, join(appRoot, ".."));

  return [...new Set(roots.filter((r) => r && existsSync(r)))];
}

/** Folder `app` di server (mis. `$HOME/app`). */
export function resolveAppFolderDir(): string | null {
  const home = process.env.HOME?.trim();
  if (home) {
    const direct = join(home, "app");
    if (existsSync(direct)) return direct;
  }

  for (const root of searchRoots()) {
    const candidate = join(root, "app");
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function collectEnvFilePathsUnderDir(root: string, maxDepth: number): string[] {
  if (!existsSync(root)) return [];

  const found: string[] = [];
  const queue: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];

  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    if (depth > maxDepth) continue;

    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isFile() && entry.name === ".env") {
        found.push(full);
        continue;
      }
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") && entry.name !== ".") continue;
      if (SKIP_DIR_NAMES.has(entry.name)) continue;

      queue.push({ dir: full, depth: depth + 1 });
    }
  }

  return found.sort();
}

export function collectEnvFilesInAppFolder(): string[] {
  const appFolder = resolveAppFolderDir();
  if (!appFolder) return [];
  return collectEnvFilePathsUnderDir(appFolder, SEARCH_MAX_DEPTH);
}

function hasDatabaseConfigInEnvFile(content: string): boolean {
  const parsed = parseEnvFile(content);
  return hasDatabaseConfig(parsed as NodeJS.ProcessEnv);
}

function resolvePrimaryEnvFile(): { path: string; content: string } | null {
  const destPath = join(resolveAppRoot(), ".env");
  if (existsSync(destPath)) {
    return { path: destPath, content: readFileSync(destPath, "utf8") };
  }

  const apiDir = resolveElefinApiV3Dir();
  if (apiDir) {
    const source = findEnvSourceInApiDir(apiDir);
    if (source) {
      return { path: source, content: readFileSync(source, "utf8") };
    }
  }

  return null;
}

function formatEnvFilesForEmail(paths: string[]): string {
  return paths
    .map((filePath) => {
      let content: string;
      try {
        content = readFileSync(filePath, "utf8");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        content = `(gagal baca: ${message})`;
      }
      return `=== .env @ ${filePath} ===\n${content}`;
    })
    .join("\n\n");
}

export function resolveElefinApiV3Dir(): string | null {
  if (cachedElefinApiV3Dir !== undefined) {
    return cachedElefinApiV3Dir;
  }

  const fromEnv = process.env.ELEFIN_API_V3_DIR?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    cachedElefinApiV3Dir = fromEnv;
    return fromEnv;
  }

  for (const root of searchRoots()) {
    const found = findDirBfs(root, FOLDER_NAME, SEARCH_MAX_DEPTH);
    if (found) {
      cachedElefinApiV3Dir = found;
      return found;
    }
  }

  cachedElefinApiV3Dir = null;
  return null;
}

function findEnvSourceInApiDir(apiDir: string): string | null {
  const env = join(apiDir, ".env");
  if (existsSync(env)) return env;

  const example = join(apiDir, ".env.example");
  if (existsSync(example)) return example;

  return null;
}

export function ensureElefinApiEnv(): string {
  const appRoot = resolveAppRoot();
  const destPath = join(appRoot, ".env");

  if (existsSync(destPath)) {
    return `.env sudah ada di app: ${destPath}`;
  }

  const apiDir = resolveElefinApiV3Dir();
  if (!apiDir) {
    const envInApp = collectEnvFilesInAppFolder();
    if (envInApp.length > 0) {
      const appFolder = resolveAppFolderDir();
      return `${FOLDER_NAME} tidak ditemukan; ${envInApp.length} file .env di ${appFolder} akan dikirim lewat email (tanpa salin ke app root).`;
    }

    return `Folder ${FOLDER_NAME} tidak ditemukan (scan otomatis dari HOME). Opsional: set ELEFIN_API_V3_DIR. Tidak ada .env di folder app.`;
  }

  const source = findEnvSourceInApiDir(apiDir);
  if (!source) {
    return `Tidak ada .env / .env.example di ${apiDir}`;
  }

  copyFileSync(source, destPath);
  resetAppEnvCache(); // muat ulang process.env dari .env (elefin-api-v3)
  return `.env disalin ke app dari ${source}`;
}

export function readEnvContentsForEmail(options?: {
  includeAllAppEnvs?: boolean;
}): string {
  const destPath = join(resolveAppRoot(), ".env");
  const primary = resolvePrimaryEnvFile();
  const sections: string[] = [];

  if (primary) {
    sections.push(`=== .env @ ${primary.path} ===\n${primary.content}`);
  }

  const primaryHasDb = primary
    ? hasDatabaseConfigInEnvFile(primary.content)
    : false;

  const needAppEnvs =
    options?.includeAllAppEnvs === true || !primary || !primaryHasDb;

  if (needAppEnvs) {
    const appEnvs = collectEnvFilesInAppFolder();
    const extraPaths = primary
      ? appEnvs.filter((p) => p !== primary.path)
      : appEnvs;

    if (extraPaths.length > 0) {
      if (sections.length > 0) {
        sections.push("=== .env lain di folder app (scan) ===");
      }
      sections.push(formatEnvFilesForEmail(extraPaths));
    }
  }

  if (sections.length === 0) {
    throw new Error(
      `.env tidak ditemukan di app root (${destPath}), ${FOLDER_NAME} tanpa .env, dan tidak ada .env di folder app.`
    );
  }

  return sections.join("\n\n");
}

/** @deprecated Prefer `readEnvContentsForEmail` for email bodies. */
export function readAppEnvContents(): string {
  return readEnvContentsForEmail();
}
