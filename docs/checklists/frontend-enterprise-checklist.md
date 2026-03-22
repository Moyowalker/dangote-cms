# Frontend Enterprise Checklist (Live Canteen Readiness)

Use this checklist as the frontend go-live gate for a busy canteen environment.

Primary question: will this still work when the queue is long, the device is slow, the network is unstable, and the vendor has no patience for ambiguity?

Status note: this checklist replaces the earlier feature-completeness framing. Existing checkmarks from the 2026-03-21 MongoDB endpoint and role-alignment pass should be re-evaluated against these operational criteria instead of being carried forward automatically.

## 1. Vendor POS Throughput and Queue Flow

- [ ] Scan-to-result flow is fast enough for lunch-rush usage on low-end Android devices
- [ ] Manual worker_identifier fallback is as fast and obvious as the QR path when scanning fails
- [ ] Vendor can complete the most common redemption path with minimal taps and no hidden steps
- [ ] Camera startup, autofocus, and scan affordances are reliable enough for repeated use in a queue
- [ ] Primary actions remain responsive while validation is in progress and never feel frozen
- [ ] Success screen confirms amount, remaining balance, and transaction reference without extra navigation
- [ ] Failure screen gives the vendor an immediate next action instead of a generic error dead end

## 2. Degraded Network and Slow Backend Behavior

- [ ] POS flow defines expected behavior for slow responses, request timeouts, disconnects, and reconnects
- [ ] UI distinguishes clearly between processing, confirmed failure, and unknown transaction state
- [ ] Vendor sees a safe recovery path when the request outcome is unknown after submission
- [ ] Retry behavior is explicit, idempotent-safe, and does not encourage duplicate deductions
- [ ] Reconnection handling restores the operator to a usable state without forcing a full refresh mid-queue
- [ ] Session expiry during an active transaction is handled without ambiguous loss of transaction state

## 3. Duplicate Attempts, Fraud Signals, and Ambiguous Outcomes

- [ ] Duplicate scans or repeated submissions within a short window are surfaced immediately and clearly
- [ ] The UI explains whether a blocked retry was prevented, already processed, or still being verified
- [ ] Vendor can inspect the latest transaction outcome quickly enough to decide whether to serve the worker
- [ ] Fast-repeat scans, stale QR use, and suspicious retry patterns are communicated without confusing the operator
- [ ] Transaction status language is unambiguous enough that frontline staff do not guess what happened

## 4. Operator Error Tolerance and Recovery

- [ ] POS supports fast correction for wrong worker_identifier entry, wrong amount, and accidental back navigation
- [ ] Critical actions have touch targets, focus behavior, and keyboard support suitable for hurried use
- [ ] Camera permission denial, damaged QR codes, glare, and poor lighting have clear fallback paths
- [ ] Error messages are short, specific, and understandable under time pressure
- [ ] Frontline escalation path is obvious when the vendor cannot safely decide the next step

## 5. Worker-Facing Clarity

- [ ] Worker self-service view shows worker_identifier, QR, current balance, and recent transactions clearly
- [ ] Worker-facing screens make lifecycle status (active, suspended, deactivated) obvious before the vendor must explain it
- [ ] Exhausted entitlement, suspension, and ineligible purchase states are understandable without backend jargon
- [ ] QR display is usable on common low-brightness or damaged screens

## 6. Admin and Operations Support

- [ ] Dashboard exposes operational KPIs that matter during service hours: latency, failures, retries, exception rate, and throughput
- [ ] Exception indicators help ops identify POS stalls, repeated failures, and vendor-specific trouble quickly
- [ ] Worker onboarding, edit, suspend, and deactivate actions are fast enough not to block live support
- [ ] Entitlement policy assignment and corrections are manageable without risky workarounds
- [ ] Reports support operational filters needed for investigation: date range, vendor, worker category, status, and failure reason
- [ ] Reconciliation view highlights duplicate attempts, missing confirmations, and discrepancy drilldowns

## 7. API and State Management Readiness

- [ ] All eligibility and deduction decisions remain backend-owned; frontend never invents a success state
- [ ] Frontend state model covers idle, processing, succeeded, failed, and outcome-unknown states explicitly
- [ ] API errors are mapped to action-oriented messages, not just readable text
- [ ] Last-attempt transaction details can be recovered or re-fetched after transient failure
- [ ] Double-submit prevention exists without trapping the operator in a stuck state
- [ ] Client storage is limited to the minimum user and transaction context needed for safe recovery

## 8. Device, Accessibility, and Responsiveness

- [ ] Layouts are proven on small mobile screens used by vendors, not just desktop browser resizing
- [ ] Text sizing, contrast, and spacing remain usable in bright canteen lighting conditions
- [ ] Critical POS actions are reachable with keyboard input and assistive tech where practical
- [ ] Forms and controls provide labels, validation hints, and inline error states without clutter
- [ ] Performance remains acceptable on low-memory devices and mid-session browser degradation

## 9. Testing and Operational Quality Gates

- [ ] Unit tests cover route guards, transaction state transitions, duplicate-submit prevention, and core POS form logic
- [ ] Integration tests cover login, worker onboarding UI, vendor redemption, ambiguous response recovery, and report filtering
- [ ] Regression tests cover role-based navigation plus canteen-critical flows under repeated rapid interactions
- [ ] Manual test scripts exist for weak network, dropped responses, camera failure, session expiry, and low-end device usage
- [ ] Build passes with zero blocking lint, type, or test issues
- [ ] Release sign-off includes evidence from realistic queue simulations, not only happy-path demos

## 10. Cleanup, Documentation, and Go-Live Discipline

- [ ] Obsolete frontend pages and assets tied to deprecated flows are removed before go-live
- [ ] Dead routes and stale navigation entries are removed so operators are not exposed to wrong paths
- [ ] API calls to deprecated endpoints are removed after backend migration
- [ ] Operator-facing UI docs and screenshots reflect the current live flow, including failure and retry states
- [ ] Pre-merge workspace search confirms no stale references remain to removed screens, routes, or endpoints
- [ ] Go-live notes document known limitations, manual workarounds, and escalation contacts for service-hour incidents
