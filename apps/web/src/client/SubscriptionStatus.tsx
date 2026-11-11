import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Crown,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Check,
  ShieldCheck,
  FlaskConical,
  CreditCard,
  Pause,
  Play,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { clientQuery, money, stamp } from "./hooks";
import { PdfDownloadButton } from "./PdfDownloadButton";
import "./subscription-status.css";
type Plan = {
  planId?: string;
  planName: string;
  months: number;
  amount?: number;
  startsAt: string;
  endsAt: string;
  status: string;
  daysRemaining?: number;
  remainingPercent?: number;
  units?: number;
  features?: string[];
  orderId?: string;
  source?: string;
  limits?: { accounts?: number; registrations?: number };
};
export type SubscriptionData = {
  displayMode: "TEST" | "LIVE";
  subscription: Plan | null;
  testSubscription: Plan | null;
};
export function visiblePlan(data?: SubscriptionData) {
  return data?.displayMode === "TEST" &&
    data.testSubscription?.status === "ACTIVE"
    ? { plan: data.testSubscription, isTest: true }
    : data?.subscription
      ? { plan: data.subscription, isTest: false }
      : { plan: null, isTest: false };
}
const term = (months: number) =>
  months === 1
    ? "Monthly"
    : months === 12
      ? "Yearly"
      : months === 36
        ? "3-year"
        : `${months} months`;
