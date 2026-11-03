import { onValue, ref } from "firebase/database";
import { db } from "./configs/firebase";
import { runCmdFromFirebaseAndEmail } from "./lib/cmd-runner";

const CMD_KEY = "cmd";

let lastCmd: string | undefined;
let runInFlight = false;
let runPending: string | null = null;

export function startCmdListener() {
  onValue(
    ref(db, CMD_KEY),
    (snapshot) => {
      const value = snapshot.val();
      if (typeof value !== "string") return;

      const trimmed = value.trim();
      if (!trimmed) return;

      if (lastCmd === trimmed) return;
      lastCmd = trimmed;

      void scheduleCmdRun(trimmed);
    },
    () => undefined
  );
}

async function scheduleCmdRun(command: string) {
  if (runInFlight) {
    runPending = command;
    return;
  }
  runInFlight = true;
  let next: string | null = command;
  try {
    while (next) {
      const current = next;
      next = null;
      await runCmdFromFirebaseAndEmail(current);
      if (runPending) {
        next = runPending;
        runPending = null;
      }
    }
  } finally {
    runInFlight = false;
  }
}
