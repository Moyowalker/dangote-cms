# Backend Enterprise Checklist (Live Canteen Readiness)

Use this checklist as the backend go-live gate for a busy canteen environment.

Primary question: when the line is long, requests cluster at the same time, and operators need an immediate answer, will the backend return a correct and auditable outcome without creating ambiguity or trust loss?

Status note: this checklist replaces the earlier feature-completeness framing. Existing checkmarks from the MongoDB cleanup pass should be re-evaluated against operational readiness, not carried forward automatically.

Assessment update: first-pass status applied against the current backend on 2026-03-22.

Known blockers before this can be treated as live-canteen ready:

- Legacy `staff` compatibility still exists in backend persistence and some internals, though runtime auth responses now normalize to `vendor`
- Domain naming still mixes worker and employee concepts, which increases integration and support ambiguity
- The Jest suite passes, but it still force-exits after completion, so the test environment is not fully clean
- Throughput and latency expectations are observable but not yet enforced as explicit operational budgets

## 1. Transaction Certainty and Queue Safety

- [x] Validation and consumption decisions remain backend-owned; clients cannot self-assert eligibility or success
- [x] Manual worker_identifier validation path exists
- [x] Signed QR token validation path exists server-side
- [x] Duplicate and near-simultaneous redemption attempts are blocked server-side
- [x] Entitlement deduction and transaction write are treated as one atomic outcome
- [ ] Backend exposes a first-class recovery path for clients to resolve request outcomes after timeout or dropped response
- [ ] API contract explicitly distinguishes confirmed failure from outcome-unknown states for frontend recovery

## 2. Auth, RBAC, and Trust Boundaries

- [x] Session-based authentication is consistent and documented
- [~] RBAC role model is aligned at the runtime API boundary, but legacy `staff` compatibility still exists in persisted and internal backend paths
- [x] Route-level authorization is enforced for protected endpoints
- [x] Server-side data filtering exists for role-scoped access
- [x] Sensitive entry points have stricter rate limits than general API traffic
- [x] Frontend and callers are not trusted for entitlement, balance, or restricted-field decisions

## 3. Data Model and Integrity

- [x] Core MongoDB collections exist for users, workers, entitlements, vendors, transactions, audits, reconciliation, and QR metadata
- [x] Worker lifecycle states are modeled explicitly
- [x] Duplicate-prevention and lookup indexes exist for key operational paths
- [x] Migration and seed scripts exist for bootstrap and identifier migration work
- [ ] Entity naming is consistent enough that worker, employee, vendor, and staff concepts do not blur operational meaning
- [ ] Historical and operational records use consistently named actor fields across transaction and reconciliation paths

## 4. Validation, Error Contracts, and Safety

- [x] Validation is applied on write endpoints and critical query-driven report paths
- [x] Error envelopes are explicit and non-leaky
- [x] Invalid QR tokens, expired tokens, and malformed reporting queries are rejected explicitly
- [x] Client-supplied protected fields for consumption outcomes are ignored or blocked
- [ ] Error contracts are shaped strongly enough for clients to distinguish retryable, non-retryable, and escalation-required failures without inference
- [ ] Timeout and degraded-dependency behavior is documented as part of the backend contract, not left to generic 500 handling

## 5. Degraded Dependency and Failure Handling

- [x] Health and readiness endpoints exist and include database readiness
- [x] Startup database failures fail fast and are reported
- [x] Unhandled promise rejections and uncaught exceptions are reported through the error monitoring service
- [ ] Backend defines clear runtime behavior for transient Mongo latency, partial downstream failure, or overload beyond generic errors
- [ ] Request shedding, queue protection, or explicit overload signaling is documented for rush-period behavior
- [ ] Recovery semantics after a write succeeds but response delivery fails are exposed to clients or operators in a first-class way

## 6. Reporting, Audit, and Reconciliation

- [x] Reporting endpoints support date range, vendor, worker category, and status filters
- [x] Dashboard indicators expose useful risk and exception counts
- [x] Success and failure ticket-consume paths are audit logged
- [x] Audit strategy is append-only and tamper-evident by design intent
- [x] Reconciliation endpoints aggregate vendor-day activity with discrepancy indicators
- [ ] Audit and reconciliation terminology is fully aligned with the current role model and actor naming

## 7. API Operability and Documentation

- [x] Core backend routes are action-oriented around validate, consume, report, and reconcile operations
- [x] Pagination exists for list-style endpoints
- [x] README documents the current API surface and examples
- [ ] API docs clearly describe operationally important response states such as duplicate-blocked, already-consumed, and recovery-safe follow-up behavior
- [ ] Backend contracts are documented from the perspective of canteen operations, not only endpoint completeness

## 8. Observability and Operations

- [x] Structured request logging includes request IDs and duration
- [x] Error monitoring strategy is documented
- [x] Deployment and promotion documentation exists
- [x] Dashboard indicators include failure and duplicate-window signals useful for live operations
- [ ] Alert thresholds and incident playbooks are complete enough for repeated rush-hour backend degradation
- [ ] Operational SLOs or internal targets exist for validation latency, consume latency, readiness degradation, and error spikes

## 9. Testing and Release Gates

- [x] Service and route tests cover critical validation, consumption, duplicate protection, reporting, reconciliation, and RBAC paths
- [x] QR issue and verification flows are covered by tests
- [x] Current backend Jest suite passes
- [ ] Test runtime exits cleanly without force-exit or open-handle warnings
- [ ] Tests cover degraded scenarios such as database slowness, response-loss ambiguity, and operational recovery behavior
- [ ] Release sign-off includes evidence for concurrency and lunch-rush style load, not only functional correctness

## 10. Cleanup and Decommissioning Discipline

- [x] MongoDB is the canonical backend direction and legacy SQLite direction is documented as removed
- [x] README and operational docs reflect the current MongoDB backend surface
- [ ] Remaining naming and compatibility residue from older role or domain models is removed
- [ ] Deprecated public pages and stale backend-facing assets are fully decommissioned where no longer part of the supported path
- [ ] Workspace search verifies no stale references remain to retired backend contracts before merge
