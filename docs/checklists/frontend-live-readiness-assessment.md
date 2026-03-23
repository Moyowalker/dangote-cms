# Frontend Live Readiness Assessment

Assessment date: 2026-03-22

Legend:

- `[x]` Covered in the current frontend
- `[~]` Partially covered or covered only at a basic level
- `[ ]` Missing from the current frontend
- `[!]` Contradiction or material implementation mismatch

## Overall Verdict

The current React frontend is usable as a basic internal operations UI, but it does not yet meet the standard implied by the live canteen readiness checklist.

Highest-risk blockers before calling this canteen-ready:

- `[~]` Camera-native QR scanning now exists in the frontend vendor flow, but it is still unproven on real canteen devices and browser support varies
- `[~]` Runtime role naming is now normalized to `vendor`, but legacy `staff` compatibility still exists in backend persistence and internals
- `[ ]` No worker self-service experience
- `[~]` Frontend test tooling exists and now covers auth, vendor recovery, dashboard, workers, reports, scanner behavior, and reconciliation, but it is still not a full end-to-end service-hour safety net

## Snapshot By Checklist Area

| Checklist Area | Status | Assessment | Evidence |
| --- | --- | --- | --- |
| 1. Vendor POS Throughput and Queue Flow | `[~]` | Manual badge lookup, signed QR token lookup, and camera-native scan entry now all exist, but there is still no measured speed target and the operator must choose between separate validate and redeem actions. Success output now includes remaining balance on the direct success path, but the overall interaction still needs device validation and speed tuning for rush usage. | `frontend/src/pages/VendorInterface.jsx`, `frontend/src/components/QrScannerPanel.jsx`, `frontend/src/App.css` |
| 2. Degraded Network and Slow Backend Behavior | `[~]` | The vendor flow now distinguishes processing, failure, and outcome-unknown states, persists the last unresolved redemption attempt in session storage, shows offline and recovery banners, and lets the operator return through login without losing transaction context. What is still missing is a broader app-wide degraded-network model and richer reconnect guidance beyond the vendor POS screen. | `frontend/src/pages/VendorInterface.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/components/ProtectedRoute.jsx`, `frontend/src/api/client.js`, `frontend/src/context/AuthContext.jsx` |
| 3. Duplicate Attempts, Fraud Signals, and Ambiguous Outcomes | `[~]` | Duplicate handling is still mostly delegated to backend responses, but the UI now clearly preserves the last ambiguous attempt and provides a direct latest-transaction lookup flow before the operator retries. It still does not classify duplicate or suspicious patterns in more detail. | `frontend/src/pages/VendorInterface.jsx`, `README.md` |
| 4. Operator Error Tolerance and Recovery | `[~]` | The current form has labels, disabled submit states, and manual correction by editing fields, but no fast fallback for camera failure, no accidental-navigation protection, and no escalation path. | `frontend/src/pages/VendorInterface.jsx`, `frontend/src/pages/Tickets.jsx` |
| 5. Worker-Facing Clarity | `[ ]` | There is no worker-facing route or page in the React app for worker identifier, QR display, balance, status, or recent transactions. | `frontend/src/App.jsx`, `frontend/src/components/Navbar.jsx` |
| 6. Admin and Operations Support | `[~]` | Admin dashboard stats, operational indicators, failure reasons, failed-attempt hotspots by location, validate and consume latency or stall visibility, worker CRUD, richer reports with backend-backed filters, failure-reason filtering, failed-attempt detail review, report-level transaction-reference linkage visibility, and a React reconciliation drilldown view with transaction-reference linkage visibility plus matched-versus-unresolved failed-attempt follow-up status now exist, and dashboard, reports, reconciliation, plus worker create, edit, and delete flows have frontend test coverage. The remaining gaps are still material: no entitlement management UI, no broader cross-transaction investigation path, and limited admin response tooling beyond visibility. | `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Dashboard.test.jsx`, `frontend/src/pages/Reconciliation.jsx`, `frontend/src/pages/Reconciliation.test.jsx`, `frontend/src/pages/Workers.jsx`, `frontend/src/pages/Workers.test.jsx`, `frontend/src/pages/Reports.jsx`, `frontend/src/pages/Reports.test.jsx`, `src/app.js`, `src/routes/reports.js`, `src/routes/reconciliation.js`, `src/services/reportService.js`, `src/services/reconciliationService.js` |
| 7. API and State Management Readiness | `[~]` | Backend-consumption alignment is materially improved: the frontend uses session restoration via `/auth/me`, sends the backend CSRF token on state-changing requests, models explicit redeem states including `unknown`, and persists only the minimum pending-attempt context needed to recover after auth loss or reconnect. The remaining gaps are broader action-oriented error mapping and canonical role-model cleanup inside backend internals. | `frontend/src/pages/VendorInterface.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/components/ProtectedRoute.jsx`, `frontend/src/api/client.js`, `frontend/src/context/AuthContext.jsx`, `src/routes/auth.js`, `src/app.js` |
| 8. Device, Accessibility, and Responsiveness | `[~]` | The CSS is generally responsive and forms are labeled, but there is no vendor-specific mobile optimization, no evidence of bright-light testing, and no explicit accessibility coverage for high-pressure POS use. | `frontend/src/App.css`, `frontend/src/pages/Login.jsx`, `frontend/src/pages/VendorInterface.jsx` |
| 9. Testing and Operational Quality Gates | `[~]` | The frontend package now has a Vitest-based test harness with focused coverage for protected routes, login return-path behavior, dashboard behavior, reconciliation rendering, drilldown, and refetch behavior, reports rendering and filter application, worker admin create or edit or delete flows, QR-token vendor flow, camera-scan integration, duplicate-submit prevention, and vendor ambiguous-outcome recovery. Manual drill scripts now exist for degraded conditions. The remaining gaps are still broad: limited admin breadth beyond workers, dashboard, reports, and reconciliation, and no true end-to-end queue simulation. | `frontend/package.json`, `frontend/src/components/ProtectedRoute.test.jsx`, `frontend/src/components/QrScannerPanel.test.jsx`, `frontend/src/pages/Dashboard.test.jsx`, `frontend/src/pages/Login.test.jsx`, `frontend/src/pages/Reconciliation.test.jsx`, `frontend/src/pages/VendorInterface.test.jsx`, `frontend/src/pages/Reports.test.jsx`, `frontend/src/pages/Workers.test.jsx`, `docs/operations/frontend-manual-drills.md` |
| 10. Cleanup, Documentation, and Go-Live Discipline | `[~]` | The main frontend routes and current runtime role model are aligned more closely now, but operator-facing failure-state guidance and go-live incident documentation are still thin, and some backend-facing legacy role residue remains outside the UI. | `README.md`, `frontend/src/App.jsx`, `frontend/src/components/Navbar.jsx`, `docs/operations/frontend-canteen-readiness-plan.md` |

