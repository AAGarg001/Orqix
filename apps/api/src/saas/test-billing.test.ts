import { beforeEach, describe, it, expect } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { Store } from "../store.js";
import { Repository } from "../enterprise/repository.js";
import { EnterpriseService } from "../enterprise/service.js";
import { ClientService, type Context } from "./service.js";
import { TestBillingService, sandboxSubscription } from "./test-billing.js";
import type { PaymentGateway } from "./billing.js";
import express from "express";
import request from "supertest";
import { testBillingRouter } from "./test-billing.js";

class TestGateway implements PaymentGateway {
  configured = true;
  keyId = "rzp_test_fixture";
  calls = 0;
  amount = 0;
  status = "captured";
  currency = "INR";
  orderId = "order_fixture";
  async createOrder(amount: number) {
    this.calls++;
    this.amount = amount;
    return { id: this.orderId };
  }
  async payment(id: string) {
    return {
      id,
      order_id: this.orderId,
      amount: this.amount,
      currency: this.currency,
      status: this.status,
    };
  }
}
describe("Razorpay sandbox purchases", () => {
  let clients: ClientService,
    service: TestBillingService,
    gateway: TestGateway,
    c: Context;
  const secret = "isolated-test-secret",
    sig = () =>
      createHmac("sha256", secret)
        .update("order_fixture|pay_fixture")
        .digest("hex");
  beforeEach(async () => {
    const store = new Store(true),
      repo = new Repository(true);
    clients = new ClientService(new EnterpriseService(repo, store));
    gateway = new TestGateway();
    service = new TestBillingService(clients, gateway, secret);
    const user = await store.createUser({
      name: "Test Client",
      email: "sandbox@client.test",
      accountKind: "client",
      active: true,
      passwordHash: "unused",
    });
    const tenant = await repo.create("organizations", {
        name: "Test Company",
        status: "ONBOARDING",
      }),
      member = await repo.create("organizationmembers", {
        tenantId: tenant.id,
        userId: user.id,
        role: "client_owner",
        status: "ACTIVE",
      });
    c = { tenant, user, member };
  });
  it("shows the verified monthly plan immediately without creating live entitlements", async () => {
    const { order } = await service.order(c, "premium", 1, randomUUID());
    await service.verify(c, order.id, "pay_fixture", sig());
    const view = await sandboxSubscription(clients, c);
    expect(view?.planName).toBe("Premium");
    expect(view?.months).toBe(1);
    expect(view?.status).toBe("ACTIVE");
    expect(view?.amount).toBe(249900);
    expect(view?.daysRemaining).toBeGreaterThanOrEqual(28);
    expect(view?.liveEntitlementsChanged).toBe(false);
    expect(await clients.subscription(c)).toBeNull();
    expect(
      await sandboxSubscription(clients, {
        ...c,
        tenant: { ...c.tenant, id: randomUUID() },
      }),
    ).toBeNull();
  });
  it("ignores pending orders, clamps month-end expiry and marks expired test plans", async () => {
    await clients.repo.create("testbillingorders", {
      tenantId: c.tenant.id,
      status: "VERIFIED",
      paymentId: "pay_monthend",
      verifiedAt: "2026-01-31T10:00:00.000Z",
      planId: "premium",
      planName: "Premium",
      months: 1,
      amount: 249900,
    });
    await clients.repo.create("testbillingorders", {
      tenantId: c.tenant.id,
      status: "PENDING",
      planId: "enterprise",
      planName: "Enterprise",
      months: 12,
    });
    const active = await sandboxSubscription(
      clients,
      c,
      new Date("2026-02-01T10:00:00Z"),
    );
    expect(active?.planName).toBe("Premium");
    expect(active?.endsAt).toBe("2026-02-28T10:00:00.000Z");
    expect(active?.status).toBe("ACTIVE");
    expect(
      (await sandboxSubscription(clients, c, new Date("2026-03-01T10:00:00Z")))
        ?.status,
    ).toBe("EXPIRED");
  });
  it("uses server prices, supports three terms and rejects unsupported catalog input", () => {
    expect(service.quote("premium", 12).amount).toBe(2548980);
    expect(service.quote("starter", 1).amount).toBe(99900);
    expect(service.quote("starter", 36).amount).toBe(2697300);
    expect(() => service.quote("invented", 1)).toThrow("supported");
    expect(() => service.quote("starter", 2)).toThrow("supported");
  });
  it("requires genuine test key configuration and refuses live keys before calling Razorpay", async () => {
    gateway.keyId = "rzp_live_not_allowed";
    expect(service.configured).toBe(false);
    await expect(service.order(c, "starter", 1, randomUUID())).rejects.toThrow(
      "Live keys",
    );
    expect(gateway.calls).toBe(0);
  });
  it("reuses an order without repeat provider charges and rejects a changed plan for its key", async () => {
    const key = randomUUID(),
      first = await service.order(c, "starter", 1, key),
      second = await service.order(c, "starter", 1, key);
    expect(first.order.id).toBe(second.order.id);
    expect(gateway.calls).toBe(1);
    await expect(service.order(c, "premium", 1, key)).rejects.toThrow(
      "different plan",
    );
  });
  it("verifies capture idempotently without granting real access, revenue or invoices", async () => {
    const { order } = await service.order(c, "premium", 12, randomUUID());
    await expect(
      service.verify(c, order.id, "pay_fixture", "0".repeat(64)),
    ).rejects.toThrow("signature");
    expect(
      (await service.verify(c, order.id, "pay_fixture", sig())).status,
    ).toBe("VERIFIED");
    await service.verify(c, order.id, "pay_fixture", sig());
    expect(
      (await clients.repo.list("clientactivity")).filter(
        (a) => a.action === "billing.test_payment_verified",
      ),
    ).toHaveLength(1);
    for (const kind of ["subscriptions", "payments", "invoices"])
      expect(await clients.repo.list(kind)).toHaveLength(0);
  });
  it("rejects unconfirmed, mismatched and cross-tenant payments and viewer access", async () => {
    const { order } = await service.order(c, "starter", 1, randomUUID());
    gateway.status = "authorized";
    await expect(
      service.verify(c, order.id, "pay_fixture", sig()),
    ).rejects.toThrow("not captured");
    gateway.status = "captured";
    gateway.amount++;
    await expect(
      service.verify(c, order.id, "pay_fixture", sig()),
    ).rejects.toThrow("not captured");
    await expect(
      service.verify(
        { ...c, tenant: { ...c.tenant, id: randomUUID() } },
        order.id,
        "pay_fixture",
        sig(),
      ),
    ).rejects.toThrow("not found");
    await expect(
      service.order(
        { ...c, member: { ...c.member, role: "client_viewer" } },
        "starter",
        1,
        randomUUID(),
      ),
    ).rejects.toThrow("permit");
  });
  it("serves scoped verified PDF test receipts and rejects pending receipts", async () => {
    const { order } = await service.order(c, "starter", 1, randomUUID());
    const app = express();
    app.use((_, res, next) => {
      res.locals.context = c;
      next();
    });
    app.use("/test", testBillingRouter(clients));
    app.use((error: any, _req: any, res: any, _next: any) =>
      res.status(error.status ?? 500).json({ error: error.message }),
    );
    expect(
      (await request(app).get(`/test/orders/${order.id}/receipt`)).status,
    ).toBe(409);
    await service.verify(c, order.id, "pay_fixture", sig());
    const response = await request(app).get(`/test/orders/${order.id}/receipt`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    c = { ...c, tenant: { ...c.tenant, id: randomUUID() } };
    expect(
      (await request(app).get(`/test/orders/${order.id}/receipt`)).status,
    ).toBe(404);
  });
});
