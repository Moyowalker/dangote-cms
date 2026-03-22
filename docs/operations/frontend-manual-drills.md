# Frontend Manual Drills

Last updated: 2026-03-22

Use these drills before any canteen go-live or high-risk frontend release. The goal is to verify that the operator can still make safe decisions when the network is unstable, the session expires, or the camera path fails.

## Test Phase Position

The frontend is ready for controlled testing now.

Use the current build for:

- Internal QA
- Admin and vendor UAT
- Real-device validation on target phones or tablets
- Controlled pilot observation with fallback support available

Do not use the current build as evidence of full live-canteen readiness yet. The remaining gaps are recorded weak-network evidence from real devices, broader admin coverage beyond the current slices, and fuller missing-confirmation investigation support.

## Drill Execution Record

Capture the following for each drill run:

- Date and environment
- Device model and browser version
- Network condition used
- User role tested
- Scenario outcome: pass or fail
- Notes on operator confusion, delay, or unsafe ambiguity
- Linked screenshots or screen recordings if available

## 1. Dropped Response During Redeem

Purpose:

- Verify that a meal submission which times out or loses connectivity does not force the vendor to guess.

Steps:

1. Log in as a vendor and open the vendor interface.
2. Validate a worker using badge lookup or QR flow.
3. Trigger a redeem request and interrupt the network before the response completes.
4. Restore connectivity.
5. Use the latest-transaction recovery action instead of retrying immediately.

Expected result:

- The UI shows an unknown transaction state instead of a silent reset.
- The pending attempt survives until the operator resolves it.
- The latest-transaction lookup either confirms the meal or tells the operator not to retry immediately.

## 2. Session Expiry Mid-Flow

Purpose:

- Verify that losing auth during active work does not destroy the transaction context.

Steps:

1. Log in as a vendor and begin a validation or redemption flow.
2. Expire the session from the backend or clear the session cookie.
3. Trigger the next authenticated request.
4. Log back in when redirected.

Expected result:

- The app returns the operator to the protected route they were using.
- A pending ambiguous attempt is still available for recovery.
- The operator is not forced to re-enter state blindly.

## 3. Camera Unsupported Or Permission Denied

Purpose:

- Verify that the camera path fails safely and the operator has a clear fallback.

Steps:

1. Open the vendor interface and switch to QR mode.
2. Attempt camera scan in a browser without `BarcodeDetector` support or deny camera permission.
3. Repeat on a supported browser and revoke permission when prompted.

Expected result:

- The scanner shows a clear failure message.
- The operator can retry the camera.
- The operator can switch to QR token paste or badge lookup without refreshing the page.

## 4. Low-End Device Scan Stability

Purpose:

- Verify whether the camera scan UX is usable on the actual phone or tablet class expected in the canteen.

Steps:

1. Test on the lowest-spec supported Android device.
2. Scan multiple worker QR codes in sequence under normal indoor lighting.
3. Repeat with a dim screen and with moderate glare.
4. Repeat with a damaged or partially obstructed QR display.

Expected result:

- Camera startup is fast enough not to block queue flow.
- Operators can align the code using the scan frame without guesswork.
- Failure to scan leads cleanly to retry or fallback, not confusion.

## 5. Weak Network Recovery

Purpose:

- Verify the vendor experience under slow but not fully disconnected conditions.

Steps:

1. Throttle the browser network to a slow mobile profile.
2. Validate and redeem several workers in sequence.
3. Observe loading, timeout, and recovery messages.

Expected result:

- Buttons do not invite duplicate taps while a request is active.
- Operators can distinguish processing from timeout or failure.
- Recovery guidance remains explicit under slow responses.

## 6. Admin Worker CRUD Sanity Check

Purpose:

- Verify that the worker admin flows remain usable after frontend changes.

Steps:

1. Log in as an admin.
2. Create a worker.
3. Edit the worker department and status.
4. Delete the worker.

Expected result:

- Each action completes without leaving the UI in a stale state.
- The table refreshes correctly after each mutation.
- Error handling is specific enough for an admin to recover or escalate.

## Suggested First Test Batch

If testing starts today, run these first:

1. Login and route recovery after session expiry.
2. Vendor badge redeem happy path.
3. Vendor duplicate redeem and unknown-outcome recovery.
4. QR token validation and camera fallback behavior.
5. Dashboard, reports, and reconciliation smoke checks.
6. Worker create, edit, and delete sanity check.