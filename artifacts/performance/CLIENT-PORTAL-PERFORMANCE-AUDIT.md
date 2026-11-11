# ORQIX Client Portal Performance Audit

Completed: 5 November 2026 (Asia/Kolkata). Measurements started on 4 November.

## Scope and method

Audited the actual Uflex portal with 35,903 normalized source rows (33,595 certificates), live MongoDB read-only `explain("executionStats")`, eight authenticated API requests before and after, browser network events, long tasks and CDP rendering counters. The browser ran desktop Chrome at 1440x900 against the local Vite development server. These are single-run observations, not load-test guarantees or p95 production results. The browser run follows the API tests, so its published source cache is warm. The first standalone API read is reported separately as cold. Authentication credentials are accepted on stdin by the audit script and are not stored in artifacts.

## Measured results

| Measurement | Before | After |
|---|---:|---:|
| Browser dashboard ready (warm source cache) | 2,586 ms | 1,937 ms |
| Browser category filter to rendered response | 1,015 ms | 468 ms |
| Warm API median, seven requests | 307 ms | 201 ms |
| Common filter API range (after) | Not summarized | 200-232 ms |
| Immediate repeated API request | Not separately measured | 137 ms |
| Cold dashboard API / source transfer | 3,430 ms | 3,472 ms |
| Response size | 46-56 KB | Identical |
| Layout count during browser scenario | 93 | 63 |
| Recalculate-style count | 160 | 136 |

Initial warm browser, common filters and immediate cache-hit targets were reached in this run. **The cold-load target is not met.** The first source read remains dependent on the current chunk format and Atlas/network transfer. There is no claim that every first login, every dataset size or every network condition now loads within two seconds.

## Actual causes

1. Cold reads transfer all 72 matching source chunks: approximately 11.16 MB, although the public dashboard response is only approximately 52 KB. The existing implementation computes all report families in memory. MongoDB executes the indexed chunk query in approximately 1 ms; transferring/deserializing all the source records is the dominant cold cost. Dashboard GET does not re-parse the Excel file; parsing happens at publication input.
2. A 30-second row-cache lifetime matched the 30-second client polling interval, making otherwise routine refreshes eligible for another full read. Bounded process-memory row caching now lasts 120 seconds.
3. Identical dashboard/ticker/notification requests repeated the same calculations. A five-second, two-entry computed snapshot cache now coalesces these requests. Fresh dataset metadata, organization revision and India date are checked before using it; large results above 100,000 certificate/procurement rows are not retained in this result cache. It introduces no persistent database or filesystem copies.
4. Publication cleanup read tenant dataset metadata and then separately re-read published metadata on every snapshot. A single tenant-scoped metadata read now performs the same expiry check and selects valid publications.
5. The API re-read the same session in authentication and client context middleware. The authenticated session is reused only within that HTTP request. Subsequent requests and WebSocket session checks still revalidate access.
6. Notifications checked up to 50 existing certificate alert deduplication keys with sequential queries. One tenant-scoped notice lookup now skips existing alerts; missing alerts retain the original creation path and message content.
7. Graph components re-rendered and restarted animations when filter responses returned equivalent chart arrays. Memoized scalar name/value comparisons now avoid re-rendering unchanged charts. Changed chart values and initial chart animations still render normally; the UI design has not changed.

## MongoDB execution plans and index

| Query | Before | After | Documents / keys examined |
|---|---|---|---|
| Published datasets | IXSCAN / FETCH | Same | 2 / 2 |
| Source chunks | IXSCAN / FETCH / SORT | Same | 72 / 72 |
| Organization membership by user/status | COLLSCAN / SORT | IXSCAN / FETCH | 2 / 0 before; 1 / 1 after |
| Portal accounts and registrations | Indexed | Same | No native rows in this scope |

Added and verified one **non-unique** index on `organizationmembers`: `{ userId: 1, status: 1, createdAt: -1 }`, name `userId_1_status_1_createdAt_-1`. The repository schema declares the same index for subsequent deployments. No indexes or records were dropped, no production records were rewritten and no user-facing totals were changed. The tiny current membership collection was not the principal latency source; this removes a demonstrated collection scan on the authentication hot path as membership count grows.

No redundant source-chunk index was added: the existing dataset/index index already narrows the read to the correct dataset. Sorting only 72 chunks took approximately 1 ms on the database.

## Experiments deliberately not enabled

- Built-in MongoDB zlib wire compression was slower in the read-only experiment (uncompressed approximately 3.85-6.14 s; compressed 7.10-10.21 s). No connection setting was changed.
- A packed MongoDB aggregation response reduced transfer representation from 11,161,706 to 7,575,232 bytes and decoded to byte-for-byte identical source rows, but did not improve measured latency (3,185 vs 3,268 ms). The experimental pipeline remains under scripts/performance only and is not used by the application.
- No Redis, BullMQ, new service, data migration, published-data rewrite or new dependency was introduced. A full aggregation/materialization rewrite was not justified as a safe minimal change to the current calculations. The cold source-transfer limitation remains explicit.

## APIs and implementation files

- `GET /api/client/axis`: metadata read, bounded calculation cache and existing row cache tuning in `apps/api/src/axis/service.ts`.
- `GET /api/client/axis/notifications`: existing-alert lookup in `apps/api/src/axis/router.ts`.
- Client context/authentication: `apps/api/src/auth.ts`, `apps/api/src/app.ts`, `apps/api/src/saas/router.ts`.
- Membership index: `apps/api/src/enterprise/repository.ts`.
- Charts: `apps/web/src/axis/BusinessPages.tsx`.
- Cache regression checks: `apps/api/src/axis/axis.test.ts`.
- Reproducible measurements: `scripts/performance/audit-client.mjs`, JSON artifacts beside this report.

Existing API response schemas, data fields, pagination, filters, source ordering, arithmetic, exports, authentication and RBAC are preserved. The existing 250 ms search debounce, AbortSignal cancellation and keep-previous-data behavior remain in place. Repeated development network requests were confirmed as aborted React StrictMode mounts; StrictMode was not disabled and valid requests were not suppressed.

## Verification

- All eight before/after API response fingerprints are identical (including charts, tables, filters and KPI data); all corresponding sizes and metrics match.
- 73 API/unit tests passed, including cache reuse, publication version invalidation, organization revision invalidation, revocation, tenant boundaries and existing workflow tests.
- Production frontend and API builds passed.
- Both browser suites passed: client publication/filter/reconciliation/export/consultation flow and client onboarding/membership/document/support flow.

Artifacts contain query plans, timings and authorized aggregate metrics, not raw Excel records or authentication secrets. Live read-only measurement was supplemented by isolated test fixtures; no live portal BOT, upload, deletion or payment was executed.
