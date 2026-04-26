# Dangote Canteen Management System (CMS)

Web-based canteen management platform for digitized meal operations.

## Canonical Architecture

- Backend: Node.js + Express + MongoDB (Mongoose)
- Frontend: React + Vite + React Router + Axios
- Auth model: Session-based auth with role checks

## RBAC Role Matrix

- `admin`: full CRUD, policy management, reporting, reconciliation, and operational endpoints
- `vendor`: ticket validation and consumption workflows
- `viewer`: read-only reporting, reconciliation, and dashboard indicators
- `hr` (optional): read-only reporting access (same as viewer)

Legacy compatibility note: persisted `staff` users are normalized to `vendor` at the backend API boundary so frontend clients and current documentation consume a single canonical vendor role.

New user writes are also canonicalized to `vendor`, so legacy `staff` is now a read-compatibility concern rather than an actively written role for current backend flows.

Meal records are now on a safe migration path from legacy `staff_id` to canonical `vendor_user_id`: current writes populate both fields, reads prefer the new field and fall back to the old one, and historical rows can be backfilled with `npm run migrate:vendor-operator-field`.

Set `LEGACY_STAFF_ID_FALLBACK_ENABLED=false` only after strict migration verification passes to stop writing legacy `staff_id` and stop reading staff-only historical rows.

Legacy SQLite backend has been removed. The repository now has a single backend direction.

## Project Structure

- `src/` - backend source (MongoDB)
- `src/public/` - legacy static admin UI retained as an optional compatibility surface
- `frontend/` - React/Vite frontend
- `tests/` - backend tests
- `docs/checklists/` - enterprise delivery checklists

## Setup

1. Install root dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

3. Start backend (default port 3001):

```bash
npm start
```

4. Start frontend:

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

- `SESSION_SECRET` - required secret for session signing
- `MONGO_URI` - MongoDB connection string
- `PORT` - backend port (default `3001`)
- `CORS_ORIGINS` - optional comma-separated allowlist of frontend origins (example: `http://localhost:5173,https://cms.example.com`)
- `SESSION_COOKIE_SAME_SITE` - optional session cookie SameSite policy (`strict`, `lax`, or `none`; use `none` for split-domain deployments like Netlify + Render)
- `CSRF_COOKIE_SAME_SITE` - optional CSRF cookie SameSite policy (`strict`, `lax`, or `none`; defaults to `SESSION_COOKIE_SAME_SITE`)
- `LEGACY_STAFF_ID_FALLBACK_ENABLED` - optional temporary migration flag for the `staff_id` to `vendor_user_id` cutover (defaults to `true`; set to `false` only after strict migration verification passes)
- `LEGACY_STATIC_UI_ENABLED` - optional toggle for serving the legacy static HTML UI from `src/public` (defaults to `true`; set to `false` to disable it)
- `QR_TOKEN_SECRET` - HMAC secret used to sign and verify QR validation tokens
- `DUPLICATE_WINDOW_MINUTES` - optional redemption window guard (default `2`) to block near-simultaneous duplicate attempts
- `ADMIN_BOOTSTRAP_PASSWORD` - optional initial admin bootstrap password used only when no admin exists
- `ADMIN_RESET_PASSWORD_ON_START` - optional recovery flag; when `true` and `ADMIN_BOOTSTRAP_PASSWORD` is set, resets the existing `admin` user's password on startup
- `SEED_DEFAULT_PASSWORD` - required by `npm run seed:nonprod` to create non-prod demo users
- `DEMO_USERS_RESET_PASSWORDS_ON_START` - optional recovery/bootstrap flag; when `true` and `SEED_DEFAULT_PASSWORD` is set, creates or resets `vendor.demo`, `viewer.demo`, `hr.demo`, and `employee.demo` on startup

### Frontend Env

- `VITE_API_BASE_URL` - frontend API base URL (default `/api`, example production value: `https://your-backend.onrender.com/api`)

## Deployment

### Backend on Render

1. Create a new Render Web Service from this repository.
2. Use `render.yaml` in repo root for baseline configuration.
3. In Render dashboard, set required secrets:
	- `MONGO_URI`
	- `CORS_ORIGINS` (include your Netlify frontend URL)
4. Keep cookie vars for split-domain setup:
	- `SESSION_COOKIE_SAME_SITE=none`
	- `CSRF_COOKIE_SAME_SITE=none`
5. Deploy and confirm health at `/api/health`.

### Frontend on Netlify

1. Create a new Netlify site from this repository.
2. Netlify uses `netlify.toml` with:
	- base: `frontend`
	- build command: `npm ci && npm run build`
	- publish dir: `dist`
3. Set Netlify environment variable:
	- `VITE_API_BASE_URL=https://<your-render-service>.onrender.com/api`
4. Redeploy frontend.

### Post-Deploy Checklist

1. Login works from Netlify frontend.
2. API requests include credentials and succeed.
3. No CORS errors in browser console.
4. Render logs show healthy startup and MongoDB connection.

## Current API Surface (Mongo Backend)

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Employees

- `GET /api/employees`
- `POST /api/employees`
- `GET /api/employees/:id`
- `PUT /api/employees/:id`
- `DELETE /api/employees/:id`

### Meal Management

- `GET /api/meal-plans`
- `POST /api/meal-plans`
- `PUT /api/meal-plans/:id`
- `DELETE /api/meal-plans/:id`
- `GET /api/menu-items`
- `POST /api/menu-items`
- `PUT /api/menu-items/:id`
- `DELETE /api/menu-items/:id`

### Ticket/Consumption Flow

