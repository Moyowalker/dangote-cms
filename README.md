# Dangote Canteen Management System (CMS)

A web-based Canteen Management Application that digitizes meal ticketing for Dangote's canteen operations.

## Features

- **Authentication**: JWT-based auth with role-based access control (admin, hr, vendor)
- **Worker Management**: Add, edit, deactivate workers with meal plan configuration
- **Meal Ticketing**: Issue individual or batch meal tickets with UUID ticket codes
- **Vendor Redemption**: Vendors scan/enter ticket codes to redeem meals
- **Reports & Analytics**: Daily consumption reports, worker meal history, summary stats
- **Audit Trail**: Complete transaction history for all redemptions

## Tech Stack

- **Backend**: Node.js + Express + SQLite (better-sqlite3) + JWT + bcryptjs
- **Frontend**: React + Vite + React Router + Axios
- **Testing**: Jest + supertest

## Setup & Running

### Backend
```
cd backend
npm install
npm start        # Runs on port 3001
```

### Frontend
```
cd frontend
npm install
npm run dev      # Runs on port 3000
```

### Running Tests
```
cd backend
npm test
```

## Default Credentials

| Username | Password   | Role   |
|----------|------------|--------|
| admin    | Admin@123  | Admin  |
| vendor1  | Vendor@123 | Vendor |
| hr1      | Hr@123456  | HR     |

## API Documentation

### Authentication
- POST /api/auth/login — Login, returns JWT token
- POST /api/auth/logout — Logout

### Workers (admin/hr only)
- GET /api/workers — List workers
- POST /api/workers — Create worker
- GET /api/workers/:id — Get worker
- PUT /api/workers/:id — Update worker
- DELETE /api/workers/:id — Deactivate worker

### Tickets
- POST /api/tickets/issue — Issue single ticket
- POST /api/tickets/batch-issue — Batch issue tickets
- GET /api/tickets — List tickets
- GET /api/tickets/:id — Get ticket

### Vendors
- POST /api/vendors/redeem — Redeem ticket by code
- GET /api/vendors/transactions — Today's transactions

### Reports (admin/hr only)
- GET /api/reports/daily?date=YYYY-MM-DD — Daily meal counts
- GET /api/reports/worker/:id — Worker meal history
- GET /api/reports/summary — Overall stats

## Notes
- The test database is separate from the production database (canteen_test.db vs canteen.db)
- Default admin credentials: admin / Admin@123
- JWT tokens expire after 8 hours
- Soft deletes are used for workers (active=0 instead of deletion)
