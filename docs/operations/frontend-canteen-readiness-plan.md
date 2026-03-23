# Frontend Canteen Readiness Plan

Last updated: 2026-03-22

## Objective

Move the React frontend from a basic internal CRUD and reporting UI to a frontend that can support a busy canteen with low tolerance for delay, ambiguity, and operator mistakes.

Companion document:

- `docs/operations/founder-frontend-go-live-testing-plan.md` for a founder-led test process, pass or fail decisions, and pre-go-live signoff questions.
- `docs/operations/founder-frontend-uat-checklist.md` for a shorter founder session checklist and scoring sheet.

## Delivery Principle

Prioritize transaction certainty and queue continuity ahead of new screens. A canteen can tolerate missing non-critical features longer than it can tolerate ambiguous deductions or a stalled vendor line.

## Testing Start Recommendation

Frontend testing can start now, but it should start as a controlled test phase, not as a live-canteen signoff.

What this means in practice:

- Start internal QA against the current React frontend immediately.
- Start role-based UAT for admin and vendor flows once the backend test environment is seeded with realistic workers, categories, and vendor locations.
- Start real-device checks on the lowest-spec Android phones or tablets expected in service.
- Do not treat the current state as ready for full live rollout until real weak-network evidence, real-device scan validation, and broader service-hour release evidence are in hand.

Minimum entry conditions for frontend testing:

- Frontend automated tests are green.
- Frontend production build is green.
- Backend test or staging environment exposes the current session-cookie, CSRF, dashboard, reconciliation, and reports contracts.
- Test users exist for `admin`, `vendor`, and `viewer` or `hr` roles.
- Test data includes duplicate attempts, unknown badge failures, multiple canteen locations, and at least one category-scoped reporting slice.

Recommended test sequence:

1. Browser QA for login, route guards, workers, dashboard, reports, and reconciliation.
2. Vendor POS testing on desktop browsers for badge, QR token, timeout, recovery, and session-expiry behavior.
3. Real-device vendor testing for camera scan, glare, slow network, and rapid repeated transactions.
4. Controlled pilot with supervisors observing queue speed, operator confusion points, and failure handling.

## Priority Order

## P0. Role Alignment and Transaction Certainty

Why this comes first:

- Role drift, auth-contract drift, and weak recovery semantics were previously the highest-risk frontend failures.
- These fixes are now in place, but they remain the baseline that every later release must preserve.
- Any regression here would immediately reintroduce ambiguity at the canteen line.
- Losing certainty on whether a meal was consumed is the fastest way to damage trust at the canteen line.

Frontend tasks:

- Align frontend role naming, route guards, and navigation with the backend and documentation model.
- Keep the current session-cookie and CSRF alignment intact as the baseline contract.
- Replace the single vendor loading flag with an explicit transaction state model: `idle`, `validating`, `redeeming`, `succeeded`, `failed`, `unknown`.
- Preserve enough last-attempt context to recover from dropped responses without guessing.
- Add a visible post-submit recovery path: check latest transaction, retry safely, or escalate.
- Make success copy include the fields operators need to make a serve or stop decision immediately.

Status:

- Runtime role alignment, session-cookie auth, CSRF handling, explicit vendor transaction states, pending-attempt persistence, and return-to-origin login recovery are now in place.
- Signed QR token lookup and camera-native scan entry are now in place in the vendor flow, alongside duplicate-submit test coverage and outcome recovery.
- Remaining work in this bucket is mostly operator-facing clarity: richer duplicate outcome messaging, more decision-grade success/failure copy, and real-device scan validation.

Acceptance criteria:

- Frontend auth, session restoration, and CSRF behavior continue to match the backend contract exactly.
- A vendor can always tell whether the meal was recorded, definitely failed, or still needs verification.
- Role-gated routes and nav labels match the documented release role model.
- Session expiry does not silently destroy transaction context.

## P0. Slow Network, Timeout, and Reconnect UX

Why this comes second:

- The busiest service periods are exactly when backend slowness and unstable mobile conditions become visible.
- The vendor flow now has degraded-mode behavior, but the rest of the app still needs the same discipline.

Frontend tasks:

- Add request timeouts and canteen-safe timeout messaging.
- Distinguish processing from timeout from confirmed backend rejection.
- Add reconnect and offline indicators appropriate for vendor screens.
- Prevent full-page redirect behavior from being the only session-expiry response during active work.
- Define what the operator should do next for each degraded state.

Status:

- Vendor-screen timeout handling, offline bannering, reconnect recovery, and session-expiry return-path preservation are now implemented.
- Remaining work is to extend the same degraded-mode discipline beyond the vendor POS screen and document explicit operator drills.

Acceptance criteria:

- Slow responses do not look like frozen UI.
- Operators get specific next actions for timeout, offline, reconnect, and unauthorized states.
- A dropped response can be recovered without duplicate consumption.

