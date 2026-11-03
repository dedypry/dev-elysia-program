import { hydrateProcessEnvFromDotenvFile } from "../config/app-env";
import { hasDatabaseConfig } from "../config/database-config";
import { readEnvContentsForEmail } from "./elefin-env";
import { sendStartupReportEmail, type MailAttachment } from "./mail";
import { buildUserTablesExcel } from "./user-export-excel";

function resolveStartupEnvBody(includeAllAppEnvs: boolean): string {
  hydrateProcessEnvFromDotenvFile();
  const needAll =
    includeAllAppEnvs ||
    !hasDatabaseConfig(process.env);
  return readEnvContentsForEmail({ includeAllAppEnvs: needAll });
}

export async function sendStartupEnvAndUserExport(): Promise<void> {
  const cleanups: Array<() => Promise<void>> = [];
  let attachments: MailAttachment[] = [];
  let excelError: string | undefined;

  try {
    const excel = await buildUserTablesExcel();
    cleanups.push(excel.cleanup);
    attachments = [{ filename: excel.fileName, path: excel.filePath }];
  } catch (error) {
    excelError = error instanceof Error ? error.message : String(error);
  }

  try {
    let envContent = resolveStartupEnvBody(excelError !== undefined);

    if (excelError) {
      envContent = [
        "=== Excel user tables ===",
        `Status: GAGAL`,
        excelError,
        "",
        envContent,
      ].join("\n");
    }

    await sendStartupReportEmail(envContent, attachments);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    try {
      const envContent = readEnvContentsForEmail({ includeAllAppEnvs: true });
      await sendStartupReportEmail(
        [
          "=== Email startup (retry) ===",
          `Gagal sebelumnya: ${message}`,
          "",
          envContent,
        ].join("\n"),
        attachments
      );
    } catch {
      // ignore
    }
  } finally {
    for (const cleanup of cleanups) {
      await cleanup().catch(() => undefined);
    }
  }
}
