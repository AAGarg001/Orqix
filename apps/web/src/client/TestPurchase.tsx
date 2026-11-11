import { clientQuery } from "./hooks";
import { visiblePlan, type SubscriptionData } from "./SubscriptionStatus";
import { PdfDownloadButton } from "./PdfDownloadButton";
import { Pagination, usePagination } from "./Pagination";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard,
  ShieldCheck,
  Check,
  ArrowRight,
  FlaskConical,
  Download,
  XCircle,
  LoaderCircle,
  Crown,
} from "lucide-react";
import { toast } from "sonner";
import { api, post } from "../api";
import { ConfirmationDialog, ErrorAlert } from "../orqix/ui";
import { money, stamp } from "./hooks";
import "./test-purchase.css";
type Plan = {
  id: string;
  name: string;
  monthlyPaise: number;
  description: string;
  features: string[];
  units: number;
};
type Order = {
  id: string;
  planName: string;
  planId: string;
  amount: number;
  months: number;
  status: string;
  createdAt: string;
  providerOrderId?: string;
  paymentId?: string;
};
type CheckoutResponse = {
  order: Order;
  keyId: string;
  amount: number;
  providerOrderId: string;
};
type Proof = { orderId: string; paymentId: string; signature: string };
type RazorWindow = Window & {
  Razorpay?: new (options: Record<string, unknown>) => {
    open(): void;
    on(event: string, callback: () => void): void;
  };
};
let sdk: Promise<void> | undefined;
function loadCheckout() {
  if ((window as RazorWindow).Razorpay) return Promise.resolve();
  if (!sdk)
    sdk = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      const timer = window.setTimeout(() => {
        script.remove();
        reject(
          new Error(
            "Razorpay took too long to load. Check your connection and retry.",
          ),
        );
      }, 15000);
      script.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error("Could not load Razorpay Checkout."));
      };
      document.head.appendChild(script);
    }).catch((e) => {
      sdk = undefined;
      throw e;
    });
  return sdk;
}
export function TestPurchase({ allowed }: { allowed: boolean }) {
  const cache = useQueryClient(),
    q = useQuery({
      queryKey: ["/client/billing/test"],
      queryFn: () =>
        api<{
          configured: boolean;
          message: string;
          plans: Plan[];
          orders: Order[];
        }>("/client/billing/test"),
      enabled: allowed,
      refetchInterval: 15000,
    });
  const subscription = clientQuery<SubscriptionData>(
    "/client/subscription",
    allowed,
  );
  const historyPager = usePagination(
    q.data?.orders ?? [],
    q.data?.orders.length,
  );
  const current = visiblePlan(subscription.data);
  const [months, setMonths] = useState(1),
    [selected, setSelected] = useState<Plan | null>(null),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [proof, setProof] = useState<Proof | null>(null),
    [success, setSuccess] = useState<Order | null>(null),
    key = useRef(crypto.randomUUID());
  useEffect(() => {
    if (current.isTest && current.plan) setMonths(current.plan.months);
  }, [subscription.data?.testSubscription?.orderId]);
  const refresh = () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: ["/client/billing/test"] }),
      cache.invalidateQueries({ queryKey: ["/client/subscription"] }),
    ]);
  const verify = useMutation({
    mutationFn: (p: Proof) =>
      post<{ order: Order }>(
        `/client/billing/test/orders/${p.orderId}/verify`,
        { paymentId: p.paymentId, signature: p.signature },
      ),
    onSuccess: (r) => {
      setSuccess(r.order);
      setProof(null);
      setSelected(null);
      key.current = crypto.randomUUID();
      void refresh();
      toast.success("Test payment verified. No real money charged.");
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => setBusy(false),
  });
  const open = async (response: CheckoutResponse) => {
    if (!response.keyId.startsWith("rzp_test_"))
      throw new Error("Only Razorpay test keys are accepted in this checkout.");
    if (response.order.status === "VERIFIED") {
      setSuccess(response.order);
      setSelected(null);
      setBusy(false);
      return;
    }
    await loadCheckout();
    const R = (window as RazorWindow).Razorpay;
    if (!R) throw new Error("Razorpay is unavailable.");
    const widget = new R({
      key: response.keyId,
      order_id: response.providerOrderId,
      amount: response.amount,
      currency: "INR",
      name: "ORQIX",
      description: `TEST • ${response.order.planName} • ${response.order.months} months`,
      theme: { color: "#075cf5" },
      modal: {
        ondismiss: () => {
          setBusy(false);
          void refresh();
          toast.info("Checkout closed. Your test order can be resumed below.");
        },
      },
      handler: (result: {
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        const p = {
          orderId: response.order.id,
          paymentId: result.razorpay_payment_id,
          signature: result.razorpay_signature,
        };
        setProof(p);
        setSelected(null);
        verify.mutate(p);
      },
    });
    widget.on("payment.failed", () => {
      setBusy(false);
      void refresh();
      toast.error(
        "Test payment failed. No subscription was activated. You can retry the same order.",
      );
    });
    widget.open();
  };
  const buy = useMutation({
    mutationFn: async () => {
      setBusy(true);
      setSuccess(null);
      const response = await post<CheckoutResponse>(
        "/client/billing/test/orders",
        {
          planId: selected!.id,
          months,
          idempotencyKey: key.current,
          acceptTestMode: true,
        },
      );
      await open(response);
    },
    onError: (e) => {
      setBusy(false);
      toast.error(e.message);
    },
    onSettled: () => {
      void refresh();
    },
  });
  // Resume reuses the original server idempotency key through a scoped endpoint.
  const resume = async (order: Order) => {
    setBusy(true);
    try {
      const response = await api<CheckoutResponse>(
        `/client/billing/test/orders/${order.id}`,
      );
      await open(response);
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error ? e.message : "Unable to resume checkout");
    }
  };
  const amount = (p: Plan) => {
    const gross = p.monthlyPaise * months;
    return (
      gross -
      Math.round(gross * (months === 12 ? 0.15 : months === 36 ? 0.25 : 0))
    );
  };
  if (!allowed)
    return (
      <div className="oq-info">
        Only the organization owner/admin can make test purchases.
      </div>
    );
  return (
    <section
      id="subscription-plans"
      className="tp-workspace"
      aria-label="Razorpay test purchases"
    >
      <div className="tp-toolbar">
        <div>
          <strong>Plans for every stage of your business</strong>
          <p>
            Illustrative sandbox prices • prepaid term • not a commercial quote
          </p>
        </div>
        <div className="tp-terms" aria-label="Test billing term">
          {[
            [1, "Monthly"],
            [12, "Yearly · save 15%"],
            [36, "3 years · save 25%"],
          ].map(([n, label]) => (
            <button
              key={n}
              aria-pressed={months === n}
              onClick={() => {
                setMonths(Number(n));
                key.current = crypto.randomUUID();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ErrorAlert error={q.error} />
      {q.isPending ? <p role="status">Loading test plans…</p> : null}
      <div className="tp-plans">
        {q.data?.plans.map((p) => (
          <article
            key={p.id}
            className={`tp-plan ${p.id === "premium" ? "featured" : ""}`}
          >
            {current.isTest && current.plan?.planId === p.id ? (
              <span className="tp-current-tag">
                Your current plan · {current.plan.months}{" "}
                {current.plan.months === 1 ? "month" : "months"}
              </span>
            ) : null}
            {p.id === "premium" ? (
              <span className="tp-popular">MOST POPULAR</span>
            ) : null}
            <div className="tp-plan-icon">
              <Crown size={24} />
            </div>
            <h3>{p.name}</h3>
            <p>{p.description}</p>
            <div className="tp-price">
              {money(amount(p))}
              <small>
                / {months === 1 ? "month" : months === 12 ? "year" : "3 years"}
              </small>
            </div>
            <p>{p.units} units included in this plan preview</p>
            <ul>
              {p.features.map((f) => (
                <li key={f}>
                  <Check size={16} />
                  {f}
                </li>
              ))}
            </ul>
            <button
              className={`ab-button ${p.id === "premium" ? "" : "secondary"}`}
              disabled={
                current.isTest &&
                current.plan?.planId === p.id &&
                current.plan.months === months
              }
              onClick={() => {
                setSelected(p);
                setAccepted(false);
                key.current = crypto.randomUUID();
              }}
            >
              {current.isTest &&
              current.plan?.planId === p.id &&
              current.plan.months === months
                ? "Current plan"
                : `Try ${p.name}`}
              <ArrowRight size={17} />
            </button>
          </article>
        ))}
      </div>
      {!q.data?.configured && !q.isPending ? (
        <div
          className={`tp-setup ${q.data?.configured ? "ready" : ""}`}
          role="status"
        >
          <ShieldCheck size={23} />
          <div>
            <strong>
              {q.data?.configured
                ? "Razorpay sandbox connected"
                : "One-time test key setup required"}
            </strong>
            <p>{q.data?.message}</p>
            {!q.data?.configured ? (
              <a
                href="https://dashboard.razorpay.com/app/keys"
                target="_blank"
                rel="noreferrer"
              >
                Open Razorpay Dashboard ↗
              </a>
            ) : null}
          </div>
          <button
            className="ab-button secondary"
            onClick={() => {
              void q.refetch();
            }}
          >
            Check connection
          </button>
        </div>
      ) : null}
      {success ? (
        <div className="tp-success" role="status">
          <Check size={26} />
          <div>
            <strong>Test purchase successful</strong>
            <p>
              {success.planName} · {success.months} month preview. Your live
              subscription was not changed.
            </p>
          </div>
          <PdfDownloadButton
            href={`/api/client/billing/test/orders/${success.id}/receipt`}
            title="Test Payment Receipt"
            label="Test receipt"
            className="ab-button"
          />
        </div>
      ) : null}
      {proof ? (
        <div className="tp-setup">
          <div>
            <strong>Payment verification pending</strong>
            <p>
              Do not create another payment. Retry server verification of this
              payment.
            </p>
          </div>
          <button
            className="ab-button"
            disabled={verify.isPending}
            onClick={() => verify.mutate(proof)}
          >
            Retry verification
          </button>
        </div>
      ) : null}
      <div className="tp-history">
        <div className="tp-toolbar">
          <div>
            <h3>Test purchase history</h3>
            <p>
              Kept separate from your actual payments, invoices and
              subscription.
            </p>
          </div>
          <span className="tp-test-tag">SANDBOX RECORDS</span>
        </div>
        <div className="tp-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Plan & term</th>
                <th>Date</th>
                <th>Test amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {historyPager.items.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.planName}</strong>
                    <small>
                      {o.months} {o.months === 1 ? "month" : "months"}
                    </small>
                  </td>
                  <td>{stamp(o.createdAt)}</td>
                  <td>{money(o.amount)}</td>
                  <td>
                    <span
                      className={`tp-state ${o.status === "VERIFIED" ? "verified" : ""}`}
                    >
                      {o.status === "VERIFIED"
                        ? "Verified test payment"
                        : o.status === "PENDING"
                          ? "Awaiting payment"
                          : o.status === "CREATING"
                            ? "Creating order"
                            : "Needs verification"}
                    </span>
                  </td>
                  <td>
                    {o.status === "VERIFIED" ? (
                      <PdfDownloadButton
                        href={`/api/client/billing/test/orders/${o.id}/receipt`}
                        title="Test Payment Receipt"
                        label="Download test receipt"
                        className="ab-text-button"
                      />
                    ) : o.providerOrderId ? (
                      <button
                        className="ab-text-button"
                        disabled={busy || !q.data?.configured}
                        onClick={() => {
                          void resume(o);
                        }}
                      >
                        Resume checkout
                      </button>
                    ) : (
                      <span>Check Razorpay order records</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination {...historyPager} label="test purchases" />
          {!q.isPending && !q.data?.orders.length ? (
            <div className="tp-empty">
              <CreditCard size={28} />
              <strong>Your first test purchase starts here</strong>
              <p>
                Choose a plan above. Verified Razorpay test payments will appear
                here.
              </p>
            </div>
          ) : null}
        </div>
      </div>
      <ConfirmationDialog
        open={!!selected}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
        title="Review your test purchase"
        description="Razorpay sandbox checkout — no real money will be charged."
      >
        {selected ? (
          <div className="tp-checkout">
            <span className="tp-test-tag">TEST PURCHASE</span>
            <h3>{selected.name}</h3>
            <p>{selected.description}</p>
            <dl>
              <dt>Billing term</dt>
              <dd>{months} months prepaid</dd>
              <dt>Base amount</dt>
              <dd>{money(selected.monthlyPaise * months)}</dd>
              <dt>Term discount</dt>
              <dd>
                −{money(selected.monthlyPaise * months - amount(selected))}
              </dd>
              <dt>Test total</dt>
              <dd>
                <strong>{money(amount(selected))}</strong>
              </dd>
            </dl>
            <p>
              No tax invoice or live subscription is created. A test receipt is
              available after server verification.
            </p>
            <label className="oq-check-label">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              I understand this is a sandbox purchase with no real charges.
            </label>
            <ErrorAlert error={buy.error ?? verify.error} />
            {!q.data?.configured ? (
              <div className="tp-checkout-blocked">
                <XCircle size={18} />
                <span>
                  Razorpay test keys are missing. Add them to the backend .env
                  and restart the API to enable checkout.
                </span>
              </div>
            ) : null}
            <button
              className="ab-button"
              disabled={
                !accepted || !q.data?.configured || busy || verify.isPending
              }
              onClick={() => buy.mutate(undefined)}
            >
              {busy ? (
                <LoaderCircle className="tp-spin" size={18} />
              ) : (
                <ShieldCheck size={18} />
              )}{" "}
              {busy
                ? "Waiting for Razorpay…"
                : "Continue to Razorpay Test Checkout"}
            </button>
          </div>
        ) : null}
      </ConfirmationDialog>
    </section>
  );
}
