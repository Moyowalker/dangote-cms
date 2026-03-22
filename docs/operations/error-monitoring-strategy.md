# Error Monitoring Strategy

## Objective

Capture backend failures with enough context to triage incidents quickly and support root-cause analysis.

## Strategy

1. Emit structured JSON error events from the backend process.
2. Include source context (`startup.database`, `process.unhandledRejection`, route context where available).
3. Ship logs to your monitoring stack (for example: CloudWatch, Datadog, ELK, or Azure Monitor).
4. Alert on error-rate spikes and on process-level crashes.

## Implemented Hooks

- `src/services/errorMonitoringService.js` provides `reportError` for consistent event formatting.
- `src/server.js` reports:
  - unhandled promise rejections
  - uncaught exceptions
  - startup connection failures

## Recommended Alerts

- `>= 5` process-level errors in 5 minutes
- readiness endpoint returning non-ready for more than 2 minutes
- sudden increase in `ticket.consume` failure outcomes (>20% failure rate over 15 minutes)
