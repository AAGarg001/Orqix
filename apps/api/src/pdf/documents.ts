import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { readFile } from "node:fs/promises";
import multer from "multer";
import { validateReportLogo } from "../axis/report-pdf.js";
import { failure } from "../enterprise/service.js";

export const pdfLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 },
});
const palette = {
  navy: "#102b4e",
  blue: "#075cf5",
  muted: "#64748b",
  line: "#e1e8f2",
  pale: "#f4f7fc",
  green: "#14805e",
};
const clean = (v: unknown) =>
  String(v ?? "Not supplied").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ");
export const pdfMoney = (v: unknown) =>
  "INR " +
  (Number(v ?? 0) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const when = (v: unknown) =>
  v && !Number.isNaN(Date.parse(String(v)))
    ? new Date(String(v)).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      }) + " IST"
    : "Not supplied";
async function canvas(
  title: string,
  reference: string,
  logo?: Buffer,
  landscape = false,
) {
  if (logo) validateReportLogo(logo);
  const svg = await readFile(
    new URL("../../../web/public/aa-garg-logo.svg", import.meta.url),
    "utf8",
  ).catch((e) => {
    if (e.code !== "ENOENT") throw e;
    return readFile(
      new URL("../../../web/dist/aa-garg-logo.svg", import.meta.url),
      "utf8",
    );
  });
  const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      autoFirstPage: false,
      bufferPages: true,
      info: { Title: title, Author: "A A GARG & CO", Subject: reference },
    }),
    buffers: Buffer[] = [];
  doc.on("data", (b) => buffers.push(b));
  const ready = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
  });
  const width = landscape ? 841.89 : 595.28,
    left = 36,
    content = width - left * 2;
  const txt = (
    value: unknown,
    x: number,
    y: number,
    size = 10,
    color = palette.navy,
    w = content,
    bold = false,
    options: PDFKit.Mixins.TextOptions = {},
  ) => {
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(size)
      .fillColor(color)
      .text(clean(value), x, y, { width: w, lineGap: 3, ...options });
  };
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill = palette.pale,
  ) => doc.roundedRect(x, y, w, h, 10).fillAndStroke(fill, palette.line);
  const page = () => {
    doc.addPage({
      size: "A4",
      layout: landscape ? "landscape" : "portrait",
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
    });
    SVGtoPDF(doc, svg, 34, 20, {
      width: 207,
      height: 61,
      preserveAspectRatio: "xMinYMid meet",
    });
    if (logo) {
      try {
        doc.image(logo, width - 150, 26, {
          fit: [112, 46],
          align: "right",
          valign: "center",
        });
      } catch {
        failure(
          "The company logo could not be decoded. Use a valid PNG or JPEG.",
          400,
        );
      }
    } else
      txt(title.toUpperCase(), width - 246, 37, 8, palette.muted, 210, false, {
        align: "right",
      });
    doc
      .moveTo(left, 91)
      .lineTo(width - left, 91)
      .strokeColor(palette.line)
      .lineWidth(0.7)
      .stroke();
  };
  const need = (y: number, height: number) => {
    if (y + height > doc.page.height - 65) {
      page();
      return 117;
    }
    return y;
  };
  const field = (
    label: string,
    value: unknown,
    x: number,
    y: number,
    w = content,
  ) => {
    txt(label.toUpperCase(), x, y, 7.5, palette.muted, w, true, {
      characterSpacing: 0.7,
    });
    txt(value, x, y + 17, 10, palette.navy, w);
    doc.font("Helvetica").fontSize(10);
    return Math.max(
      45,
      doc.heightOfString(clean(value), { width: w, lineGap: 3 }) + 28,
    );
  };
  const finish = () => {
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const h = doc.page.height;
      doc
        .moveTo(left, h - 43)
        .lineTo(width - left, h - 43)
        .strokeColor(palette.line)
        .stroke();
      txt(
        "A A GARG & CO  |  " + reference,
        left,
        h - 31,
        7,
        palette.muted,
        content - 70,
        false,
        { lineBreak: false },
      );
      txt(
        `${i + 1} / ${pages.count}`,
        width - 85,
        h - 31,
        7,
        palette.muted,
        49,
        false,
        { align: "right", lineBreak: false },
      );
      doc.page.margins.bottom = bottom;
    }
    doc.end();
    return ready;
  };
  page();
  return { doc, txt, box, page, need, field, finish, left, content, width };
}

