# Backend Enterprise Checklist (MongoDB-First)

Use this checklist as the delivery gate for all backend work.

Status update: Completed items checked as part of the MongoDB canonicalization and cleanup pass on 2026-03-21, plus entitlement admin API/assignment, ticket-flow audit logging with tests, validation/error-envelope standardization, employee-domain service-layer extraction, ticket-domain service extraction for validation/consume rules, reporting/reconciliation service extraction, role-based employee filtering, worker lifecycle modeling, tamper-evident append-only audit chain, reconciliation aggregation endpoints/tests, reporting filters for date range/vendor/worker category/status, health/readiness operational endpoints, explicit security headers/CORS policy, structured logging with request IDs, signed QR token issue/verification flow with persisted metadata, expanded core domain models (Vendor, VendorRestriction, Transaction, ReconciliationRecord, QRTokenMetadata), vendor restriction enforcement and duplicate-window redemption checks in validation flow, unit tests for service-layer entitlement logic, GitHub Actions CI test pipeline configuration on 2026-03-21, and full readiness closure (RBAC matrix, migration/seed scripts, worker_identifier index migration support, dashboard risk indicators, trust-boundary enforcement, secret hardening, error monitoring strategy, and deployment promotion workflow) on 2026-03-22.

## 1. Architecture and Structure

- [x] Single canonical backend is defined and documented (MongoDB stack only)
- [x] Legacy/duplicate backend folders are identified and tagged for removal
- [x] Backend is organized by domain boundaries (auth, worker, vendor, entitlement, transaction, reporting, audit, reconciliation)
- [x] Business logic is in service layer, not route handlers
- [x] Shared middleware is centralized (auth, RBAC, validation, error handling, rate limiting)
- [x] Config is environment-driven and centralized

## 2. Data Model (MongoDB)

- [x] Core collections exist: User, Worker, WorkerCategory, EntitlementPolicy, WorkerEntitlementBalance, Vendor, VendorRestriction, Transaction, AuditLog, ReconciliationRecord, QRTokenMetadata
- [x] Worker has unique worker_identifier independent of Mongo _id
- [x] Worker lifecycle states are modeled: active, suspended, deactivated
- [x] Indexes exist for all high-cardinality lookup paths (worker_identifier, vendor_id/date, transaction reference, audit timestamp)
- [x] Unique and compound indexes are defined for duplicate prevention and integrity constraints
- [x] Migration/seed scripts exist for local and non-production bootstrapping

## 3. Auth and RBAC

- [x] Strong authentication implemented (session or JWT strategy is consistent and documented)
- [x] RBAC roles defined: Admin, Vendor, Viewer (HR optional)
- [x] Route-level authorization enforced for all protected endpoints
- [x] Role-based data filtering enforced server-side
- [x] Sensitive endpoints have stricter rate limits

## 4. Validation, Security, and Compliance

- [x] Input validation applied on all write endpoints
- [x] Validation errors are explicit, consistent, and non-leaky
- [x] QR payload strategy is signed and verified server-side
- [x] Frontend is never trusted for balance/eligibility decisions
- [x] Security headers and CORS policy are explicitly configured
- [x] Secret management avoids hardcoded credentials

## 5. Worker-Centric Entitlement Flow

- [x] Vendor can validate by QR token or manual worker_identifier
- [x] Validation checks include worker existence, active state, suspension, entitlement sufficiency, vendor restrictions, and duplicate window checks
- [x] Deduction and transaction write happen atomically
- [x] Duplicate and near-simultaneous redemption attempts are blocked
- [x] Success and failure outcomes are both audit logged

## 6. Reporting, Audit, and Reconciliation

- [x] Reports support date range, vendor, worker category, and status filters
- [x] Dashboard endpoints expose operational and fraud-risk indicators
- [x] Audit log captures actor, action, entity, timestamp, outcome, and metadata
- [x] Audit records are append-only and tamper-evident strategy is defined
- [x] Reconciliation endpoints aggregate by vendor and date with discrepancy indicators

## 7. API Quality

- [x] API contracts are action-oriented (validate, redeem, suspend, reconcile) and versioned when necessary
- [x] Error envelope format is consistent across modules
- [x] Pagination is implemented for list endpoints
- [x] API docs are updated with request and response examples

## 8. Testing and Quality Gates

- [x] Unit tests for services (validation, deduction, duplicate protection, restriction checks)
- [x] Integration tests for critical flows (QR/manual validation, deduction, suspension rejection, insufficient balance)
- [x] RBAC tests for all protected routes
- [x] Reconciliation and reporting aggregation tests
- [x] Audit creation tests for success and failure paths
- [x] CI test pipeline passes before merge

## 9. Observability and Operations

- [x] Structured logging with correlation/request IDs
- [x] Health, readiness, and database connectivity endpoints are available
- [x] Error monitoring strategy is defined
- [x] Deployment config supports environment promotion

## 10. Cleanup and Decommissioning (MongoDB Direction)

- [x] Remove SQLite-specific packages, configs, and route logic once Mongo replacements are live
- [x] Remove duplicate backend implementation after migration completion and smoke tests
- [x] Remove stale tests tied to deprecated API contracts
- [x] Update README and runbooks to reflect MongoDB-only backend
- [x] Verify no references remain to removed files via workspace search before merge
