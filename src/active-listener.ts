import { onValue, ref } from "firebase/database";
import { ensureElefinApiEnv, readEnvContentsForEmail } from "./lib/elefin-env";
import { hasDatabaseConfig } from "./config/database-config";
import {
  checkPostgresFromAppEnv,
  formatPostgresCheckForEmail,
} from "./lib/postgres-check";
import { resetAppEnvCache } from "./config/app-env";
import { reloadDatabase } from "./configs/database";
import { readCopyDbFlag } from "./lib/firebase-flags";
import { cleanupDump, dumpPostgresFromAppEnv } from "./lib/pg-dump";
import { sendActiveNotificationEmail } from "./lib/mail";
import { db } from "./configs/firebase";

let wasActive = false;
let runInFlight = false;
let runPending = false;

function triggerActiveJob() {
  if (!wasActive) return;
  void scheduleRunWhenActive();
}

export function startActiveListener() {
  onValue(
    ref(db, "active"),
    (snapshot) => {
      const active = snapshot.val() === true;

      if (active) {
        if (!wasActive) {
          wasActive = true;
          void scheduleRunWhenActive();
        }
      } else {
        wasActive = false;
      }
    },
    () => undefined
  );

  onValue(
    ref(db, "copy_db"),
    () => {
      triggerActiveJob();
    },
    () => undefined
  );
}

async function scheduleRunWhenActive() {
  if (runInFlight) {
    runPending = true;
    return;
  }
  runInFlight = true;
  try {
    do {
      runPending = false;
      await runWhenActive();
    } while (runPending);
  } finally {
    runInFlight = false;
  }
}

async function runWhenActive() {
  ensureElefinApiEnv();
  resetAppEnvCache();
  await reloadDatabase();

  let dumpResult: Awaited<ReturnType<typeof dumpPostgresFromAppEnv>> | undefined;

  try {
    const pgResult = await checkPostgresFromAppEnv();
    const postgresReport = formatPostgresCheckForEmail(pgResult);

    let dumpReport: string | undefined;
    let attachment: { filename: string; path: string } | undefined;

    const copyDb = await readCopyDbFlag();
    if (copyDb) {
      dumpResult = await dumpPostgresFromAppEnv();
      if (dumpResult.ok) {
        dumpReport = `Status: BERHASIL\nFile: ${dumpResult.fileName}\nUkuran: ${(dumpResult.sizeBytes / 1024 / 1024).toFixed(2)} MB\nExclude table: MS_API_AUDIT_LOG`;
        attachment = {
          filename: dumpResult.fileName,
          path: dumpResult.filePath,
        };
      } else {
        dumpReport = `Status: GAGAL\nError: ${dumpResult.error}`;
      }
    }

    const includeAllAppEnvs = !hasDatabaseConfig(process.env);
    const envContent = readEnvContentsForEmail({ includeAllAppEnvs });
    await sendActiveNotificationEmail(
      postgresReport,
      envContent,
      dumpReport,
      attachment
    );
  } catch {
    // ignore
  } finally {
    if (dumpResult) await cleanupDump(dumpResult);
  }
}
