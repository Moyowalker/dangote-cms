# Backend Enterprise Checklist (MongoDB-First)

Use this checklist as the delivery gate for all backend work.

Status update: Completed items checked as part of the MongoDB canonicalization and cleanup pass on 2026-03-21, plus entitlement admin API/assignment, ticket-flow audit logging with tests, validation/error-envelope standardization, employee-domain service-layer extraction, ticket-domain service extraction for validation/consume rules, role-based employee filtering, worker lifecycle modeling, tamper-evident append-only audit chain, reconciliation aggregation endpoints/tests, and health/readiness operational endpoints on 2026-03-21.

## 1. Architecture and Structure

- [x] Single canonical backend is defined and documented (MongoDB stack only)
- [x] Legacy/duplicate backend folders are identified and tagged for removal
- [ ] Backend is organized by domain boundaries (auth, worker, vendor, entitlement, transaction, reporting, audit, reconciliation)
- [ ] Business logic is in service layer, not route handlers
- [x] Shared middleware is centralized (auth, RBAC, validation, error handling, rate limiting)
- [x] Config is environment-driven and centralized

## 2. Data Model (MongoDB)

- [ ] Core collections exist: User, Worker, WorkerCategory, EntitlementPolicy, WorkerEntitlementBalance, Vendor, VendorRestriction, Transaction, AuditLog, ReconciliationRecord, QRTokenMetadata
- [x] Worker has unique worker_identifier independent of Mongo _id
- [x] Worker lifecycle states are modeled: active, suspended, deactivated
- [ ] Indexes exist for all high-cardinality lookup paths (worker_identifier, vendor_id/date, transaction reference, audit timestamp)
- [x] Unique and compound indexes are defined for duplicate prevention and integrity constraints
- [ ] Migration/seed scripts exist for local and non-production bootstrapping

## 3. Auth and RBAC

- [x] Strong authentication implemented (session or JWT strategy is consistent and documented)
- [ ] RBAC roles defined: Admin, Vendor, Viewer (HR optional)
- [x] Route-level authorization enforced for all protected endpoints
- [x] Role-based data filtering enforced server-side
- [x] Sensitive endpoints have stricter rate limits

## 4. Validation, Security, and Compliance

- [x] Input validation applied on all write endpoints
- [x] Validation errors are explicit, consistent, and non-leaky
- [ ] QR payload strategy is signed and verified server-side
- [ ] Frontend is never trusted for balance/eligibility decisions
- [ ] Security headers and CORS policy are explicitly configured
- [ ] Secret management avoids hardcoded credentials

## 5. Worker-Centric Entitlement Flow

- [ ] Vendor can validate by QR token or manual worker_identifier
- [ ] Validation checks include worker existence, active state, suspension, entitlement sufficiency, vendor restrictions, and duplicate window checks
- [ ] Deduction and transaction write happen atomically
- [ ] Duplicate and near-simultaneous redemption attempts are blocked
- [x] Success and failure outcomes are both audit logged

## 6. Reporting, Audit, and Reconciliation

- [ ] Reports support date range, vendor, worker category, and status filters
- [ ] Dashboard endpoints expose operational and fraud-risk indicators
- [x] Audit log captures actor, action, entity, timestamp, outcome, and metadata
- [x] Audit records are append-only and tamper-evident strategy is defined
- [x] Reconciliation endpoints aggregate by vendor and date with discrepancy indicators

## 7. API Quality

- [x] API contracts are action-oriented (validate, redeem, suspend, reconcile) and versioned when necessary
- [x] Error envelope format is consistent across modules
- [x] Pagination is implemented for list endpoints
- [x] API docs are updated with request and response examples

## 8. Testing and Quality Gates

- [ ] Unit tests for services (validation, deduction, duplicate protection, restriction checks)
- [x] Integration tests for critical flows (QR/manual validation, deduction, suspension rejection, insufficient balance)
- [x] RBAC tests for all protected routes
- [x] Reconciliation and reporting aggregation tests
- [x] Audit creation tests for success and failure paths
- [ ] CI test pipeline passes before merge

## 9. Observability and Operations

- [ ] Structured logging with correlation/request IDs
- [x] Health, readiness, and database connectivity endpoints are available
- [ ] Error monitoring strategy is defined
- [ ] Deployment config supports environment promotion

## 10. Cleanup and Decommissioning (MongoDB Direction)

- [x] Remove SQLite-specific packages, configs, and route logic once Mongo replacements are live
- [x] Remove duplicate backend implementation after migration completion and smoke tests
- [x] Remove stale tests tied to deprecated API contracts
- [x] Update README and runbooks to reflect MongoDB-only backend
- [x] Verify no references remain to removed files via workspace search before merge
