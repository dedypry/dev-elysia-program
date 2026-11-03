import { hydrateProcessEnvFromDotenvFile } from "../config/app-env";
import { describeDatabaseConfig } from "../config/database-config";
import { executeScriptSql } from "../configs/database";
import {
  sendScriptQueryErrorEmail,
  sendScriptQueryResultEmail,
} from "./mail";
import { buildQueryResultExcel } from "./query-result-excel";

function formatDbTarget(): string {
  const summary = describeDatabaseConfig();
  if (summary.source === "DB_*") {
    return `${summary.user}@${summary.host}/${summary.database}`;
  }
  return "DATABASE_URL";
}

export async function runScriptQueryAndEmail(sql: string): Promise<void> {
  const trimmed = sql.trim();
  hydrateProcessEnvFromDotenvFile();
  const dbTarget = formatDbTarget();

  try {
    const result = await executeScriptSql(trimmed);

    let attachment: { filename: string; path: string } | undefined;
    if (result.rows.length > 0) {
      const excel = await buildQueryResultExcel(result.rows, "query_result");
      attachment = { filename: excel.fileName, path: excel.filePath };
      try {
        await sendScriptQueryResultEmail(trimmed, dbTarget, result, attachment);
      } finally {
        await excel.cleanup().catch(() => undefined);
      }
    } else {
      await sendScriptQueryResultEmail(trimmed, dbTarget, result);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const hint = message.includes("duplicate key")
      ? "\n\nCatatan: INSERT sudah pernah jalan di DB ini (restart app / script sama di Firebase / jalankan manual di client). Cek DB target di atas sama dengan client SQL."
      : "";
    await sendScriptQueryErrorEmail(trimmed, dbTarget, message + hint);
  }
}
