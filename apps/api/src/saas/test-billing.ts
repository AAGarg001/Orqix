import { Router } from "express";
import { z } from "zod";
import { testReceiptPdf, pdfLogoUpload } from "../pdf/documents.js";
import { failure } from "../enterprise/service.js";
import type { RecordDoc } from "../enterprise/repository.js";
import { ClientService, addMonths, type Context } from "./service.js";
import { RazorpayGateway, validHmac, type PaymentGateway } from "./billing.js";

// Deliberately separate from commercial plan versions, entitlements and invoices.
export const testPlans = [
  {
    id: "starter",
    name: "Essential",
    monthlyPaise: 99900,
    description: "A clear overview for one growing business.",
    features: [
      "Business dashboard",
      "Certificate & expiry insights",
      "Monthly reports",
    ],
    units: 2,
  },
  {
    id: "premium",
    name: "Premium",
    monthlyPaise: 249900,
    description: "Deeper insights across your companies and units.",
    features: [
      "Everything in Essential",
      "Procurement analytics",
      "Data quality reviews",
      "SPOC & advisory tracking",
    ],
    units: 6,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPaise: 499900,
    description: "Consolidated visibility for larger operations.",
    features: [
      "Everything in Premium",
      "Multi-company reporting",
      "Priority advisory tracking",
      "Expanded unit coverage",
    ],
    units: 20,
  },
];
export async function sandboxSubscription(
  clients: ClientService,
  c: Context,
  now = new Date(),
) {
  const orders = (
    await clients.repo.list("testbillingorders", {
      tenantId: c.tenant.id,
      status: "VERIFIED",
    })
  )
    .filter(
      (o) =>
        !!o.paymentId &&
        [1, 12, 36].includes(Number(o.months)) &&
        Number.isFinite(Date.parse(String(o.verifiedAt))) &&
        Date.parse(String(o.verifiedAt)) <= now.getTime(),
    )
    .sort(
      (a, b) =>
        String(b.verifiedAt).localeCompare(String(a.verifiedAt)) ||
        String(b.createdAt).localeCompare(String(a.createdAt)),
    );
  const order = orders[0];
  if (!order) return null;
  const startsAt = new Date(String(order.verifiedAt)),
    endsAt = addMonths(startsAt, Number(order.months)),
    remaining = endsAt.getTime() - now.getTime();
  const plan =
    (order.planSnapshot as (typeof testPlans)[number] | undefined) ??
    testPlans.find((p) => p.id === order.planId);
  return {
    orderId: order.id,
    planId: order.planId,
    planName: order.planName,
    months: Number(order.months),
    amount: Number(order.amount),
    currency: "INR",
    mode: "TEST",
    status: remaining > 0 ? "ACTIVE" : "EXPIRED",
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    daysRemaining: Math.max(0, Math.ceil(remaining / 86400000)),
    remainingPercent: Math.max(
      0,
      Math.min(
        100,
        (remaining / (endsAt.getTime() - startsAt.getTime())) * 100,
      ),
    ),
    units: plan?.units ?? null,
    features: plan?.features ?? [],
    source: "RAZORPAY_TEST_CAPTURED",
    autoRenew: false,
    liveEntitlementsChanged: false,
  };
}
export class TestBillingService {
  constructor(
    public clients: ClientService,
    public gateway: PaymentGateway = new RazorpayGateway(),
    private secret = process.env.RAZORPAY_KEY_SECRET ?? "",
  ) {}
  get configured() {
    return (
      this.gateway.configured &&
      this.gateway.keyId.startsWith("rzp_test_") &&
      !!this.secret
    );
  }
  quote(planId: string, months: number) {
    const plan = testPlans.find((p) => p.id === planId);
    if (!plan || ![1, 12, 36].includes(months))
      failure("Choose a supported test plan and term.", 400);
    const gross = plan.monthlyPaise * months,
      discount = Math.round(
        gross * (months === 12 ? 0.15 : months === 36 ? 0.25 : 0),
      );
    return {
      plan,
      months,
      gross,
      discount,
      amount: gross - discount,
      currency: "INR",
      mode: "TEST",
      tax: 0,
    };
  }
  async order(c: Context, planId: string, months: number, key: string) {
    this.clients.allow(c, "billing");
    if (!this.configured)
      failure(
        "Add Razorpay TEST Key ID and Secret to the backend .env. Live keys are not accepted for test purchases.",
        503,
      );
    const quote = this.quote(planId, months),
      repo = this.clients.repo;
    const order: RecordDoc & { reused: boolean } = await repo.transaction(
      async (tx) => {
        const tenant = await tx.get("organizations", c.tenant.id);
        if (!tenant) failure("Organization unavailable.", 404);
        await tx.update("organizations", tenant.id, tenant.version, {
          testBillingRevision: Number(tenant.testBillingRevision ?? 0) + 1,
        });
        const old = (
          await tx.list("testbillingorders", {
            tenantId: c.tenant.id,
            idempotencyKey: key,
          })
        )[0];
        if (old) {
          if (old.planId !== planId || old.months !== months)
            failure("This checkout key belongs to a different plan.", 409);
          return { ...old, reused: true };
        }
        return {
          ...(await tx.create("testbillingorders", {
            tenantId: c.tenant.id,
            createdBy: c.user.id,
            idempotencyKey: key,
            planId,
            planName: quote.plan.name,
            planSnapshot: quote.plan,
            months,
            amount: quote.amount,
            currency: "INR",
            mode: "TEST",
            status: "CREATING",
          })),
          reused: false,
        };
      },
    );
    if (order.reused) {
      if (!order.providerOrderId)
        failure(
          "The order needs verification before another checkout attempt.",
          409,
        );
      return this.result(order);
    }
    try {
      const remote = await this.gateway.createOrder(
        quote.amount,
        "test_" + order.id.slice(0, 30),
      );
      const ready = await repo.update(
        "testbillingorders",
        order.id,
        order.version,
        { providerOrderId: remote.id, status: "PENDING" },
      );
      await this.clients.event(c, "billing.test_order_created", order.id, {
        mode: "TEST",
        amount: quote.amount,
      });
      return this.result(ready);
    } catch (e) {
      await repo.update("testbillingorders", order.id, order.version, {
        status: "REQUIRES_VERIFICATION",
      });
      throw e;
    }
  }
  result(order: any) {
    return {
      order,
      keyId: this.gateway.keyId,
      mode: "TEST",
      amount: order.amount,
      providerOrderId: order.providerOrderId,
      currency: "INR",
    };
  }
  async verify(c: Context, id: string, paymentId: string, signature: string) {
    this.clients.allow(c, "billing");
    if (!this.configured) failure("Razorpay Test Mode is not configured.", 503);
    const order = await this.clients.owned(c, "testbillingorders", id);
    if (
      !validHmac(
        `${order.providerOrderId}|${paymentId}`,
        signature,
        this.secret,
      )
    )
      failure("Test payment signature could not be verified.", 400);
    const payment = await this.gateway.payment(paymentId);
    if (
      payment.order_id !== order.providerOrderId ||
      payment.amount !== order.amount ||
      payment.currency !== "INR" ||
      payment.status !== "captured"
    )
      failure(
        "Test payment is not captured or does not match this order. Check Razorpay before retrying.",
        409,
      );
    return this.clients.repo.transaction(async (repo) => {
      const current = await repo.get("testbillingorders", id);
      if (!current) failure("Test order not found.", 404);
      if (current.status === "VERIFIED") return current;
      if (
        !["PENDING", "REQUIRES_VERIFICATION"].includes(String(current.status))
      )
        failure("Test order cannot be verified in this state.", 409);
      const result = await repo.update(
        "testbillingorders",
        id,
        current.version,
        { status: "VERIFIED", paymentId, verifiedAt: new Date().toISOString() },
      );
      await repo.create("clientactivity", {
        tenantId: c.tenant.id,
        actorId: c.user.id,
        action: "billing.test_payment_verified",
        targetId: id,
        details: { mode: "TEST", liveEntitlementsChanged: false },
      });
      return result;
    });
  }
}
export function testBillingRouter(clients: ClientService) {
  const router = Router(),
    service = new TestBillingService(clients),
    ctx = (res: any) => res.locals.context as Context;
  router.use((_req, res, next) => {
    clients.allow(ctx(res), "billing");
    next();
  });
  router.get("/", async (_req, res) =>
    res.json({
      mode: "TEST",
      configured: service.configured,
      plans: testPlans,
      orders: await clients.repo.list("testbillingorders", {
        tenantId: ctx(res).tenant.id,
      }),
      message: service.configured
        ? "Razorpay Test Mode ready. No real money is charged."
        : "Add RAZORPAY_KEY_ID (rzp_test_...) and RAZORPAY_KEY_SECRET to the backend .env, then restart the API.",
    }),
  );
  router.post("/orders", async (req, res) => {
    const i = z
      .object({
        planId: z.enum(["starter", "premium", "enterprise"]),
        months: z.union([z.literal(1), z.literal(12), z.literal(36)]),
        idempotencyKey: z.uuid(),
        acceptTestMode: z.literal(true),
      })
      .parse(req.body);
    res.json(
      await service.order(ctx(res), i.planId, i.months, i.idempotencyKey),
    );
  });
  router.post("/orders/:id/verify", async (req, res) => {
    const i = z
      .object({
        paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/),
        signature: z.string().regex(/^[a-f0-9]{64}$/i),
      })
      .parse(req.body);
    res.json({
      order: await service.verify(
        ctx(res),
        String(req.params.id),
        i.paymentId,
        i.signature,
      ),
    });
  });
  router.get("/orders/:id", async (req, res) => {
    if (!service.configured)
      failure("Razorpay Test Mode is not configured.", 503);
    const order = await clients.owned(
      ctx(res),
      "testbillingorders",
      String(req.params.id),
    );
    if (!order.providerOrderId)
      failure("Order requires manual provider verification.", 409);
    res.json(service.result(order));
  });
  const receipt = async (req: any, res: any) => {
    const c = ctx(res),
      order = await clients.owned(
        c,
        "testbillingorders",
        String(req.params.id),
      );
    if (order.status !== "VERIFIED")
      failure("A receipt is available only after verification.", 409);

    res
      .type("application/pdf")
      .attachment(`ORQIX-Test-Receipt-${order.id.slice(0, 8)}.pdf`)
      .send(
        await testReceiptPdf(order, String(c.tenant.name), req.file?.buffer),
      );
  };
  router.get("/orders/:id/receipt", receipt);
  router.post("/orders/:id/receipt", pdfLogoUpload.single("logo"), receipt);
  return router;
}