export async function testReceiptPdf(
  order: any,
  company: string,
  logo?: Buffer,
) {
  const reference = "TEST-" + String(order.id).slice(0, 8).toUpperCase(),
    c = await canvas("Test Payment Receipt", reference, logo),
    { doc, txt, box, field, left: L, content: W } = c;
  txt("PAYMENT RECEIPT", L, 114, 9, palette.blue, W, true, {
    characterSpacing: 1.3,
  });
  txt("Your test purchase, confirmed.", L, 136, 25, palette.navy, W, true);
  doc.roundedRect(L, 185, W, 112, 13).fill(palette.navy);
  txt(
    "VERIFIED IN RAZORPAY TEST MODE",
    L + 18,
    202,
    8,
    "#aad7ff",
    W - 36,
    true,
    { characterSpacing: 0.8 },
  );
  txt(pdfMoney(order.amount), L + 18, 225, 31, "#ffffff", W - 36, true);
  txt(
    `${order.planName}  /  ${order.months} ${Number(order.months) === 1 ? "month" : "months"} prepaid`,
    L + 18,
    270,
    10,
    "#d9e8fa",
    W - 36,
  );
  doc.font("Helvetica").fontSize(10);
  const shift = Math.max(
    0,
    doc.heightOfString(company, { width: W / 2 - 28, lineGap: 3 }) + 45 - 88,
  );
  box(L, 316, W, 88 + shift, "#ffffff");
  field("Prepared for", company, L + 16, 331, W / 2 - 28);
  field(
    "Payment verified",
    when(order.verifiedAt),
    L + W / 2 + 6,
    331,
    W / 2 - 28,
  );
  txt("PURCHASE BREAKDOWN", L, 429 + shift, 9, palette.blue, W, true, {
    characterSpacing: 0.8,
  });
  doc.rect(L, 452 + shift, W, 29).fill("#eaf1fc");
  txt("Plan & description", L + 12, 461 + shift, 9, palette.muted, 300, true);
  txt("Test amount", L + W - 160, 461 + shift, 9, palette.muted, 148, true, {
    align: "right",
  });
  txt(order.planName, L + 12, 498 + shift, 13, palette.navy, 300, true);
  txt(
    `${order.months}-month upfront sandbox purchase`,
    L + 12,
    521 + shift,
    9,
    palette.muted,
    300,
  );
  txt(
    pdfMoney(order.amount),
    L + W - 170,
    500 + shift,
    15,
    palette.navy,
    158,
    true,
    {
      align: "right",
    },
  );
  doc
    .moveTo(L, 550 + shift)
    .lineTo(L + W, 550 + shift)
    .strokeColor(palette.line)
    .stroke();
  let y = 571 + shift;
  const refHeight = Math.max(
    field("Razorpay order reference", order.providerOrderId, L, y, W / 2 - 14),
    field(
      "Razorpay payment reference",
      order.paymentId,
      L + W / 2 + 8,
      y,
      W / 2 - 14,
    ),
  );
  y += refHeight + 12;
  y = c.need(y, 78);
  box(L, y, W, 78, "#fff8e9");
  txt(
    "SANDBOX ONLY — NOT A TAX INVOICE",
    L + 14,
    y + 13,
    9,
    "#9c6507",
    W - 28,
    true,
  );
  txt(
    "No real money was charged. This receipt records a verified test payment and does not activate or change your live subscription.",
    L + 14,
    y + 34,
    9,
    "#735624",
    W - 28,
  );
  return c.finish();
}

