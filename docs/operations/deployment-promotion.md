# Deployment Promotion Strategy

## Workflow

Use GitHub Actions workflow `.github/workflows/deploy-promotion.yml` for controlled environment promotion.

## Promotion Gates

1. Tests must pass in the `verify` job before promotion.
2. Promotion target must be explicitly chosen (`staging` or `production`).
3. GitHub Environment protections should enforce reviewers and secret scopes per environment.

## Environment Expectations

- `staging`: validation environment for release candidates.
- `production`: live environment after staging validation and approval.

## Required Secrets (per environment)

- `SESSION_SECRET`
- `MONGO_URI`
- `QR_TOKEN_SECRET`
