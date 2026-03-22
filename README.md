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

Legacy SQLite backend has been removed. The repository now has a single backend direction.

## Project Structure

- `src/` - backend source (MongoDB)
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
- `QR_TOKEN_SECRET` - HMAC secret used to sign and verify QR validation tokens
- `DUPLICATE_WINDOW_MINUTES` - optional redemption window guard (default `2`) to block near-simultaneous duplicate attempts
- `ADMIN_BOOTSTRAP_PASSWORD` - optional initial admin bootstrap password used only when no admin exists
- `SEED_DEFAULT_PASSWORD` - required by `npm run seed:nonprod` to create non-prod demo users

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

## Fly Deployment (Backend)

Fly config for backend deployment is included:

- `fly.toml`
- `Dockerfile`
- `docs/operations/fly-deployment.md`

Deploy command:

```bash
npm run deploy:fly
```

## Migrations and Seeding

Initialize worker identifiers for legacy records:

```bash
npm run migrate:worker-identifier
```

Seed non-production bootstrap data (requires `SEED_DEFAULT_PASSWORD`):

```bash
npm run seed:nonprod
```

## Security Notes

- The backend is the source of truth for entitlement balances and eligibility checks.
- Client payloads are treated as untrusted hints; eligibility and balance are re-computed server-side before every consume write.
- `SESSION_SECRET` is required outside tests; startup fails fast when it is missing.

## Delivery Guidance

Use the checklists during feature delivery:

- `docs/checklists/backend-enterprise-checklist.md`
- `docs/checklists/frontend-enterprise-checklist.md`