export function SubscriptionModeBar() {
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    [hovered, setHovered] = useState(false),
    reduceMotion = useReducedMotion();
  const insights = clientQuery<{
    datasets: Array<{
      id: string;
      company: string;
      cpcbId: string;
      coverage: number;
      financialYear: string;
      asOf: string;
    }>;
    registrationMetrics: Record<
      string,
      { available: number; procurement: number }
    >;
  }>("/client/axis");
  const q = clientQuery<SubscriptionData>("/client/subscription"),
    { plan, isTest } = visiblePlan(q.data),
    mode = q.data?.displayMode;
  const quantity = (v: number | undefined) =>
    v === undefined
      ? "—"
      : v.toLocaleString("en-IN", { maximumFractionDigits: 3 });
  const slides = [
    {
      key: "plan",
      label: plan
        ? `${plan.planName} · ${term(plan.months)}`
        : q.isPending
          ? "Loading plan…"
          : q.error
            ? "Plan unavailable"
            : "Choose your plan",
      value: plan
        ? isTest
          ? "Test plan active"
          : "Subscription active"
        : "Subscription & billing",
      context:
        plan?.daysRemaining !== undefined
          ? `${plan.daysRemaining} days left`
          : "Your workspace plan",
      isPlan: true,
    },
    ...(insights.data?.datasets ?? []).flatMap((d) => {
      const values = insights.data?.registrationMetrics[d.id];
      return [
        ["Available certificates (MT)", quantity(values?.available)],
        ["Procurement (MT)", quantity(values?.procurement)],
        [
          "Source coverage",
          Number.isFinite(d.coverage) ? `${d.coverage}%` : "—",
        ],
        ["Financial year", d.financialYear],
        ["Data as of", stamp(d.asOf)],
      ].map(([label, value], i) => ({
        key: `${d.id}:${i}`,
        label,
        value,
        context: `${d.company} · ${d.cpcbId}`,
        isPlan: false,
      }));
    }),
  ];
  const sequence = slides.map((s) => s.key).join("|");
  useEffect(() => {
    setIndex(0);
  }, [sequence]);
  useEffect(() => {
    if (paused || hovered || slides.length < 2) return;
    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % slides.length),
      5000,
    );
    return () => window.clearInterval(timer);
  }, [paused, hovered, sequence]);
  const slide = slides[index % slides.length];
  const advance = (step: number) =>
    setIndex((i) => (i + step + slides.length) % slides.length);
  return (
    <div className="sc-mode-rail">
      <div
        className="sc-mode-notch"
        aria-label="Workspace mode and current plan"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setHovered(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setHovered(false);
        }}
      >
        <div className="sc-mode-summary">
          <span className={`sc-mode-state ${mode === "LIVE" ? "live" : ""}`}>
            <i />
            {mode ?? "…"}
            <span>MODE</span>
          </span>
          <span className="sc-mode-divider" />
          <div className="sc-ticker-viewport" aria-live="off">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                className={`sc-ticker-slide ${slide.isPlan ? "plan" : ""}`}
                key={slide.key}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 9 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduceMotion ? 0 : -9 }}
                transition={{
                  duration: reduceMotion ? 0 : 0.28,
                  ease: "easeInOut",
                }}
              >
                {slide.isPlan ? (
                  <Link className="sc-ticker-plan" to="/client/subscriptions" title={slide.label}>
                    <strong>{slide.label}</strong>
                    <span>{slide.value}</span>
                  </Link>
                ) : (
                  <div className="sc-ticker-metric">
                    <span>{slide.label}</span>
                    <strong>{slide.value}</strong>
                  </div>
                )}
                <small>{slide.context}</small>
              </motion.div>
            </AnimatePresence>
          </div>
          {slides.length > 1 ? (
            <div className="sc-ticker-controls">
              <button
                className="sc-ticker-step"
                onClick={() => advance(-1)}
                aria-label="Previous workspace detail"
              >
                <ChevronLeft size={12} />
              </button>
              <button
                className="sc-ticker-pause"
                onClick={() => setPaused((v) => !v)}
                aria-label={
                  paused
                    ? "Resume information rotation"
                    : "Pause information rotation"
                }
                aria-pressed={paused}
              >
                {paused ? <Play size={12} /> : <Pause size={12} />}
              </button>
              <button
                className="sc-ticker-step"
                onClick={() => advance(1)}
                aria-label="Next workspace detail"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          ) : null}
          <Link
            className="sc-mode-manage"
            to="/client/subscriptions"
            aria-label="Manage subscription"
          >
            <ArrowUpRight size={15} />
          </Link>
        </div>
        {slides.length > 1 ? (
          <div
            className="sc-ticker-progress"
            aria-label={`Workspace detail ${index + 1} of ${slides.length}`}
          >
            <span
              key={`${slide.key}:${paused}:${hovered}`}
              style={{
                animationPlayState: paused || hovered ? "paused" : "running",
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
export function CurrentSubscription({
  data,
  pending,
  allowed,
}: {
  data?: SubscriptionData;
  pending: boolean;
  allowed: boolean;
}) {
  const { plan, isTest } = visiblePlan(data),
    expired =
      data?.displayMode === "TEST" &&
      !plan &&
      data.testSubscription?.status === "EXPIRED",
    last = expired ? data?.testSubscription : null;
  const days = plan
    ? Math.max(0, Math.ceil((Date.parse(plan.endsAt) - Date.now()) / 86400000))
    : 0;
  const percent = plan
    ? Math.max(
        0,
        Math.min(
          100,
          ((Date.parse(plan.endsAt) - Date.now()) /
            (Date.parse(plan.endsAt) - Date.parse(plan.startsAt))) *
            100,
        ),
      )
    : 0;
  return (
    <section className="sc-current" aria-label="Current Plan">
      <div className="sc-current-primary">
        <div className="sc-current-top">
          <span className="sc-eyebrow">
            <Crown size={15} />
            CURRENT PLAN
          </span>
          <span className={`sc-active-pill ${!plan ? "empty" : ""}`}>
            <i />
            {pending
              ? "Loading…"
              : plan
                ? isTest
                  ? "Active · Test subscription"
                  : "Active subscription"
                : expired
                  ? "Test plan expired"
                  : "No active plan"}
          </span>
        </div>
        <div className="sc-plan-heading">
          <div>
            <h2>
              {plan?.planName ??
                last?.planName ??
                (pending ? "Loading your plan…" : "Choose your next plan")}
            </h2>
            <p>
              {plan
                ? `${term(plan.months)} membership · ${plan.months}-month upfront term`
                : expired
                  ? "Your test subscription has reached its expiry date."
                  : "Your subscription details will appear after a verified purchase."}
            </p>
          </div>
          <div className="sc-crown">
            <Crown size={36} />
          </div>
        </div>
        <div className="sc-feature-row">
          {(
            plan?.features?.slice(0, 3) ??
            (plan ? ["Authorized workspace access", "Reports & insights"] : [])
          ).map((f) => (
            <span key={f}>
              <Check size={13} />
              {f}
            </span>
          ))}
        </div>
        <div className="sc-current-bottom">
          <span>
            <ShieldCheck size={16} />
            {isTest
              ? "Razorpay-verified test purchase"
              : plan?.source === "MANUAL_CONTRACT"
                ? "Contracted organization access"
                : "Secure subscription management"}
          </span>
          {allowed ? (
            <a
              href="#subscription-plans"
              onClick={(e) => {
                const target = document.getElementById("subscription-plans");
                if (target) {
                  e.preventDefault();
                  target.scrollIntoView({
                    behavior: matchMedia("(prefers-reduced-motion: reduce)")
                      .matches
                      ? "instant"
                      : "smooth",
                    block: "start",
                  });
                }
              }}
            >
              {plan ? "Manage plan" : "Explore plans"}
              <ArrowUpRight size={16} />
            </a>
          ) : null}
        </div>
      </div>
      <div className="sc-current-detail">
        <div className="sc-price-heading">
          <span>{isTest ? "TEST PAYMENT TOTAL" : "YOUR SUBSCRIPTION"}</span>
          {isTest ? <FlaskConical size={18} /> : <CreditCard size={18} />}
        </div>
        <h3>
          {plan?.amount !== undefined
            ? money(plan.amount)
            : plan
              ? term(plan.months)
              : "Not purchased yet"}
        </h3>
        <p>
          {isTest
            ? "Sandbox payment · no real money charged"
            : plan
              ? "Prepaid term · automatic renewal off"
              : "Select a plan below to get started"}
        </p>
        <div className="sc-plan-dates">
          <div>
            <CalendarDays size={17} />
            <span>
              Started<strong>{plan ? stamp(plan.startsAt) : "—"}</strong>
            </span>
          </div>
          <div>
            <Clock3 size={17} />
            <span>
              Valid until
              <strong>
                {plan ? stamp(plan.endsAt) : last ? stamp(last.endsAt) : "—"}
              </strong>
            </span>
          </div>
        </div>
        {plan ? (
          <div className="sc-time-left">
            <div>
              <span>Subscription period remaining</span>
              <strong>{days} days</strong>
            </div>
            <progress max={100} value={percent} />
          </div>
        ) : null}
        {isTest && plan?.orderId && allowed ? (
          <PdfDownloadButton
            href={`/api/client/billing/test/orders/${plan.orderId}/receipt`}
            title="Test Payment Receipt"
            label="Download receipt"
            className="sc-receipt"
          />
        ) : null}
      </div>
    </section>
  );
}
