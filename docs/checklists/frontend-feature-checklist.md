# Frontend Feature Checklist

Use this checklist to answer a narrower question than the live canteen readiness checklist:

Did we implement the intended screens, routes, and frontend workflows?

This checklist is intentionally feature-oriented. Use `frontend-enterprise-checklist.md` for live-service readiness and operational go-live decisions.

Status update: assessed against the current React frontend on 2026-03-22.

Known gaps affecting this checklist:

- Legacy `staff` compatibility still exists in backend persistence, but the frontend now consumes `vendor` as the canonical runtime role
- Camera-native scanning now exists, but device-specific ergonomics and field validation are still incomplete
- Frontend test tooling now exists, but release-critical coverage is still incomplete

## 1. App Shell and Routing

- [x] Frontend route map exists for login, dashboard, vendor POS, workers, reports, and other approved modules
- [x] Shared app shell elements are present where expected (navigation, auth context, reusable layout)
- [x] Legacy or deprecated routes are removed from navigation and route configuration

## 2. Authentication and Role Gating

- [x] Login flow is implemented against the current backend session contract
- [x] Logout clears frontend auth state safely
- [x] Route guards enforce the intended roles for each screen
- [x] Unauthorized access redirects or messages are user-safe and consistent

## 3. Vendor and Ticket Workflows

- [x] Vendor screen supports the approved worker lookup and redemption paths
- [x] Ticket or meal-consumption recording flow works from the current frontend
- [x] Success and failure states are visible after validation or redemption
- [x] Recent transaction history is viewable where required

## 4. Worker and Admin Screens

- [x] Worker management list and create or edit flows are implemented
- [x] Worker status changes are supported where required
- [ ] Entitlement or meal-policy management screens exist if they are in release scope
- [ ] Worker self-service screens exist if they are in release scope

## 5. Dashboard, Reports, and Reconciliation

- [x] Dashboard shows the agreed operational summary cards or KPIs
- [~] Reports page supports the agreed report types and filters for the release
- [x] Reconciliation screens exist if reconciliation is in release scope

## 6. API Integration and State Handling

- [x] Frontend uses the current backend endpoints only
- [x] Loading, empty, success, and error states exist for each major data view
- [x] Session expiry handling is implemented consistently across authenticated requests
- [x] Client-side state is consistent after refresh via backend session restoration

Implementation note: the remaining vendor-flow gap is field validation and ergonomics, not the existence of scan support. The frontend now supports manual badge lookup, signed QR token paste, and camera-native QR detection, including recovery after ambiguous outcomes.

## 7. Responsive UI and Accessibility Basics

- [ ] Core screens are usable on target mobile and desktop layouts
- [x] Forms include labels and readable validation or error states
- [x] Navigation and primary actions are operable without layout breakage

## 8. Quality, Docs, and Cleanup

- [x] Frontend build passes in the current environment
- [~] Automated tests cover the intended critical frontend flows for this release
- [ ] UI documentation and screenshots match the shipped experience
- [ ] Deprecated assets, routes, and endpoint references are removed before merge

Implementation note: Vitest coverage now exists for protected-route behavior, login recovery routing, reports rendering and filter application, worker admin create and edit flows, QR-token vendor flow, camera-scan integration, duplicate-submit prevention, and vendor ambiguous-outcome recovery, but broader release scope still needs more admin breadth and end-to-end style coverage.