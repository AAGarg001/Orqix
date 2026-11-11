import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { readFile } from "node:fs/promises";
import { failure } from "../enterprise/service.js";

const navy = "#102b4e",
  blue = "#075cf5",
  muted = "#65748b",
  border = "#dfe7f1",
  teal = "#009d98";
const number = (v: unknown) =>
  Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const date = (v: unknown) =>
  v && !Number.isNaN(Date.parse(String(v)))
    ? new Date(String(v)).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not supplied";
const text = (v: unknown) =>
  String(v ?? "—")
    .replace(/[\u0000-\u001f]/g, " ")
    .slice(0, 1500);
const brand = () =>
  readFile(
    new URL("../../../web/public/aa-garg-logo.svg", import.meta.url),
    "utf8",
  ).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return readFile(
      new URL("../../../web/dist/aa-garg-logo.svg", import.meta.url),
      "utf8",
    );
  });
export function validateReportLogo(buffer: Buffer) {
  if (buffer.length > 2 * 1024 * 1024)
    failure("Company logo must be PNG or JPEG, up to 2 MB.", 400);
  let width = 0,
    height = 0;
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    width = buffer.readUInt32BE(16);
    height = buffer.readUInt32BE(20);
  } else if (buffer.length > 10 && buffer[0] === 255 && buffer[1] === 216) {
    let offset = 2;
    while (offset + 4 < buffer.length) {
      if (buffer[offset++] !== 255) continue;
      while (buffer[offset] === 255) offset++;
      const marker = buffer[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const length = buffer.readUInt16BE(offset);
      if (length < 2 || offset + length > buffer.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 7
      ) {
        height = buffer.readUInt16BE(offset + 3);
        width = buffer.readUInt16BE(offset + 5);
        break;
      }
      offset += length;
    }
  }
  if (
    !width ||
    !height ||
    width > 4096 ||
    height > 4096 ||
    width * height > 16000000
  )
    failure("Upload a valid PNG/JPEG logo, maximum 4096 × 4096 pixels.", 400);
}
type Column = {
  label: string;
  key: string;
  width: number;
  value?: (row: any) => unknown;
};
export async function createReportPdf(input: {
  snapshot: any;
  title: string;
  type: string;
  records: any[];
  company: string;
  logo?: Buffer;
}) {
  const { snapshot: s, title, type, records, company, logo } = input;
  if (logo) validateReportLogo(logo);
  const svg = await brand(),
    doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      autoFirstPage: false,
      info: {
        Title: title,
        Author: "A A GARG & CO",
        Subject: `${company} — reviewed EPR business insights`,
      },
    }),
    chunks: Buffer[] = [];
  doc.on("data", (b) => chunks.push(b));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const W = 595.28,
    P = 36,
    CW = W - P * 2;
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    stroke = border,
  ) => {
    doc.roundedRect(x, y, w, h, 9).fillAndStroke(fill, stroke);
  };
  const write = (
    value: unknown,
    x: number,
    y: number,
    size = 10,
    color = navy,
    width = CW,
    options: PDFKit.Mixins.TextOptions = {},
  ) => {
    doc
      .font("Helvetica")
      .fontSize(size)
      .fillColor(color)
      .text(text(value), x, y, { width, lineGap: 2, ...options });
  };
  const header = (landscape = false) => {
    const w = landscape ? 841.89 : W;
    SVGtoPDF(doc, svg, 34, 20, {
      width: 202,
      height: 62,
      preserveAspectRatio: "xMinYMid meet",
    });
    if (logo) {
      try {
        doc.image(logo, w - 148, 27, {
          fit: [110, 46],
          align: "right",
          valign: "center",
        });
      } catch {
        failure(
          "Company logo could not be decoded. Please choose another PNG/JPEG.",
          400,
        );
      }
    } else write(company, w - 220, 38, 11, navy, 184, { align: "right" });
    doc
      .moveTo(36, 91)
      .lineTo(w - 36, 91)
      .lineWidth(0.7)
      .strokeColor(border)
      .stroke();
  };
  const newPage = (landscape = false) => {
    doc.addPage({
      size: "A4",
      layout: landscape ? "landscape" : "portrait",
      margins: { top: 36, left: 36, right: 36, bottom: 36 },
    });
    header(landscape);
  };
  newPage();
  write("MANAGEMENT INSIGHT REPORT", P, 110, 8, blue, CW, {
    characterSpacing: 1.5,
  });
  write(title, P, 130, 24, navy, CW, { lineGap: 3 });
  const titleHeight = doc.heightOfString(title, { width: CW });
  let y = Math.max(192, 134 + titleHeight + 20);
  box(P, y, CW, 59, "#f1f6ff");
  write(company, P + 14, y + 10, 13, navy, CW - 28);
  write(
    `Source as of ${date(s.asOf)}   |   Prepared ${date(new Date())} IST`,
    P + 14,
    y + 33,
    8,
    muted,
    CW - 28,
  );
  y += 78;
  const metrics: [string, unknown, string][] =
    type === "procurement"
      ? [
          ["Total procurement", s.metrics.procurement, "MT"],
          ["Suppliers", s.metrics.suppliers, "suppliers"],
          ["Registered quantity", s.metrics.registered, "MT"],
          ["Unregistered quantity", s.metrics.unregistered, "MT"],
          ["Review findings", s.metrics.issues, "findings"],
          ["Units in scope", s.metrics.units, "units"],
        ]
      : [
          ["Registered units", s.metrics.units, "units"],
          ["Available certificates", s.metrics.available, "MT"],
          ["Certificate records", s.metrics.certificateCount, "records"],
          ["Recorded procurement", s.metrics.procurement, "MT"],
          ["Available certificates", s.metrics.certificateCount, "records"],
          ["Data quality findings", s.metrics.issues, "review findings"],
        ];
  const gap = 10,
    card = (CW - gap * 2) / 3;
  metrics.forEach(([label, value, unit], i) => {
    const x = P + (i % 3) * (card + gap),
      top = y + Math.floor(i / 3) * 88;
    box(x, top, card, 77, "#ffffff");
    doc.roundedRect(x + 12, top + 12, 3, 14, 1).fill(i === 1 ? teal : blue);
    write(label, x + 23, top + 12, 8, muted, card - 32);
    write(
      number(value),
      x + 12,
      top + 32,
      String(number(value)).length > 13 ? 15 : 20,
      navy,
      card - 24,
    );
    write(unit, x + 12, top + 58, 8, muted, card - 24);
  });
  y += 192;
  const barChart = (
    x: number,
    top: number,
    w: number,
    label: string,
    rows: any[],
    color: string,
  ) => {
    box(x, top, w, 161, "#ffffff");
    write(label, x + 12, top + 13, 11, navy, w - 24);
    const points = (rows ?? []).slice(0, 6),
      max = Math.max(1, ...points.map((r) => Number(r.value)));
    if (!points.length) {
      write(
        "No source values in this scope",
        x + 12,
        top + 62,
        9,
        muted,
        w - 24,
      );
      return;
    }
    points.forEach((r, i) => {
      const cy = top + 40 + i * 18;
      write(r.name, x + 12, cy, 7.5, muted, 85, { height: 12, ellipsis: true });
      doc.roundedRect(x + 96, cy + 1, w - 158, 8, 3).fill("#eef2f8");
      if (Number(r.value) > 0)
        doc
          .roundedRect(
            x + 96,
            cy + 1,
            Math.max(1, ((w - 158) * Number(r.value)) / max),
            8,
            3,
          )
          .fill(color);
      write(number(r.value), x + w - 58, cy - 1, 7.5, navy, 46, {
        align: "right",
      });
    });
  };
  barChart(
    P,
    y,
    (CW - 12) / 2,
    type === "procurement"
      ? "Procurement by category"
      : "Certificate availability by category",
    type === "procurement"
      ? s.charts.procurementCategories
      : s.charts.categories,
    teal,
  );
  barChart(
    P + (CW + 12) / 2,
    y,
    (CW - 12) / 2,
    "Procurement by financial year",
    s.charts.trend,
    blue,
  );
  y += 177;
  box(P, y, CW, 56, "#f2faf8", "#cfe9df");
  write("HOW TO READ THIS REPORT", P + 12, y + 10, 8, teal, CW - 24, {
    characterSpacing: 0.5,
  });
  write(
    "Availability and procurement are separate business measures. These figures do not establish a statutory EPR target or compliance conclusion.",
    P + 12,
    y + 27,
    9,
    navy,
    CW - 24,
    { height: 26, ellipsis: true },
  );

  // Scope and interpretation are explicit, rather than repeated raw metric keys.
  newPage();
  write("Source & reporting scope", P, 114, 22);
  write("Traceable reviewed data, clear calculation rules.", P, 146, 10, muted);
  y = 178;
  for (const d of s.datasets) {
    if (y + 100 > 748) {
      newPage();
      write("Reporting scope — continued", P, 113, 18);
      y = 151;
    }
    box(P, y, CW, 91, "#f7faff");
    write(`${d.company} / ${d.unit}`, P + 12, y + 11, 12, navy, CW - 24, {
      height: 18,
      ellipsis: true,
    });
    write(
      `CPCB registration: ${d.cpcbId}     Financial year: ${d.financialYear}`,
      P + 12,
      y + 34,
      9,
      navy,
      CW - 24,
    );
    write(
      `Source coverage: ${number(d.coverage)}% of supported sheet families`,
      P + 12,
      y + 52,
      8,
      muted,
      CW - 24,
    );
    write(
      `Published: ${date(d.publishedAt)} IST    Retained until: ${date(d.expiresAt)} IST`,
      P + 12,
      y + 69,
      8,
      muted,
      CW - 24,
    );
    y += 103;
  }
  for (const [label, definition] of [
    ["Certificate availability", s.definitions.available],
    ["Procurement", s.definitions.procurement],
    ["Reconciliation", s.definitions.reconciliation],
    ["Source coverage", s.definitions.coverage],
  ]) {
    doc.font("Helvetica").fontSize(9);
    const height =
      doc.heightOfString(String(definition), { width: CW - 12 }) + 36;
    if (y + height > 747) {
      newPage();
      write("Report definitions — continued", P, 113, 18);
      y = 151;
    }
    write(label, P, y, 11, navy);
    write(definition, P, y + 20, 9, muted, CW);
    y += height;
  }
  if (type === "procurement") {
    newPage();
    write("Procurement intelligence", P, 113, 22);
    write(
      "Supplier concentration, unit coverage and registration mix.",
      P,
      146,
      10,
      muted,
    );
    y = 180;
    write("Leading suppliers", P, y, 12, navy);
    y += 25;
    for (const r of s.charts.suppliers ?? []) {
      if (y + 53 > 748) {
        newPage();
        write("Supplier analysis — continued", P, 113, 18);
        y = 153;
      }
      box(P, y, CW, 45, "#f7faff");
      write(r.name, P + 12, y + 10, 8.5, navy, CW - 150, {
        height: 29,
        ellipsis: true,
      });
      write(`${number(r.value)} MT`, P + CW - 142, y + 10, 10, navy, 130, {
        align: "right",
      });
      write(
        `${s.metrics.procurement ? ((Number(r.value) / s.metrics.procurement) * 100).toFixed(1) : "0"}% of recorded quantity`,
        P + CW - 142,
        y + 27,
        7,
        muted,
        130,
        { align: "right" },
      );
      y += 53;
    }
    if (y + 150 > 748) {
      newPage();
      write("Registration & units", P, 113, 20);
      y = 158;
    }
    write("Supplier registration mix", P, y, 12, navy);
    y += 25;
    for (const [label, value] of [
      ["Registered suppliers", s.metrics.registered],
      ["Unregistered suppliers", s.metrics.unregistered],
    ]) {
      write(label, P, y, 10, muted, CW / 2);
      write(`${number(value)} MT`, P + CW / 2, y, 11, navy, CW / 2, {
        align: "right",
      });
      y += 25;
    }
    y += 15;
    write("Procurement by source unit", P, y, 12, navy);
    y += 25;
    for (const unit of s.charts.units ?? []) {
      if (y + 35 > 748) {
        newPage();
        write("Source units — continued", P, 113, 18);
        y = 153;
      }
      write(unit.name, P, y, 10, muted, CW / 2);
      write(`${number(unit.value)} MT`, P + CW / 2, y, 11, navy, CW / 2, {
        align: "right",
      });
      y += 30;
    }
  }
  if (type !== "summary") {
    const definitions: Record<string, Column[]> = {
      certificates: [
        { label: "Certificate ID", key: "certificateId", width: 135 },
        {
          label: "Company / Unit",
          key: "company",
          width: 140,
          value: (r) => `${r.company} / ${r.unitName}`,
        },
        { label: "Category", key: "category", width: 85 },
        { label: "Processing", key: "processingType", width: 115 },
        {
          label: "Quantity (MT)",
          key: "quantity",
          width: 85,
          value: (r) => number(r.quantity),
        },
        { label: "Validity", key: "validity", width: 100 },
        { label: "Status", key: "status", width: 110 },
      ],
      expiry: [
        { label: "Certificate ID", key: "certificateId", width: 135 },
        {
          label: "Company / Unit",
          key: "company",
          width: 160,
          value: (r) => `${r.company} / ${r.unitName}`,
        },
        { label: "Category", key: "category", width: 100 },
        {
          label: "Quantity (MT)",
          key: "quantity",
          width: 100,
          value: (r) => number(r.quantity),
        },
        { label: "Validity", key: "validity", width: 130 },
        { label: "Days left", key: "daysLeft", width: 145 },
      ],
      procurement: [
        { label: "Financial year", key: "financialYear", width: 80 },
        { label:'Company / Unit',key:'company',width:135,value:r=>`${r.company??''} / ${r.unitName??r.unit??''}` },
        { label: "Supplier", key: "supplier", width: 160 },
        { label: "Registration", key: "registerType", width: 100 },
        { label: "Category", key: "category", width: 85 },
        { label: "Invoice", key: "invoice", width: 135 },
        { label: "Date", key: "date", width: 100 },
        {
          label: "Quantity (MT)",
          key: "quantity",
          width: 110,
          value: (r) => number(r.quantity),
        },
      ],
      quality: [
        { label: "Company / Unit", key: "company", width: 150, value: r => `${r.company} / ${r.unit}` },
        { label: "Registration", key: "cpcbId", width: 130 },
        { label: "Financial year", key: "financialYear", width: 80 },
        { label: "Category", key: "category", width: 90 },
        { label: "Summary (MT)", key: "summary", width: 100, value: r => number(r.summary) },
        { label: "Detail (MT)", key: "detail", width: 100, value: r => number(r.detail) },
        { label: "Difference (MT)", key: "difference", width: 100, value: r => number(r.difference) },
      ],
      actions: [
        { label: "Action", key: "title", width: 230 },
        {
          label: "Company / Unit",
          key: "company",
          width: 175,
          value: (r) => `${r.company} / ${r.unit}`,
        },
        { label: "Priority", key: "priority", width: 90 },
        { label: "Status", key: "status", width: 135 },
        { label: "Due date", key: "dueDate", width: 140 },
      ],
      companies: [
        { label: "Company", key: "company", width: 170 },
        { label: "Unit", key: "unit", width: 150 },
        { label: "Registration", key: "registration", width: 180 },
        { label: "FY", key: "financialYear", width: 90 },
        {
          label: "Coverage",
          key: "sourceCoverage",
          width: 90,
          value: (r) => `${number(r.sourceCoverage)}%`,
        },
        {
          label: "Published",
          key: "publishedAt",
          width: 90,
          value: (r) => date(r.publishedAt),
        },
      ],
    };
    const columns = definitions[type],
      preview = type === "procurement" ? records : records.slice(0, 100),
      tableWidth = 841.89 - 72,
      scale = tableWidth / columns.reduce((n, c) => n + c.width, 0);
    let rowIndex = 0;
    const tablePage = () => {
      newPage(true);
      write(title + " — detail", P, 110, 18, navy, tableWidth);
      write(
        `${number(records.length)} matching records. ${type !== "procurement" && records.length > 100 ? "First 100 shown; download Excel for the complete dataset." : "All matching records shown."}`,
        P,
        138,
        9,
        muted,
        tableWidth,
      );
      y = 166;
      doc.rect(P, y, tableWidth, 28).fill("#eaf1fc");
      let x = P;
      for (const col of columns) {
        write(col.label, x + 8, y + 9, 8, navy, col.width * scale - 16);
        x += col.width * scale;
      }
      y += 28;
    };
    tablePage();
    if (!preview.length)
      write(
        "No matching source records for the selected filters.",
        P,
        y + 25,
        11,
        muted,
        tableWidth,
      );
    for (const row of preview) {
      const values = columns.map((col) =>
        text(col.value ? col.value(row) : row[col.key]),
      );
      doc.font("Helvetica").fontSize(8);
      const height = Math.max(
        34,
        ...values.map((v, i) =>
          Math.min(
                type==='procurement'?280:65,
            doc.heightOfString(v, { width: columns[i].width * scale - 16 }) +
              17,
          ),
        ),
      );
      if (y + height > 548) tablePage();
      doc
        .rect(P, y, tableWidth, height)
        .fill(rowIndex++ % 2 ? "#f6f9fd" : "#ffffff");
      let x = P;
      values.forEach((v, i) => {
        write(v, x + 8, y + 9, 8, navy, columns[i].width * scale - 16, {
          height: height - 14,
          ellipsis: true,
        });
        x += columns[i].width * scale;
      });
      doc
        .moveTo(P, y + height)
        .lineTo(P + tableWidth, y + height)
        .strokeColor(border)
        .lineWidth(0.5)
        .stroke();
      y += height;
    }
  }
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    const savedBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const w = doc.page.width,
      h = doc.page.height;
    doc
      .moveTo(P, h - 43)
      .lineTo(w - P, h - 43)
      .strokeColor(border)
      .lineWidth(0.5)
      .stroke();
    // Keep footer inside the content box to avoid PDFKit creating extra pages.
    write(
      "A A GARG & CO  |  Private business report",
      P,
      h - 32,
      7,
      muted,
      w - 140,
      { lineBreak: false },
    );
    write(`${i + 1} / ${pages.count}`, w - 90, h - 32, 7, muted, 54, {
      align: "right",
      lineBreak: false,
    });
    doc.page.margins.bottom = savedBottomMargin;
  }
  doc.end();
  return done;
}
