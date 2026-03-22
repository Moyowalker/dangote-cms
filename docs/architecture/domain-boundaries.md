# Backend Domain Boundaries

The backend is organized by bounded domains with route entry points delegating to service-layer logic.

## Domains

- auth: session login/logout/me
- worker: employee profile lifecycle and category assignment
- vendor: vendor and vendor restriction enforcement in entitlement validation
- entitlement: entitlement policy and worker daily balance checks
- transaction: immutable transaction records for redemption attempts
- reporting: aggregated daily and department reporting
- audit: append-only audit event stream
- reconciliation: vendor daily reconciliation with discrepancy indicators

## Directory Mapping

- Routes: `src/routes/*.js`
- Services: `src/services/*.js`
- Models: `src/database.js`

## Service-Layer Rule

Route handlers should perform HTTP concerns only:

- request parsing
- auth middleware binding
- response serialization

Business rules should stay in service modules under `src/services`.
