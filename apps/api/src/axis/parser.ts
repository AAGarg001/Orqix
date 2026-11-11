import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { validateExcelArchive } from "../enterprise/files.js";
import { failure } from "../enterprise/service.js";
export type AxisRow = {
  kind: "certificate" | "procurement" | "summary";
  sheet: string;
  row: number;
  certificateId?: string;
  quantity: number | null;
  category: string;
  financialYear: string;
  date: string | null;
  validity?: string | null;
  processingType?: string;
  supplier?: string;
  registerType?: string;
  invoice?: string;
  eprInvoice?: string;
  status?: string;
  entity: string;
  unit: string;
  issues: string[];
  registeredQuantity?: number | null;
  unregisteredQuantity?: number | null;
};
export const key = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function quantity(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER
    ? n
    : null;
}
export function financialYear(v: unknown) {
  return (
    String(v ?? "")
      .match(/20\d{2}\s*[-–]\s*\d{2}/)?.[0]
      .replace(/\s|–/g, (m) => (m === "–" ? "-" : "")) ?? ""
  );
}
export function isoDate(v: unknown): string | null {
  if (v instanceof Date)
    return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 100000)
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000)
      .toISOString()
      .slice(0, 10);
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s|$)/);
  if (m) {
    const result = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    const d = new Date(result);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === result
      ? result
      : null;
  }
  const n = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (n) {
    const month = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(n[2].toLowerCase());
    if (month < 0) return null;
    const result = `${n[3]}-${String(month + 1).padStart(2, "0")}-${n[1].padStart(2, "0")}`;
    const d = new Date(result);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === result
      ? result
      : null;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const result = s.slice(0, 10);
    const d = new Date(result);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === result
      ? result
      : null;
  }
  return null;
}
export function category(v: unknown) {
  const s = String(v ?? "").trim();
  const m = s.match(/^(?:cat(?:egory)?[\s-]*)?(IV|III|II|I|[1-4])$/i);
  return m
    ? "Category " +
        ({ "1": "I", "2": "II", "3": "III", "4": "IV" }[m[1]] ??
          m[1].toUpperCase())
    : s || "Not provided";
}
export async function parseWorkbook(buffer: Buffer) {
  validateExcelArchive(buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const rows: AxisRow[] = [],
    sheets: {
      name: string;
      rows: number;
      supported: boolean;
      missing: string[];
    }[] = [],
    errors: string[] = [];
  const entities = new Set<string>(),
    units = new Set<string>();
  let count = 0;
  for (const sheet of workbook.worksheets) {
    const sheetKey = key(sheet.name),
      kind =
        sheetKey === "available"
          ? "certificate"
          : sheetKey === "procurementdata"
            ? "procurement"
            : sheetKey === "procurementsummary"
              ? "summary"
              : null;
    const headers = new Map<string, number>();
    sheet.getRow(1).eachCell((c, i) => headers.set(key(c.text), i));
    const col = (...names: string[]) =>
      names.map((n) => headers.get(key(n))).find(Boolean);
    const required =
      kind === "certificate"
        ? ["Certificate ID", "Value(MT)", "Category", "Validity"]
        : kind === "procurement"
          ? [
              "Financial Year",
              "Total Plastic Qty. (Ton)",
              "Category of Plastic",
            ]
          : kind === "summary"
            ? ["Financial Year", "Categories of Plastic"]
            : [];
    const missing = required.filter((n) => !headers.has(key(n)));
    sheets.push({
      name: sheet.name,
      rows: Math.max(0, sheet.actualRowCount - 1),
      supported: !!kind && !missing.length,
      missing,
    });
    if (missing.length) {
      errors.push(`${sheet.name}: missing ${missing.join(", ")}`);
      continue;
    }
    sheet.eachRow((r, n) => {
      if (n === 1) return;
      if (++count > 150000)
        failure("Workbook exceeds 150,000 source rows.", 400);
      const get = (...names: string[]): unknown => {
        const i = col(...names);
        if (!i) return "";
        const cell = r.getCell(i);
        if (cell.type === ExcelJS.ValueType.Formula)
          failure("Upload values-only Excel, not formulas.", 400);
        return cell.value instanceof Date ? cell.value : cell.text.trim();
      };
      const entity = String(get("Entity Name") ?? "").trim(),
        unit = String(get("Unit") ?? "").trim();
      if (entity) entities.add(entity);
      if (unit) units.add(unit);
      if (sheetKey === "errorsandskipped" && String(get("Status"))) {
        errors.push(
          `${get("Module")}: ${get("Status")} ${get("Reason")}`.slice(0, 400),
        );
        return;
      }
      if (!kind) return;
      const item: AxisRow = {
        kind,
        sheet: sheet.name,
        row: n,
        quantity: quantity(
          get(
            kind === "certificate" ? "Value(MT)" : "Total Plastic Qty. (Ton)",
          ),
        ),
        category: category(
          get("Category", "Category of Plastic", "Categories of Plastic"),
        ),
        financialYear: financialYear(get("Financial Year")),
        date: isoDate(get("Date", "Generated At")),
        entity,
        unit,
        issues: [],
      };
      if (kind === "certificate") {
        item.certificateId = String(get("Certificate ID"));
        item.validity = isoDate(get("Validity"));
        item.processingType = String(get("Processing Type")) || "Not provided";
        item.status = String(get("Status")) || "Not provided";
        if (!item.certificateId) item.issues.push("Missing certificate ID");
        if (!item.validity) item.issues.push("Invalid or missing validity");
      } else if (kind === "procurement") {
        item.supplier = String(get("Name of Entity")) || "Not provided";
        item.registerType = String(get("Register Type"));
        item.invoice = String(get("GST Invoice No"));
        item.eprInvoice = String(get("EPR Invoice No"));
        if (!item.invoice && !item.eprInvoice)
          item.issues.push("Missing invoice reference");
        if (!item.date) item.issues.push("Invalid or missing date");
      } else {
        item.registeredQuantity = quantity(
          get("Plastic Procured from Registered Entity (MT)"),
        );
        item.unregisteredQuantity = quantity(
          get("Plastic Procured from Un-registered Entity (MT)"),
        );
        item.quantity =
          item.registeredQuantity !== null && item.unregisteredQuantity !== null
            ? item.registeredQuantity + item.unregisteredQuantity
            : null;
      }
      if (item.quantity === null)
        item.issues.push("Invalid or missing quantity");
      if (item.category === "Not provided")
        item.issues.push("Missing category");
      if (kind !== "certificate" && !item.financialYear)
        item.issues.push("Missing financial year");
      rows.push(item);
    });
  }
  if (!rows.length)
    failure(
      "No supported Available, Procurement data or Procurement Summary rows were found.",
      400,
    );
  const certs = new Map<string, AxisRow>(),
    proc = new Map<string, AxisRow>();
  for (const row of rows) {
    if (row.kind === "certificate" && row.certificateId) {
      const old = certs.get(row.certificateId);
      if (old) {
        row.issues.push("Duplicate certificate ID");
        old.issues.push("Duplicate certificate ID");
      } else certs.set(row.certificateId, row);
    }
    if (row.kind === "procurement" && (row.invoice || row.eprInvoice)) {
      const fingerprint = [
        row.supplier,
        row.invoice,
        row.eprInvoice,
        row.financialYear,
        row.date,
        row.category,
        row.quantity,
      ].join("|");
      const old = proc.get(fingerprint);
      if (old) {
        row.issues.push("Potential duplicate record");
        if (!old.issues.includes("Potential duplicate record"))
          old.issues.push("Potential duplicate record");
      } else proc.set(fingerprint, row);
    }
  }
  return {
    rows,
    sheets,
    errors,
    entities: [...entities],
    units: [...units],
    hash: createHash("sha256").update(buffer).digest("hex"),
    rowCount: rows.length,
    issueCount: rows.reduce((n, r) => n + r.issues.length, 0),
    coverage: Math.round((new Set(rows.map((r) => r.kind)).size / 3) * 100),
  };
}
