# Fly.io Backend Deployment

## App

- Fly app: `dangote-cms-backend`
- Config: `fly.toml`
- Runtime: Docker (`Dockerfile`)

## Prerequisites

1. Fly CLI installed and authenticated.
2. Production MongoDB URI available.

## Required Secrets

Set these before first deploy:

```bash
flyctl secrets set SESSION_SECRET=<strong-random-secret> --app dangote-cms-backend
flyctl secrets set QR_TOKEN_SECRET=<strong-random-secret> --app dangote-cms-backend
flyctl secrets set MONGO_URI=<your-production-mongo-uri> --app dangote-cms-backend
flyctl secrets set ADMIN_BOOTSTRAP_PASSWORD=<strong-admin-password> --app dangote-cms-backend
```

Optional:

```bash
flyctl secrets set CORS_ORIGINS=https://<your-frontend-domain> --app dangote-cms-backend
```

## Deploy

```bash
npm run deploy:fly
```

## Verify

```bash
flyctl status --app dangote-cms-backend
flyctl logs --app dangote-cms-backend
flyctl open --app dangote-cms-backend
```

Health checks should return `200` on `/api/health`.

## Post-deploy

Rotate bootstrap/admin credentials after first successful login.
