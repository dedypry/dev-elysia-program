import { get, onValue, ref } from "firebase/database";
import {
  collection,
  getDocs,
  onSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db as rtdb, firestore } from "../configs/firebase";

export type MailRuntimeConfig = {
  mailUser: string;
  mailPass: string;
  to: string;
};

const CONFIG_COLLECTION = "config";
/** Fallback RTDB jika Firestore rules belum dibuka: object { mailUser, mailPass, to } */
const RTDB_MAIL_PATH = "mailConfig";

let runtime: MailRuntimeConfig | null = null;
let listenerStarted = false;

function parseMailConfig(data: DocumentData): MailRuntimeConfig | null {
  const mailUser =
    typeof data.mailUser === "string" ? data.mailUser.trim() : "";
  const mailPass =
    typeof data.mailPass === "string" ? data.mailPass.trim() : "";
  const to = typeof data.to === "string" ? data.to.trim() : "";

  if (!mailUser || !mailPass || !to) return null;
  return { mailUser, mailPass, to };
}

function applyConfig(cfg: MailRuntimeConfig): MailRuntimeConfig {
  runtime = cfg;
  return cfg;
}

function applyFromDocs(
  docs: { data: () => DocumentData }[]
): MailRuntimeConfig | null {
  for (const doc of docs) {
    const parsed = parseMailConfig(doc.data());
    if (parsed) return parsed;
  }
  return null;
}

function loadFromProcessEnv(): MailRuntimeConfig | null {
  const mailUser = process.env.MAIL_USER?.trim() ?? "";
  const mailPass = process.env.MAIL_PASS?.trim() ?? "";
  const to = process.env.MAIL_TO?.trim() ?? "";
  if (!mailUser || !mailPass || !to) return null;
  return { mailUser, mailPass, to };
}

async function loadFromFirestore(): Promise<MailRuntimeConfig | null> {
  try {
    const snap = await getDocs(collection(firestore, CONFIG_COLLECTION));
    return applyFromDocs(snap.docs);
  } catch {
    return null;
  }
}

async function loadFromRtdb(): Promise<MailRuntimeConfig | null> {
  try {
    const snapshot = await get(ref(rtdb, RTDB_MAIL_PATH));
    const val = snapshot.val();
    if (val && typeof val === "object") {
      return parseMailConfig(val as DocumentData);
    }
  } catch {
    // ignore
  }
  return null;
}

export function getMailRuntimeConfigSync(): MailRuntimeConfig | null {
  return runtime;
}

export async function getMailRuntimeConfig(): Promise<MailRuntimeConfig> {
  if (runtime) return runtime;

  const fromFirestore = await loadFromFirestore();
  if (fromFirestore) return applyConfig(fromFirestore);

  const fromRtdb = await loadFromRtdb();
  if (fromRtdb) return applyConfig(fromRtdb);

  const fromEnv = loadFromProcessEnv();
  if (fromEnv) return applyConfig(fromEnv);

  throw new Error(
    "Konfigurasi email tidak tersedia. Firestore `config` (mailUser, mailPass, to) butuh rules read, atau set RTDB `/mailConfig`, atau env MAIL_USER / MAIL_PASS / MAIL_TO."
  );
}

export function startMailConfigListener(): void {
  if (listenerStarted) return;
  listenerStarted = true;

  onSnapshot(
    collection(firestore, CONFIG_COLLECTION),
    (snap) => {
      const found = applyFromDocs(snap.docs);
      if (found) applyConfig(found);
    },
    () => undefined
  );

  onValue(
    ref(rtdb, RTDB_MAIL_PATH),
    (snapshot) => {
      const val = snapshot.val();
      if (val && typeof val === "object") {
        const parsed = parseMailConfig(val as DocumentData);
        if (parsed) applyConfig(parsed);
      }
    },
    () => undefined
  );
}

export async function initMailConfig(): Promise<void> {
  startMailConfigListener();
  await getMailRuntimeConfig();
}
