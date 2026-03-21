# Frontend Enterprise Checklist (Web-First, Mobile-First Vendor Flow)

Use this checklist as the delivery gate for all frontend work.

Status update: Completed items checked as part of the MongoDB endpoint and role-alignment pass on 2026-03-21.

## 1. Architecture and Structure

- [ ] Frontend has a clear module structure (auth, worker, vendor POS, admin dashboard, reports, reconciliation)
- [x] Shared concerns are centralized (API client, auth context, route guards, reusable UI)
- [ ] Legacy pages/components no longer used are identified and queued for removal
- [x] Route map aligns with backend domain actions

## 2. Authentication and Authorization UX

- [x] Login/logout flows are robust and role-aware
- [x] Route guards enforce role access (Admin, Vendor, Viewer, optional HR)
- [x] Unauthorized states are handled gracefully with clear messaging
- [x] Session/token expiry handling is consistent and user-safe

## 3. Vendor POS Experience (Highest Priority)

- [ ] Mobile-first design optimized for low-end devices
- [x] Validation supports QR scan path and manual worker_identifier entry
- [x] Redemption flow minimizes clicks and input friction
- [x] Success/failure states clearly show reason and next action
- [ ] Duplicate/too-fast retry attempts are clearly surfaced
- [ ] Transaction confirmation displays remaining balance and reference ID

## 4. Worker Experience

- [ ] Worker self-service view shows unique worker_identifier, QR, balance, and recent transactions
- [ ] Lifecycle status (active/suspended/deactivated) is clearly visible
- [ ] UX communicates when account is suspended or entitlement is exhausted

## 5. Admin and Operations Views

- [x] Worker onboarding/edit/suspend/deactivate flows are complete
- [ ] Entitlement policy assignment is manageable from admin interface
- [x] Dashboard shows real-time operational KPIs and exception indicators
- [ ] Reports support filters by date range, vendor, worker category, status
- [ ] Reconciliation view includes discrepancy indicators and drilldown

## 6. API Integration Standards

- [x] All business eligibility and deduction outcomes come from backend decisions
- [x] API errors are mapped to user-readable messages
- [x] Loading, empty, and error states are handled for every data view
- [x] Idempotency-safe UI handling for redemption actions (prevent double-submit)

## 7. Accessibility and Responsiveness

- [ ] Keyboard support is present for critical actions
- [ ] Contrast and text sizing meet practical accessibility thresholds
- [ ] Layouts are validated on small mobile screens and desktop
- [ ] Forms have labels, validation hints, and clear error states

## 8. Frontend Security Basics

- [x] No sensitive business rules are implemented only in frontend
- [x] No hardcoded secrets or credentials in source
- [x] Token/session storage strategy is documented and consistent
- [ ] Client only stores minimum required user data

## 9. Testing and Quality Gates

- [ ] Unit tests cover route guards and core form logic
- [ ] Integration tests cover login, worker onboarding UI, vendor redemption flow, and report filtering
- [ ] Critical regression tests exist for role-based navigation
- [x] Build passes with zero blocking lint/type/test issues

## 10. Cleanup and Decommissioning

- [ ] Remove obsolete frontend pages/assets tied to deprecated backend flows
- [ ] Remove dead routes and stale navigation entries
- [x] Remove API calls to deprecated endpoints after backend migration
- [ ] Update UI docs and screenshots after major flow changes
- [ ] Validate no references remain to removed files via workspace search before merge
