# Founder Frontend UAT Checklist

Last updated: 2026-03-22

Use this during a live founder-led testing session.

This is the short version of the full plan in `docs/operations/founder-frontend-go-live-testing-plan.md`.

## Session Setup

Testing goal:

- Confirm the frontend is safe enough for a controlled pilot.

People in the room:

- Founder or operations lead
- One vendor tester
- One person acting as worker
- One note taker

Minimum starting conditions:

- Test or staging environment is working
- One admin account exists
- One vendor account exists
- Test workers with valid badge numbers exist
- At least one QR-capable test worker exists
- Multiple canteen locations exist in test data
- At least one duplicate-attempt scenario can be triggered
- One real phone or tablet similar to the canteen device is available

Score each item as:

- `Pass`
- `Concern`
- `Fail`

## Day 1 Checklist

### Admin Checks

- [ ] Admin can log in without confusion
- [ ] Dashboard loads and key numbers are visible
- [ ] Worker can be created
- [ ] Worker can be edited
- [ ] Worker can be deleted
- [ ] Reports page opens and filters can be used
- [ ] Reconciliation page opens and shows a daily summary

Notes:

- Was the next step obvious?
- Did any screen feel slow or unclear?

### Vendor Normal Flow Checks

- [ ] Vendor can log in and reach the vendor screen
- [ ] Badge lookup works for a valid worker
- [ ] Redeem works for a valid worker by badge
- [ ] QR token path works
- [ ] Camera scan works on the real target device, if available
- [ ] Success result is clear enough that the vendor knows food can be served

Notes:

- Did the vendor hesitate?
- Would this feel safe with a long queue behind them?

## Day 2 Checklist

### Failure And Recovery Checks

- [ ] Duplicate redeem attempt is blocked clearly
- [ ] Vendor can tell whether the duplicate was rejected
- [ ] Slow network or timeout does not create ambiguity
- [ ] Vendor is not encouraged to tap repeatedly during slow responses
- [ ] Session expiry mid-flow can be recovered without losing context
- [ ] Camera permission denial has a safe fallback
- [ ] If camera scan fails, badge or QR paste fallback is still usable

Notes:

- Did the app create any moment where the vendor had to guess?
- Did any failure make it unclear whether a meal had already been recorded?

### Operations Visibility Checks

- [ ] Dashboard helps identify failures quickly
- [ ] Reports help explain failed attempts
- [ ] Reconciliation gives enough daily summary to spot issues
- [ ] Team can investigate problems without direct database access

Notes:

- Could operations answer normal questions from the UI alone?
- Would an issue here force an engineer to intervene immediately?

## Stop Rules

Pause go-live planning immediately if any of these happen:

- [ ] Vendor cannot tell whether a meal was recorded
- [ ] App encourages repeated redemption during slow network
- [ ] Camera path fails on the target device and fallback is not workable
- [ ] Admin cannot investigate failures from dashboard or reports
- [ ] Team needs database access to answer normal operational questions

## Final Scorecard

Mark one result for each area:

| Area | Pass | Concern | Fail | Notes |
| --- | --- | --- | --- | --- |
| Login and access control | [ ] | [ ] | [ ] | |
| Vendor badge flow | [ ] | [ ] | [ ] | |
| Vendor QR token flow | [ ] | [ ] | [ ] | |
| Camera scan on real device | [ ] | [ ] | [ ] | |
| Slow network and timeout behavior | [ ] | [ ] | [ ] | |
| Duplicate-attempt safety | [ ] | [ ] | [ ] | |
| Session-expiry recovery | [ ] | [ ] | [ ] | |
| Dashboard usefulness | [ ] | [ ] | [ ] | |
| Reports usefulness | [ ] | [ ] | [ ] | |
| Reconciliation usefulness | [ ] | [ ] | [ ] | |

## Decision

- [ ] Go for controlled pilot
- [ ] Fix and retest before pilot
- [ ] Do not go live

Decision rule:

- Use `Go for controlled pilot` only if there are no fails and only minor concerns.
- Use `Fix and retest` if there is any fail around vendor certainty, duplicate safety, timeout ambiguity, or session recovery.
- Use `Do not go live` if the target-device scan path is unreliable and the fallback path is too slow or too confusing.

## Issue Capture

For each issue, record:

- What the tester was trying to do
- What the app showed
- What the tester believed had happened
- What actually happened
- Business risk: `low`, `medium`, or `high`

Treat these as `high` risk:

- Anything that could cause double serving
- Anything that blocks the queue badly
- Anything that makes the vendor guess
- Anything that hides operational problems from admins