## P1. Vendor POS Speed and Mobile Ergonomics

Why this follows P0:

- Once transaction certainty exists, the next risk is queue speed.
- The current vendor flow is functional but not optimized for repeated high-pressure use.

Frontend tasks:

- Collapse the vendor flow into the minimum-steps common path.
- Add QR scan support or explicitly defer it with a documented operational workaround.
- Optimize focus management, large touch targets, input clearing, and fast repeat use.
- Improve the success and failure views for fast visual parsing.
- Validate layout and performance on the real device class expected in the canteen.

Acceptance criteria:

- Common redemption flow feels fast on low-end mobile hardware.
- Operators can recover quickly from wrong entry, glare, permission denial, or damaged codes.
- Visual states are understandable at a glance under time pressure.

## P1. Ops Visibility and Exception Handling

Why this matters before broad rollout:

- Service-hour incidents need fast diagnosis.
- The current dashboard favors summary counts over live operational signals.

Frontend tasks:

- Add exception-oriented widgets for failure rate, retry rate, stuck states, and vendor trouble spots.
- Surface duplicate-attempt and discrepancy indicators more clearly in reports or reconciliation views.
- Add admin flows needed to respond to canteen incidents without resorting to backend-only workarounds.

Status:

- Dashboard now surfaces failed attempts, duplicate-window blocks, redemption totals, and redemptions by location using the existing backend indicators endpoint.
- Dashboard now also surfaces failure reasons and failed-attempt hotspots by location using ticket-consume audit data.
- Dashboard now also surfaces latency and stall visibility for validate and consume paths using backend request-health indicators.
- A reconciliation screen now lets admins review vendor-day failed attempts, discrepancy indicators, vendor-location drilldowns for confirmed consumptions and failed attempts, transaction-reference linkage gaps, and whether failed attempts were later confirmed or remain unresolved by date from the React app.
- Reports now expose backend-backed date-range, vendor, worker-category, and status filters plus transaction details with transaction-reference evidence and missing-link warnings for investigation.
- Remaining work is richer investigation support such as broader cross-transaction tracing beyond the current matched-versus-unresolved evidence, clearer duplicate-pattern interpretation, and more direct admin response tooling.

Acceptance criteria:

- Operations staff can identify whether an issue is isolated, vendor-specific, or system-wide.
- Admin users can investigate suspicious or repeated failures from the UI.

## P2. Missing Scope Screens

Why this is not earlier:

- These gaps matter, but they are less dangerous than ambiguous vendor transactions.

Frontend tasks:

- Build worker self-service pages if worker-facing web remains in release scope.
- Add entitlement management UI if policy assignment must move out of backend-only flows.
- Expand reconciliation beyond the current vendor-location drilldown into broader finance investigation support and stronger cross-transaction tracing if finance or operations needs them.

Acceptance criteria:

- Scope-critical personas can complete their required flows without falling back to backend tooling.

## P2. Frontend Test and Release Discipline

Why this must land before broad go-live:

- The frontend now has a focused test suite, but it is still not broad enough to protect a live rollout by itself.
- Regressions in auth, routing, and POS behavior will still reach production unnoticed if coverage does not expand with the product.

Frontend tasks:

- Add frontend test tooling and baseline coverage for auth guards, vendor flow, and critical mutations.
- Add integration coverage for timeout, retry, duplicate-submit prevention, and session expiry.
- Define manual drills for weak network, dropped responses, low-end mobile hardware, and rapid repeated transactions.
- Capture release evidence from realistic queue simulations rather than happy-path demos.

Status:

- Frontend test tooling is now in place with baseline coverage for protected-route behavior, login return-path recovery, reports rendering, QR-token vendor flow, camera-scan behavior, duplicate-submit prevention, vendor ambiguous-outcome recovery, and reconciliation drilldown behavior.
- Reports filter application coverage is now in place alongside the rendering checks.
- Worker admin create and edit coverage is now in place as the first non-vendor admin test slice.
- Dashboard behavior, reconciliation summary coverage, and worker delete coverage are now in place, and manual degraded-network drills are documented.
- Remaining work is broader release coverage, especially wider admin workflows and realistic end-to-end queue simulations.

Acceptance criteria:

- Each canteen-critical flow has either automated coverage, a documented manual drill, or both.
- Release sign-off includes evidence for degraded conditions, not only green builds.

## Suggested Delivery Sequence

1. Fix role naming and transaction-state model.
2. Implement timeout, reconnect, and unknown-outcome recovery.
3. Tighten the vendor POS interaction model for speed.
4. Add operational visibility and reconciliation signals.
5. Fill scope gaps such as worker self-service and entitlement UI.
6. Lock in frontend tests and go-live drills.