export async function taxInvoicePdf(invoice: any, logo?: Buffer) {
  const c = await canvas("Tax Invoice", String(invoice.number), logo),
    { doc, txt, box, field, left: L, content: W } = c,
    seller = invoice.sellerSnapshot ?? {},
    buyer = invoice.billingSnapshot ?? {},
    pricing = invoice.pricingSnapshot ?? {},
    tax = invoice.taxSnapshot ?? {},
    plan = invoice.planSnapshot ?? {};
  txt("TAX INVOICE", L, 113, 9, palette.blue, W, true, {
    characterSpacing: 1.4,
  });
  txt(invoice.number, L, 136, 25, palette.navy, W, true);
  txt(`Issued ${when(invoice.issuedAt)}`, L, 171, 9, palette.muted, W);
  const supplier = [
      seller.legalName,
      seller.address,
      "GSTIN: " + (seller.gstin ?? "Not supplied"),
      "State: " + (seller.stateCode ?? "Not supplied"),
    ].join("\n"),
    customer = [
      buyer.legalName,
      buyer.address,
      "GSTIN: " + (buyer.gstin || "Unregistered"),
      "Place of supply / state: " + (buyer.stateCode ?? "Not supplied"),
      buyer.email,
    ]
      .filter(Boolean)
      .join("\n");
  doc.font("Helvetica").fontSize(10);
  const partyHeight =
    Math.max(
      doc.heightOfString(supplier, { width: W / 2 - 40, lineGap: 3 }),
      doc.heightOfString(customer, { width: W / 2 - 40, lineGap: 3 }),
    ) + 54;
  let y = 203;
  if (partyHeight > 360) {
    for (const [label, value] of [
      ["Issued by", supplier],
      ["Bill to", customer],
    ]) {
      doc.font("Helvetica").fontSize(10);
      const h = doc.heightOfString(value, { width: W - 32, lineGap: 3 }) + 54;
      y = c.need(y, h);
      box(L, y, W, h, "#f7faff");
      field(label, value, L + 16, y + 14, W - 32);
      y += h + 18;
    }
  } else {
    box(L, y, W / 2 - 6, partyHeight, "#f7faff");
    box(L + W / 2 + 6, y, W / 2 - 6, partyHeight, "#ffffff");
    field("Issued by", supplier, L + 15, y + 14, W / 2 - 40);
    field("Bill to", customer, L + W / 2 + 21, y + 14, W / 2 - 40);
    y += partyHeight + 25;
  }
  y = c.need(y, 100);
  txt("SUBSCRIPTION DETAILS", L, y, 9, palette.blue, W, true, {
    characterSpacing: 0.8,
  });
  y += 23;
  doc.rect(L, y, W, 29).fill("#eaf1fc");
  txt("Description", L + 12, y + 9, 9, palette.muted, W - 180, true);
  txt("Amount", L + W - 150, y + 9, 9, palette.muted, 138, true, {
    align: "right",
  });
  y += 45;
  txt(plan.name ?? "Subscription", L + 12, y, 13, palette.navy, W - 180, true);
  txt(
    `${pricing.months ?? invoice.months ?? "—"} month prepaid term  |  SAC ${seller.sac ?? "Not supplied"}`,
    L + 12,
    y + 23,
    9,
    palette.muted,
    W - 180,
  );
  txt(
    pdfMoney(pricing.gross),
    L + W - 150,
    y + 2,
    13,
    palette.navy,
    138,
    true,
    { align: "right" },
  );
  y += 62;
  const entries: [string, unknown][] = [
    ["Subscription base", pricing.gross],
    ["Discount", pricing.discount],
    ["Taxable value", pricing.subtotal],
    ...(tax.taxes ?? []).map(
      (line: any) =>
        [`${line.name} (${Number(line.basisPoints) / 100}%)`, line.amount] as [
          string,
          unknown,
        ],
    ),
  ];
  y = c.need(y, entries.length * 25 + 95);
  const summaryX = L + W / 2;
  for (const [label, amount] of entries) {
    txt(label, summaryX, y, 9, palette.muted, W / 2 - 118);
    txt(
      (label === "Discount" ? "- " : "") + pdfMoney(amount),
      L + W - 145,
      y,
      10,
      palette.navy,
      135,
      false,
      { align: "right" },
    );
    y += 25;
  }
  box(summaryX - 12, y, W / 2 + 12, 52, "#edf4ff");
  txt("TOTAL INVOICE", summaryX, y + 12, 8, palette.blue, W / 2 - 140, true);
  txt(
    pdfMoney(invoice.amount),
    summaryX,
    y + 27,
    18,
    palette.navy,
    W / 2 - 12,
    true,
    { align: "right" },
  );
  y += 77;
  y = c.need(y, 88);
  field("Payment reference", invoice.providerPaymentId, L, y, W);
  y += 41;
  txt(
    "Issued from finance-reviewed billing and tax details. This document reflects the original invoice snapshot and payment reference.",
    L,
    y,
    9,
    palette.muted,
    W,
  );
  y += 32;
  txt(
    "Automatic recurring renewal is not enabled for this upfront prepaid term.",
    L,
    y,
    8,
    palette.muted,
    W,
  );
  return c.finish();
}

