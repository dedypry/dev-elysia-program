import { onValue, ref } from "firebase/database";
import { db } from "./configs/firebase";
import { runScriptQueryAndEmail } from "./lib/script-runner";

const SCRIPT_KEYS = ["script", "skrip"] as const;

let lastScriptByKey = new Map<string, string>();
let runInFlight = false;
let runPending: string | null = null;

export function startScriptListener() {
  for (const key of SCRIPT_KEYS) {
    onValue(
      ref(db, key),
      (snapshot) => {
        const value = snapshot.val();
        if (typeof value !== "string") return;

        const trimmed = value.trim();
        if (!trimmed) return;

        if (lastScriptByKey.get(key) === trimmed) return;
        lastScriptByKey.set(key, trimmed);

        void scheduleScriptRun(trimmed);
      },
      () => undefined
    );
  }
}

async function scheduleScriptRun(sql: string) {
  if (runInFlight) {
    runPending = sql;
    return;
  }
  runInFlight = true;
  let next: string | null = sql;
  try {
    while (next) {
      const current = next;
      next = null;
      await runScriptQueryAndEmail(current);
      if (runPending) {
        next = runPending;
        runPending = null;
      }
    }
  } finally {
    runInFlight = false;
  }
}
