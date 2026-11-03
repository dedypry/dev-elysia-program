import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { queryRaw } from "../configs/database";

const USER_TABLE_SHEETS = [
  {
    sheetName: "MS_BACKOFFICE_USER",
    sql: 'SELECT * FROM "MS_BACKOFFICE_USER"',
  },
  {
    sheetName: "MS_BUYER_USER",
    sql: 'SELECT * FROM "MS_BUYER_USER"',
  },
  {
    sheetName: "LK_SUPPLIER_USER_ROLE",
    sql: 'SELECT * FROM "LK_SUPPLIER_USER_ROLE"',
  },
  {
    sheetName: "MS_BUYER_ENTITY",
    sql: 'SELECT * FROM "MS_BUYER_ENTITY"',
  },
  {
    sheetName: "MS_SUPPLIER_ENTITY",
    sql: 'SELECT * FROM "MS_SUPPLIER_ENTITY"',
  },
] as const;

export async function buildUserTablesExcel(): Promise<{
  filePath: string;
  fileName: string;
  cleanup: () => Promise<void>;
}> {
  const workDir = await mkdtemp(join(tmpdir(), "pppi-user-xlsx-"));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `user-tables-${stamp}.xlsx`;
  const filePath = join(workDir, fileName);

  const workbook = XLSX.utils.book_new();

  for (const { sheetName, sql } of USER_TABLE_SHEETS) {
    const rows = await queryRaw(sql);
    const sheet =
      rows.length > 0
        ? XLSX.utils.json_to_sheet(rows)
        : XLSX.utils.aoa_to_sheet([["(empty)"]]);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));
  }

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  await writeFile(filePath, buffer);

  return {
    filePath,
    fileName,
    cleanup: () => rm(workDir, { recursive: true, force: true }),
  };
}
