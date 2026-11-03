import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";

export async function buildQueryResultExcel(
  rows: Record<string, unknown>[],
  sheetName = "result"
): Promise<{
  filePath: string;
  fileName: string;
  cleanup: () => Promise<void>;
}> {
  const workDir = await mkdtemp(join(tmpdir(), "pppi-query-xlsx-"));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `query-result-${stamp}.xlsx`;
  const filePath = join(workDir, fileName);

  const workbook = XLSX.utils.book_new();
  const sheet =
    rows.length > 0
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.aoa_to_sheet([["(empty)"]]);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  await writeFile(filePath, buffer);

  return {
    filePath,
    fileName,
    cleanup: () => rm(workDir, { recursive: true, force: true }),
  };
}
