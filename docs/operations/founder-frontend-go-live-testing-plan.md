# Founder Frontend Go-Live Testing Plan

Last updated: 2026-03-22

Companion document:

- `docs/operations/founder-frontend-uat-checklist.md` for a short session checklist and scorecard you can use during live founder-led testing.

## What This Plan Is For

This plan is for a non-technical founder who wants to answer one practical question before go-live:

If real people start using this application under pressure, will it feel safe, fast enough, and understandable enough to trust?

This is not a code test plan. It is a business-risk test plan.

## What You Are Really Testing

You are not trying to prove the software is perfect.

You are trying to prove five things:

1. A vendor can serve people quickly without guessing.
2. An admin can notice problems before they become chaos.
3. Slow network or session expiry does not create accidental double serving.
4. The team can recover from common failures without calling an engineer immediately.
5. The product feels trustworthy enough for a controlled go-live.

## Current Honest Position

The frontend is ready for controlled testing now.

That means you can start:

- internal founder testing
- admin and vendor user acceptance testing
- real-device testing on the phones or tablets you expect in the canteen
- controlled pilot testing with supervision

That does not yet mean:

- full public rollout
- unattended live service
- final go-live signoff for peak-hour operations

## Who Should Be In The Room

Run this testing with four people if possible:

1. Founder or operations lead
2. One person acting as vendor
3. One person acting as worker or queue customer
4. One person taking notes and screenshots

If you can only use two people, use:

1. Founder or operations lead
2. One vendor tester

## What You Need Before Starting

Do not start testing until these are available:

1. A working test or staging environment
2. At least one admin account
3. At least one vendor account
4. Sample workers with valid badge numbers
5. At least one QR-capable worker test record
6. Multiple canteen locations in test data
7. At least one known duplicate-attempt scenario
8. One phone or tablet similar to the real canteen device

## Founder Success Rules

Call the test day successful only if all of these are true:

1. A vendor can complete the normal meal flow without asking what to do next.
2. A duplicate or failed attempt does not cause confusion about whether food should be served.
3. A session expiry or weak network event does not silently lose the transaction context.
4. Admin can see failures, locations, and report details without needing database access.
5. No issue discovered would obviously create queue collapse during a lunch rush.

## Founder Stop Rules

Pause go-live planning immediately if any of these happen:

1. The vendor cannot tell whether a meal was actually recorded.
2. The app encourages repeated taps or repeated redemption during slow network.
3. The camera scan path fails on the target device with no safe fallback.
4. Admin cannot investigate failures from the dashboard or reports.
5. The team needs direct database access to answer normal operational questions.

## Suggested 2-Day Test Schedule

### Day 1: Basic Trust And Flow

Goal:

- Confirm the app is understandable and safe in normal use.

Run these tests:

1. Login as admin and confirm dashboard loads.
2. Create, edit, and delete a worker.
3. Open reports and confirm filters work.
4. Open reconciliation and confirm a daily summary appears.
5. Login as vendor and redeem a worker by badge.
6. Repeat with a QR token.
7. If available, repeat with camera scan on a real phone.

Questions to ask after each test:

1. Was the next action obvious?
2. Would a busy operator hesitate here?
3. Would I trust this result if 50 people were waiting?

### Day 2: Failure And Pressure Testing

Goal:

- Confirm the app behaves safely when things go wrong.

Run these tests:

1. Try a duplicate redeem for the same worker.
2. Trigger a weak-network or timeout scenario during redeem.
3. Force a session expiry mid-flow and log back in.
4. Deny camera permission and test fallback behavior.
5. Run several redemptions in sequence on the real device.
6. Review dashboard and reports after the failures.

Questions to ask after each test:

1. Did the app create ambiguity?
2. Would a vendor serve food incorrectly here?
3. Can operations understand what went wrong without engineering help?

## Simple Scorecard

Use this score for each area:

- `Pass`: works clearly and safely
- `Concern`: works, but a real operator may hesitate or make mistakes
- `Fail`: unsafe, confusing, or obviously not ready

Score these areas:

1. Login and access control
2. Vendor badge flow
3. Vendor QR token flow
4. Camera scan on real device
5. Slow network and timeout behavior
6. Duplicate-attempt safety
7. Session-expiry recovery
8. Dashboard usefulness
9. Reports usefulness
10. Reconciliation usefulness

## Decision Framework

Use this rule after testing:

1. `Go for controlled pilot` if there are no fails and only minor concerns.
2. `Fix and retest` if there is even one fail in vendor safety or transaction certainty.
3. `Do not go live` if the real device scan path is unreliable and badge fallback is too slow or confusing.

## What To Capture During Testing

For every issue, write down:

1. What the tester was trying to do
2. What the app showed
3. What the tester believed had happened
4. What actually happened
5. Business risk level: low, medium, or high

High risk means any issue that could:

- cause accidental double serving
- block the queue
- make the operator guess
- hide an operational problem from admins

## Recommended Founder Test Script

Use this short script while observing:

1. Ask the vendor tester to narrate what they think is happening.
2. Do not explain the screen unless they are blocked.
3. Watch for hesitation longer than a few seconds.
4. Watch for repeated clicks, re-reading, or “I’m not sure” moments.
5. Treat confusion as a product bug, not a training problem.

## What Good Looks Like

You should feel comfortable going into a controlled pilot when:

1. Vendors move through the flow without verbal coaching.
2. Failures produce clear next actions.
3. The team can explain any failed attempt from the UI.
4. Real-device scanning is acceptable or the fallback path is obviously workable.
5. You leave the session with a short fix list, not a trust problem.

## What Still Needs Extra Care Before Full Go-Live

Even after this testing plan, treat these as final readiness gaps:

1. more real-device evidence under weak network
2. broader admin coverage beyond the current slices
3. fuller missing-confirmation and cross-transaction investigation support
4. stronger duplicate-pattern and operator-response guidance in reports