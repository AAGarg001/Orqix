# Razorpay test purchases

## Current plan and navigation display

The client subscription response now includes a separate `testSubscription` display projection from the latest verified tenant-owned test order. Pending/failed/unverified orders never replace it. Start time is the actual verification timestamp; expiry uses calendar-month clamping for the purchased 1/12/36-month term. Expired plans are labeled expired. Existing verified orders appear immediately without migration or another payment. Catalog features are snapshotted on new orders; older orders use the existing test catalog for display metadata.

In TEST mode, Current Plan and the sticky navigation strip display this verified test plan, amount, term, dates and remaining days. Verification invalidates both the purchase-history and subscription queries so the plan updates immediately. The active plan/term is marked Current plan in the catalog. Large promotional/connection panels have been removed from the connected state; missing credentials still produce actionable setup instructions. Live billing records are available in an expandable section and automatically expanded in LIVE mode.

This display projection does not create live entitlements, commercial subscriptions, invoices or revenue. Genuine live subscriptions retain their original service authorization. Latest verified test purchase replaces the displayed test term; it is not stacked with pending checkouts or converted into a recurring mandate.

Open `/client/subscriptions` with an organization owner/admin login. The top section contains the sandbox catalog, term selector, review modal and separate test history. Essential/Premium/Enterprise prices are illustrative test prices, not published commercial offers. Existing commercial contracts, invoices and payment history remain below.

## Required setup

In your Razorpay Dashboard select **Test Mode**, generate API keys and add them to the backend root `.env`:

```dotenv
RAZORPAY_KEY_ID=rzp_test_YOUR_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_TEST_KEY_SECRET
```

Restart `npm.cmd run dev` after editing keys; do not put secrets in VITE variables or source code. Configure payment auto-capture in Razorpay Test Mode. A merely authorized payment is not considered successful. Choose a plan, accept the sandbox acknowledgement and open Razorpay Checkout; use the test payment methods documented by Razorpay.

The supplied test credentials have been configured in the local backend `.env` and verified with a read-only Razorpay API request (HTTP 200). The development backend was restarted and reports sandbox readiness. No payment was initiated during this credential check. In environments without keys, checkout stays disabled until valid test credentials are configured. Live keys are rejected by sandbox endpoints.

## Data and security

- Server-owned test catalog and integer-paise term pricing (monthly; yearly 15% discount; three-year 25% discount). Client-supplied totals are ignored.
- POST `/api/client/billing/test/orders` requires owner/admin, authorized tenant context, acknowledgement and UUID idempotency key. Duplicate keys reuse orders; changed plan/term for the same key is rejected.
- GET `/api/client/billing/test/orders/:id` resumes a scoped existing checkout without creating another order.
- POST `/api/client/billing/test/orders/:id/verify` validates HMAC of server order ID and payment ID, then retrieves the actual payment from Razorpay and checks captured status, exact amount, INR currency and matching order.
- Only verified test purchases enable GET `/api/client/billing/test/orders/:id/receipt`. It is a clearly labeled **TEST PAYMENT RECEIPT — NOT A TAX INVOICE**.
- GET `/api/client/billing/test` provides the test catalog, connection readiness and tenant-scoped history. Secret keys are never returned.
- Records are kept in `testbillingorders`, with audited creation/verification events. They do not create commercial payments, revenue, tax invoices or live subscriptions. Real billing capture also refuses Razorpay test keys.
- Dismissal and failed payment callbacks do not report success. Pending checkouts can be resumed; failed server verification can be retried without initiating another payment. No client fake-success switch exists in production code.
- This uses Razorpay Standard Checkout/Orders for an upfront sandbox purchase. It does not create a Razorpay recurring mandate. Sandbox verification uses the synchronous payment API; the existing commercial webhook does not process sandbox test receipts.

## Verification

56 API/unit tests passed, including six new sandbox tests covering pricing, missing/live keys, idempotency, tampering, captured-status checks, tenant/role boundaries and verified PDF receipts. The new Playwright test passed using an explicitly mocked provider in the isolated test environment: absent-key UI, verification failure/retry, success/receipt, and no real invoices/payments. Actual Uflex login verified all three test plan cards, disabled checkout without keys, and no overflow at 1568/768/390/320px. Typecheck and production builds passed. Full existing browser suite was not repeated for this increment.

Primary implementation files: `apps/api/src/saas/test-billing.ts`, `apps/api/src/saas/test-billing.test.ts`, `apps/web/src/client/TestPurchase.tsx`, `apps/web/src/client/test-purchase.css`; mounted through the client router and Subscription page. Supporting changes: repository collection, existing commercial test-key guard, `docs/env.example`, `tests/e2e/test-billing.spec.ts`.

References: [Razorpay Standard Checkout integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps), [Test and Live Modes](https://razorpay.com/docs/payments/dashboard/test-live-modes).