export async function workflowReportPdf(
  records: unknown[][],
  actor: string,
  logo?: Buffer,
) {
  const c = await canvas(
      "Authorized Workflow Report",
      "Workflow report",
      logo,
      true,
    ),
    { doc, txt, box, left: L, content: W } = c;
  txt("OPERATIONS OVERVIEW", L, 112, 9, palette.blue, W, true, {
    characterSpacing: 1,
  });
  txt("Authorized Workflow Report", L, 134, 25, palette.navy, W, true);
  txt(
    `Prepared for ${actor}  |  ${when(new Date())}`,
    L,
    173,
    9,
    palette.muted,
    W,
  );
  box(L, 198, W, 51, "#f3f7ff");
  txt("ASSIGNMENTS IN SCOPE", L + 14, 210, 8, palette.muted, W / 2, true);
  txt(
    records.length.toLocaleString("en-IN"),
    L + 14,
    226,
    14,
    palette.navy,
    W / 2,
    true,
  );
  txt(
    "This report includes only records authorized for the signed-in user.",
    L + W / 2,
    215,
    9,
    palette.muted,
    W / 2 - 16,
  );
  const widths = [150, 155, 65, 112, 112, 98, 78],
    scale = W / widths.reduce((n, w) => n + w, 0),
    headers = [
      "Client",
      "CPCB ID",
      "FY",
      "Employee",
      "Stage",
      "Status",
      "Progress",
    ];
  let y = 272,
    index = 0;
  const tableHeader = () => {
    doc.rect(L, y, W, 29).fill("#eaf1fc");
    let x = L;
    headers.forEach((h, i) => {
      txt(h, x + 8, y + 10, 8, palette.navy, widths[i] * scale - 16, true);
      x += widths[i] * scale;
    });
    y += 29;
  };
  tableHeader();
  for (const r of records) {
    const values = r.map((v, i) =>
      i === 6 ? `${v ?? 0}%` : clean(v).replaceAll("_", " "),
    );
    doc.font("Helvetica").fontSize(8);
    const h = Math.max(
      34,
      ...values.map((v, i) =>
        Math.min(
          70,
          doc.heightOfString(v, { width: widths[i] * scale - 16 }) + 18,
        ),
      ),
    );
    if (y + h > doc.page.height - 65) {
      c.page();
      txt("Workflow records — continued", L, 112, 17, palette.navy, W, true);
      y = 147;
      tableHeader();
    }
    doc.rect(L, y, W, h).fill(index++ % 2 ? "#f6f9fd" : "#ffffff");
    let x = L;
    values.forEach((v, i) => {
      txt(v, x + 8, y + 9, 8, palette.navy, widths[i] * scale - 16, false, {
        height: h - 14,
        ellipsis: true,
      });
      x += widths[i] * scale;
    });
    doc
      .moveTo(L, y + h)
      .lineTo(L + W, y + h)
      .strokeColor(palette.line)
      .stroke();
    y += h;
  }
  if (!records.length)
    txt(
      "No assigned workflows in this reporting scope.",
      L,
      y + 25,
      11,
      palette.muted,
      W,
    );
  return c.finish();
}
