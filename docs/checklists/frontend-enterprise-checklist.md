# Frontend Enterprise Checklist (Live Canteen Readiness)

Use this checklist as the frontend go-live gate for a busy canteen environment.

Primary question: will this still work when the queue is long, the device is slow, the network is unstable, and the vendor has no patience for ambiguity?

Companion documents:

- Current-state assessment: `docs/checklists/frontend-live-readiness-assessment.md`
- Feature-completeness gate: `docs/checklists/frontend-feature-checklist.md`
- Delivery plan: `docs/operations/frontend-canteen-readiness-plan.md`
- Manual drills: `docs/operations/frontend-manual-drills.md`

Status note: this checklist replaces the earlier feature-completeness framing. Existing checkmarks from the 2026-03-21 MongoDB endpoint and role-alignment pass should be re-evaluated against these operational criteria instead of being carried forward automatically.

Assessment update: first-pass status applied against the current React frontend on 2026-03-22.

Known blockers before this can be treated as live-canteen ready:

- Legacy `staff` compatibility still exists in backend persistence, but the runtime API role exposed to the frontend is now normalized to `vendor`
- Camera-native QR scanning exists, but it is not yet validated for repeated rush-hour use on real canteen devices
- Frontend test coverage is still too narrow for go-live confidence

## 1. Vendor POS Throughput and Queue Flow

- [ ] Scan-to-result flow is fast enough for lunch-rush usage on low-end Android devices
- [x] Manual worker_identifier fallback is as fast and obvious as the QR path when scanning fails
- [ ] Vendor can complete the most common redemption path with minimal taps and no hidden steps
- [~] Camera startup and scan affordances now exist, but reliability on real canteen devices is not yet validated
- [x] Primary actions remain responsive while validation is in progress and never feel frozen
- [ ] Success screen confirms amount, remaining balance, and transaction reference without extra navigation
- [ ] Failure screen gives the vendor an immediate next action instead of a generic error dead end

## 2. Degraded Network and Slow Backend Behavior

- [~] POS flow defines expected behavior for slow responses, request timeouts, disconnects, and reconnects
- [x] UI distinguishes clearly between processing, confirmed failure, and unknown transaction state
- [x] Vendor sees a safe recovery path when the request outcome is unknown after submission
- [x] Retry behavior is explicit, idempotent-safe, and does not encourage duplicate deductions
- [x] Reconnection handling restores the operator to a usable state without forcing a full refresh mid-queue
- [x] Session expiry during an active transaction is handled without ambiguous loss of transaction state

## 3. Duplicate Attempts, Fraud Signals, and Ambiguous Outcomes

- [ ] Duplicate scans or repeated submissions within a short window are surfaced immediately and clearly
- [ ] The UI explains whether a blocked retry was prevented, already processed, or still being verified
- [ ] Vendor can inspect the latest transaction outcome quickly enough to decide whether to serve the worker
- [ ] Fast-repeat scans, stale QR use, and suspicious retry patterns are communicated without confusing the operator
- [ ] Transaction status language is unambiguous enough that frontline staff do not guess what happened

## 4. Operator Error Tolerance and Recovery

- [ ] POS supports fast correction for wrong worker_identifier entry, wrong amount, and accidental back navigation
- [ ] Critical actions have touch targets, focus behavior, and keyboard support suitable for hurried use
- [~] Camera permission denial and unsupported-browser fallback paths now exist, but damaged QR, glare, and poor-lighting handling are not yet validated
- [x] Error messages are short, specific, and understandable under time pressure
- [ ] Frontline escalation path is obvious when the vendor cannot safely decide the next step

## 5. Worker-Facing Clarity

- [ ] Worker self-service view shows worker_identifier, QR, current balance, and recent transactions clearly
- [ ] Worker-facing screens make lifecycle status (active, suspended, deactivated) obvious before the vendor must explain it
- [ ] Exhausted entitlement, suspension, and ineligible purchase states are understandable without backend jargon
- [ ] QR display is usable on common low-brightness or damaged screens

## 6. Admin and Operations Support

- [~] Dashboard exposes operational KPIs that matter during service hours: failed attempts, duplicate blocks, redemption totals, location activity, failure reasons, failed-attempt hotspots by location, and validate or consume latency and stall visibility; retry-pattern interpretation is still limited
- [~] Exception indicators now help ops identify failed attempts, duplicate-window trouble, location hotspots, and endpoint health stress, but richer investigation paths are still missing
- [x] Worker onboarding, edit, suspend, and deactivate actions are fast enough not to block live support
- [ ] Entitlement policy assignment and corrections are manageable without risky workarounds
- [~] Reports now support date range, vendor, worker category, status, and failure-reason filters plus transaction-detail review with transaction-reference visibility and missing-link warnings, but cross-transaction investigation support is still limited
- [~] Reconciliation view now exposes vendor-day discrepancy indicators plus drilldowns for confirmed consumptions, failed attempts, and missing transaction-reference links, but it still lacks fuller missing-confirmation investigation detail

## 7. API and State Management Readiness

- [x] All eligibility and deduction decisions remain backend-owned; frontend never invents a success state
- [x] Frontend state model covers idle, processing, succeeded, failed, and outcome-unknown states explicitly
- [ ] API errors are mapped to action-oriented messages, not just readable text
- [x] Last-attempt transaction details can be recovered or re-fetched after transient failure
- [x] Double-submit prevention exists without trapping the operator in a stuck state
- [x] Frontend auth bootstrap and persistence are aligned with the backend session model (`/auth/login`, `/auth/me`, cookies)
- [x] Frontend sends the CSRF token required by the backend on state-changing requests
- [x] Client storage is limited to the minimum user and transaction context needed for safe recovery

## 8. Device, Accessibility, and Responsiveness

- [ ] Layouts are proven on small mobile screens used by vendors, not just desktop browser resizing
- [ ] Text sizing, contrast, and spacing remain usable in bright canteen lighting conditions
- [ ] Critical POS actions are reachable with keyboard input and assistive tech where practical
- [x] Forms and controls provide labels, validation hints, and inline error states without clutter
- [ ] Performance remains acceptable on low-memory devices and mid-session browser degradation

## 9. Testing and Operational Quality Gates

- [~] Unit tests cover route guards, login recovery, dashboard behavior, reports rendering and filter application, worker admin create/edit/delete flows, reconciliation drilldown behavior, QR-token vendor flow, camera-scan integration, duplicate-submit prevention, and vendor outcome-recovery state, but wider operational coverage is still missing
- [ ] Integration tests cover login, worker onboarding UI, vendor redemption, ambiguous response recovery, and report filtering
- [ ] Regression tests cover role-based navigation plus canteen-critical flows under repeated rapid interactions
- [x] Manual test scripts exist for weak network, dropped responses, camera failure, session expiry, and low-end device usage
- [x] Build passes with zero blocking lint, type, or test issues
- [ ] Release sign-off includes evidence from realistic queue simulations, not only happy-path demos

## 10. Cleanup, Documentation, and Go-Live Discipline

- [ ] Obsolete frontend pages and assets tied to deprecated flows are removed before go-live
- [ ] Dead routes and stale navigation entries are removed so operators are not exposed to wrong paths
- [x] API calls to deprecated endpoints are removed after backend migration
- [ ] Operator-facing UI docs and screenshots reflect the current live flow, including failure and retry states
- [ ] Pre-merge workspace search confirms no stale references remain to removed screens, routes, or endpoints
- [ ] Go-live notes document known limitations, manual workarounds, and escalation contacts for service-hour incidents
