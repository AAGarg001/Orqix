import { describe, it, expect } from "vitest";
import {
  testReceiptPdf,
  taxInvoicePdf,
  workflowReportPdf,
  pdfMoney,
} from "./documents.js";
export const invoiceFixture = {
  number: "SAMPLE-LAYOUT-001",
  issuedAt: "2026-11-04T06:00:00Z",
  providerPaymentId: "pay_layout_fixture",
  amount: 106200,
  sellerSnapshot: {
    legalName: "Sample Seller",
    address: "Office 1, New Delhi",
    gstin: "07ABCDE1234F1Z5",
    stateCode: "07",
    sac: "998314",
  },
  billingSnapshot: {
    legalName: "Sample Buyer",
    address: "Factory 2, New Delhi",
    gstin: "07ABCDE1234F1Z5",
    stateCode: "07",
    email: "billing@example.test",
  },
  pricingSnapshot: {
    months: 12,
    gross: 100000,
    discount: 10000,
    subtotal: 90000,
  },
  taxSnapshot: {
    taxes: [
      { name: "CGST", basisPoints: 900, amount: 8100 },
      { name: "SGST", basisPoints: 900, amount: 8100 },
    ],
  },
  planSnapshot: { name: "Premium" },
};
const count = (pdf: Buffer) =>
  (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
describe("branded financial and workflow PDFs", () => {
  it("formats precise money and renders a single-page test receipt with no blank footer pages", async () => {
    expect(pdfMoney(249900)).toBe("INR 2,499.00");
    const pdf = await testReceiptPdf(
      {
        id: "test-layout-001",
        amount: 249900,
        planName: "Premium",
        months: 1,
        providerOrderId: "order_fixture",
        paymentId: "pay_fixture",
        verifiedAt: "2026-11-04T06:00:00Z",
      },
      "Sample Buyer",
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(count(pdf)).toBe(1);
  });
  it("supports an optional logo on invoices without mutating financial snapshots", async () => {
    const before = JSON.stringify(invoiceFixture),
      logo = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      );
    const pdf = await taxInvoicePdf(invoiceFixture, logo);
    expect(pdf.toString("latin1")).toContain("/Subtype /Image");
    expect(count(pdf)).toBe(1);
    expect(JSON.stringify(invoiceFixture)).toBe(before);
  });
  it("paginates long billing addresses and authorized workflow tables", async () => {
    const pdf = await taxInvoicePdf({
      ...invoiceFixture,
      billingSnapshot: {
        ...invoiceFixture.billingSnapshot,
        address: "A long billing address for the test location. ".repeat(22),
      },
    });
    expect(count(pdf)).toBeGreaterThan(1);
    expect(count(pdf)).toBeLessThan(6);
    const rows = Array.from({ length: 60 }, (_, i) => [
      `Company ${i}`,
      "REG-001",
      "2026-27",
      "Employee",
      "DATA_EXTRACTION",
      "Pending",
      50,
    ]);
    const workflow = await workflowReportPdf(rows, "Test Manager");
    expect(count(workflow)).toBeGreaterThan(2);
    expect(count(workflow)).toBeLessThan(15);
  });
});
