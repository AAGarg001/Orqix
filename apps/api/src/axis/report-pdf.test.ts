import { describe, it, expect } from "vitest";
import { createReportPdf, validateReportLogo } from "./report-pdf.js";
const logo = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const snapshot = {
  asOf: "2026-11-03T06:00:00Z",
  metrics: {
    units: 1,
    available: 150,
    certificateCount: 2,
    procurement: 130,
    openActions: 1,
    issues: 3,
  },
  charts: {
    categories: [
      { name: "Category I", value: 100 },
      { name: "Category II", value: 50 },
    ],
    trend: [{ name: "2026-27", value: 130 }],
  },
  datasets: [
    {
      company: "Scoped company",
      unit: "Unit 1",
      cpcbId: "REG-001",
      financialYear: "2026-27",
      coverage: 100,
      publishedAt: "2026-11-04T06:00:00Z",
      expiresAt: "2026-12-04T06:00:00Z",
    },
  ],
  definitions: {
    available: "Eligible unexpired Available rows only.",
    procurement:
      "Recorded procurement quantities. Not a statutory compliance target.",
    reconciliation: "Only comparable source summaries.",
    coverage: "Supported sheet families, not a compliance score.",
  },
};
const pages = (pdf: Buffer) =>
  (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
describe("branded PDF report rendering", () => {
  it("includes all procurement detail records beyond the former preview cap", async () => {
    const source = {
      ...snapshot,
      metrics: {
        ...snapshot.metrics,
        suppliers: 2,
        registered: 100,
        unregistered: 30,
      },
      charts: {
        ...snapshot.charts,
        procurementCategories: [{ name: "Category I", value: 130 }],
        suppliers: [{ name: "Supplier", value: 130 }],
        units: [{ name: "Unit 1", value: 130 }],
      },
    };
    const rows = Array.from({ length: 200 }, (_, i) => ({
      financialYear: "2026-27",
      supplier: `Supplier ${i}`,
      registerType: "Registered",
      category: "Category I",
      invoice: `INV-${i}`,
      date: "2026-11-01",
      quantity: 1,
    }));
    const options = {
      snapshot: source,
      title: "Procurement Analysis Report",
      type: "procurement",
      company: "Scoped company",
    };
    const small = await createReportPdf({
        ...options,
        records: rows.slice(0, 100),
      }),
      large = await createReportPdf({ ...options, records: rows });
    expect(pages(large)).toBeGreaterThan(pages(small));
  });
  it("renders a two-page summary without blank footer pages or duplicate raw metrics", async () => {
    const pdf = await createReportPdf({
      snapshot,
      title: "Monthly EPR Business Summary",
      type: "summary",
      records: [],
      company: "Scoped company",
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages(pdf)).toBe(2);
  });
  it("embeds an optional company image and paginates readable detail tables", async () => {
    const records = Array.from({ length: 105 }, (_, i) => ({
      certificateId: `CERT-${i}`,
      company: "Scoped company",
      unitName: "Unit 1",
      category: "Category I",
      processingType: "Recycling",
      quantity: 5,
      validity: "2027-01-01",
      status: "SUCCESS",
    }));
    const pdf = await createReportPdf({
      snapshot,
      title: "Certificate Availability Report",
      type: "certificates",
      records,
      company: "Scoped company",
      logo,
    });
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
    expect(pages(pdf)).toBeGreaterThan(3);
    expect(pages(pdf)).toBeLessThan(15);
  });
  it("rejects unsupported, oversized and extreme-dimension logo inputs", () => {
    expect(() =>
      validateReportLogo(Buffer.from("<svg>untrusted</svg>")),
    ).toThrow("valid PNG/JPEG");
    expect(() => validateReportLogo(Buffer.alloc(2 * 1024 * 1024 + 1))).toThrow(
      "2 MB",
    );
    const large = Buffer.from(logo);
    large.writeUInt32BE(5000, 16);
    expect(() => validateReportLogo(large)).toThrow("4096");
  });
});
