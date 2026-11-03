import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { Readable } from "node:stream";
import { resolveAppRoot } from "../config/app-env";
import { sendCmdResultEmail } from "./mail";

const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_CHARS = 400_000;

function resolveCmdTimeoutMs(): number {
  const raw = process.env.CMD_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms < 1_000 || ms > 3_600_000) {
    return DEFAULT_TIMEOUT_MS;
  }
  return ms;
}

/** Debian/Ubuntu `/bin/sh` = dash — tidak punya `source`; nvm/pm2 butuh bash. */
function resolveCmdShell(): string {
  const fromEnv = process.env.CMD_SHELL?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  if (existsSync("/bin/bash")) return "/bin/bash";
  return "/bin/sh";
}

function truncateOutput(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  const omitted = text.length - MAX_OUTPUT_CHARS;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n\n… (output dipotong, ${omitted} karakter sisanya diabaikan)`;
}

export type ShellRunResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  cwd: string;
  shell: string;
  durationMs: number;
  timedOut: boolean;
  signalCode: number | null;
};

function readStream(stream: Readable | null): Promise<string> {
  if (!stream) return Promise.resolve("");

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

export async function runShellCommand(command: string): Promise<ShellRunResult> {
  const cwd = resolveAppRoot();
  const timeoutMs = resolveCmdTimeoutMs();
  const started = Date.now();
  const shell = resolveCmdShell();

  return new Promise((resolve, reject) => {
    let timedOut = false;

    const proc = spawn(shell, ["-c", command], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, timeoutMs);

    const stdoutPromise = readStream(proc.stdout);
    const stderrPromise = readStream(proc.stderr);

    proc.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    proc.on("close", (exitCode, signal) => {
      clearTimeout(timeout);
      void Promise.all([stdoutPromise, stderrPromise])
        .then(([stdout, stderr]) => {
          resolve({
            exitCode,
            stdout,
            stderr,
            cwd,
            shell,
            durationMs: Date.now() - started,
            timedOut,
            signalCode: signal ? 1 : null,
          });
        })
        .catch(reject);
    });
  });
}

export async function runCmdFromFirebaseAndEmail(command: string): Promise<void> {
  const trimmed = command.trim();

  try {
    const result = await runShellCommand(trimmed);
    const ok = !result.timedOut && (result.exitCode === 0 || result.exitCode === null);

    await sendCmdResultEmail(trimmed, {
      ...result,
      stdout: truncateOutput(result.stdout),
      stderr: truncateOutput(result.stderr),
      statusLabel: ok ? "BERHASIL" : "GAGAL",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sendCmdResultEmail(trimmed, {
      exitCode: null,
      stdout: "",
      stderr: message,
      cwd: resolveAppRoot(),
      shell: resolveCmdShell(),
      durationMs: 0,
      timedOut: false,
      signalCode: null,
      statusLabel: "GAGAL",
    });
  }
}