## Detailed Notes

### 1. Vendor POS Throughput and Queue Flow

- `[x]` Manual worker identifier entry is present.
- `[x]` Validate and redeem actions are directly accessible on one screen.
- `[x]` Signed QR token lookup is implemented in the vendor screen using the current backend contract.
- `[x]` Camera-native QR scanning is now implemented with graceful fallback to token paste when browser support is missing.
- `[ ]` No speed budget, reduced-tap optimization, autofocus flow, or canteen-device validation evidence is present.
- `[~]` Direct redemption success now shows remaining balance, but recovery-based success still falls back to unavailable balance when the history endpoint cannot supply it.

### 2. Degraded Network and Ambiguous Outcomes

- `[~]` Vendor redemption now uses explicit request timeouts for the live POS path.
- `[x]` Vendor screen now shows offline and recovery-state banners.
- `[x]` Vendor UI now distinguishes "processing" from "submitted but result unknown".
- `[x]` A pending ambiguous redemption attempt is now persisted in session storage so the operator can return after login and continue recovery.
- `[x]` Session expiry during protected-route redirect now preserves the return path back to the working screen.
- `[x]` Vendor UI now offers a latest-transaction recovery check before encouraging a retry.
- `[ ]` Broader cross-app reconnect handling is still missing outside the vendor flow.

### 3. Backend Consumption Alignment

- `[x]` Frontend auth now follows the backend session-cookie contract instead of assuming bearer-token login.
- `[x]` Frontend restores authenticated state from `/auth/me` after refresh.
- `[x]` Frontend fetches the backend CSRF token and sends `X-CSRF-Token` on state-changing requests.
- `[~]` Backend-consumption alignment is substantially improved, and the backend now normalizes legacy `staff` accounts to `vendor` at the API boundary. Remaining cleanup is mostly internal compatibility residue.

### 4. Role and Scope Alignment

- `[x]` Frontend routing and navigation now use `vendor` as the canonical runtime role.
- `[~]` Repository docs and RBAC guidance are aligned on `vendor`, while the backend still retains `staff` as a legacy storage alias for compatibility.
- `[ ]` Viewer and HR routes described in docs are not represented in the React app.

### 5. Worker and Admin Coverage

- `[x]` Admin can list, create, edit, and delete workers.
- `[~]` Admin now has summary stats, failure and duplicate indicators, failure reasons, failed-attempt hotspots by location, validate and consume endpoint health cards, filtered daily transaction reports, failure-reason-filtered failed-attempt review, report-level transaction-reference visibility with missing-link warnings, department breakdown for the single-day unfiltered view, and a reconciliation drilldown view with transaction-reference linkage visibility plus matched-versus-unresolved failed-attempt follow-up status.
- `[~]` Dashboard behavior and worker admin create, edit, and delete flows now have direct frontend test coverage.
- `[ ]` Admin cannot manage entitlement policy from the React UI.
- `[ ]` There is no worker self-service page in the React app.
- `[x]` A reconciliation page now exists in the React app for vendor-day summary review, date-based refetch, and vendor-location drilldown into confirmed consumptions and failed attempts.

### 6. Quality and Testing

- `[x]` Frontend production build succeeds with Vite.
- `[~]` A frontend Vitest harness now covers protected routes, login routing recovery, dashboard behavior, reconciliation rendering, drilldown, and refetch behavior, reports rendering and filter application, worker admin create or edit or delete flows, QR-token vendor flow, camera scanner behavior, duplicate-submit behavior, and vendor ambiguous-outcome recovery.
- `[ ]` Coverage still does not include broader admin workflows, worker self-service, or richer integration scenarios.
- `[x]` Manual drills are now documented for weak network, dropped responses, session expiry, camera failure, low-end device scan stability, and worker CRUD sanity checks.

## Recommendation

Treat the current frontend as a workable internal MVP shell with a meaningfully safer vendor POS path and a more useful admin operations view, not as a fully validated live canteen frontend. Backend-consumption alignment, camera and token-based QR entry, unknown-outcome handling, session-expiry recovery, richer dashboard indicators including failure reasons, failed-attempt hotspots, and latency or stall visibility, richer report filtering including failure-reason investigation and transaction-reference evidence, and a reconciliation drilldown view with transaction-reference linkage visibility plus matched-versus-unresolved follow-up evidence are materially better now, so the next engineering push should focus on real-device scan validation, broader degraded-network behavior outside the vendor screen, operator-grade duplicate or fraud messaging inside reports, and broader cross-transaction investigation support before claiming service-hour readiness.