- `GET /api/tickets/validate/:badge_number`
- `POST /api/tickets/validate-token`
- `POST /api/tickets/consume`
- `POST /api/tickets/qr-token`
- `GET /api/tickets/history`

### Reporting and Dashboard

- `GET /api/reports/daily`
- `GET /api/reports/failures`
- `GET /api/reports/department`
- `GET /api/reports/employee/:id`
- `GET /api/reconciliation/vendor-daily`
- `GET /api/dashboard/stats`
- `GET /api/dashboard/indicators`

### Operations

- `GET /api/health`
- `GET /api/readiness`

## API Examples

List-style endpoints support optional pagination via `page` and `limit` query params.

Behavior:

- Without `page`/`limit`, endpoints return legacy unpaginated payloads for backward compatibility.
- With `page` and/or `limit`, endpoints include a `pagination` object and return a sliced result set.

### Example: Employees (Paginated)

Request:

```http
GET /api/employees?page=1&limit=20
```

Response:

```json
{
	"data": [
		{
			"_id": "65f0c1a2b3c4d5e6f7012345",
			"employee_number": "EMP001",
			"name": "Jane Doe",
			"department": "Operations",
			"badge_number": "B-1001",
			"status": "active"
		}
	],
	"pagination": {
		"page": 1,
		"limit": 20,
		"total": 125,
		"totalPages": 7,
		"hasNextPage": true,
		"hasPrevPage": false
	}
}
```

### Example: Ticket History (Paginated)

Request:

```http
GET /api/tickets/history?date=2026-03-21&page=1&limit=50
```

Response:

```json
{
	"tickets": [
		{
			"_id": "65f0c1a2b3c4d5e6f7099999",
			"employee_id": "65f0c1a2b3c4d5e6f7012345",
			"meal_type": "lunch",
			"status": "used",
			"used_at": "2026-03-21T12:05:00.000Z"
		}
	],
	"pagination": {
		"page": 1,
		"limit": 50,
		"total": 389,
		"totalPages": 8,
		"hasNextPage": true,
		"hasPrevPage": false
	}
}
```

### Example: QR Token Issue and Validate

Issue request:

```http
POST /api/tickets/qr-token
Content-Type: application/json

{
	"badge_number": "B-1001",
	"ttl_seconds": 600
}
```

Validate request:

```http
POST /api/tickets/validate-token
Content-Type: application/json

{
	"token": "<signed-token>",
	"meal_type": "lunch",
	"canteen_location": "Main Canteen"
}
```

### Example: Daily Report Details (Paginated)

Request:

```http
GET /api/reports/daily?date=2026-03-21&page=2&limit=25
```

Response:

```json
{
	"date": "2026-03-21",
	"total": 512,
	"details": [
		{
			"employee_number": "EMP245",
			"name": "John Smith",
			"department": "Engineering",
			"meal_type": "breakfast",
			"timestamp": "2026-03-21T08:10:00.000Z"
		}
	],
	"pagination": {
		"page": 2,
		"limit": 25,
		"total": 512,
		"totalPages": 21,
		"hasNextPage": true,
		"hasPrevPage": true
	}
}
```

### Example: Reconciliation Vendor Summary (Paginated)

Request:

```http
GET /api/reconciliation/vendor-daily?date=2026-03-21&page=1&limit=10
```

Response:

```json
{
	"date": "2026-03-21",
	"summary": [
		{
			"vendor": "Main Kitchen",
			"served_count": 143,
			"expected_count": 140,
			"discrepancy": 3,
			"status": "mismatch"
		}
	],
	"pagination": {
		"page": 1,
		"limit": 10,
		"total": 4,
		"totalPages": 1,
		"hasNextPage": false,
		"hasPrevPage": false
	}
}
```

## Tests

Run backend tests from repository root:

```bash
npm test
```

## Deployment Notes

Application deployment remains supported through repository scripts and infrastructure config, but environment-specific runbooks and secret-handling procedures are intentionally kept outside the public codebase.

## Migrations and Seeding

Initialize worker identifiers for legacy records:

```bash
npm run migrate:worker-identifier
```

Backfill canonical vendor operator ids from legacy meal record rows:

```bash
npm run migrate:vendor-operator-field
```

Verify whether the meal record vendor operator migration is complete:

```bash
npm run verify:vendor-operator-field
```

Use strict verification to fail the command when any legacy-only or mismatched rows remain:

```bash
npm run verify:vendor-operator-field -- --strict
```

Seed non-production bootstrap data (requires `SEED_DEFAULT_PASSWORD`):

```bash
npm run seed:nonprod
```

Recommended rollout for the `staff_id` to `vendor_user_id` transition:

1. Deploy code that dual-writes both fields and reads either field.
2. Run `npm run migrate:vendor-operator-field` against the target database.
3. Run `npm run verify:vendor-operator-field -- --strict` until it passes cleanly.
4. Set `LEGACY_STAFF_ID_FALLBACK_ENABLED=false` in the target environment.
5. Only then remove legacy read fallbacks and drop `staff_id` in a later migration.

## Security Notes

- The backend is the source of truth for entitlement balances and eligibility checks.
- Client payloads are treated as untrusted hints; eligibility and balance are re-computed server-side before every consume write.
- `SESSION_SECRET` is required outside tests; startup fails fast when it is missing.

## Delivery Guidance

Use the checklists during feature delivery:

- `docs/checklists/backend-enterprise-checklist.md`
- `docs/checklists/frontend-enterprise-checklist.md`

For founder-led pre-go-live testing, use:

- `docs/operations/founder-frontend-go-live-testing-plan.md`
