# Material Data Management System (MDMS)

An industrial product image management and temporary cloud storage system. Centralizes product-related files (microstructure images, graphs, PDFs, WhatsApp images) into a single, organized platform with backup management and cloud cleanup workflows.

## Architecture

```
MaterialDataManagementSystem/
├── backend/              # Express + Prisma + TypeScript API
│   ├── prisma/           # Database schema & migrations
│   └── src/
│       ├── config/       # Database, Supabase configuration
│       ├── controllers/  # Route handlers for all endpoints
│       ├── jobs/         # Background cron jobs (retention)
│       ├── middleware/    # Auth, error handling
│       ├── routes/       # API route definitions
│       ├── services/     # Audit logging, Supabase Storage service
│       ├── validators/   # Zod request validation schemas
│       └── server.ts     # Express app entry point
├── frontend/             # React + Vite + Tailwind CSS
│   └── src/
│       ├── components/   # Sidebar, AppLayout
│       ├── context/      # AuthContext (Supabase auth)
│       ├── pages/        # All application pages
│       ├── services/     # API client, Supabase client
│       ├── types/        # TypeScript type definitions
│       └── utils/        # Formatting helpers
└── docs/                 # Additional documentation
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS v4 |
| Backend | Node.js + Express + TypeScript |
| Database | Supabase PostgreSQL + Prisma ORM |
| Auth | Supabase Auth (JWT) |
| Object Storage | Supabase Storage (private bucket) |
| PDF Generation | PDFKit + pdf-lib (hybrid approach) |
| ZIP Archives | Archiver |

## Prerequisites

- **Node.js** 18+
- **Supabase** project (PostgreSQL + Auth + Storage)

## Setup

### 1. Clone & Install

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure Environment

```bash
# Backend: copy and fill in
cp .env.example backend/.env

# Frontend: copy and fill in
cp frontend/.env.example frontend/.env.local
```

#### Backend `.env` Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase PostgreSQL connection string (via PgBouncer) |
| `DIRECT_URL` | Supabase PostgreSQL direct connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (backend only — never expose) |
| `SUPABASE_STORAGE_BUCKET` | Storage bucket name (default: `material-data`) |
| `PORT` | Backend port (default: 3001) |
| `FRONTEND_URL` | Frontend URL for CORS (default: http://localhost:5173) |
| `APP_TIMEZONE` | Application timezone (default: Asia/Kolkata) |
| `RETENTION_DAYS` | Days before backup is due after batch closure (default: 5) |
| `APP_STORAGE_WARNING_GB` | Storage warning threshold in GB (default: 8) |
| `MAX_FILE_SIZE_MB` | Max upload file size in MB (default: 25) |
| `SIGNED_URL_EXPIRY_SECONDS` | Signed download URL lifetime (default: 900) |

#### Frontend `.env.local` Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Same Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Same Supabase anon key |
| `VITE_API_URL` | Backend API URL (default: http://localhost:3001/api) |

### 3. Supabase Storage Setup

1. Go to your Supabase dashboard → **Storage**
2. Create a **private** bucket named `material-data`
3. No additional RLS policies are needed — the backend uses the **service role key** for all storage operations
4. Files are never accessed directly by the browser; the backend generates short-lived **signed URLs** for downloads

### 4. Database Setup

```bash
cd backend
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Run

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

Frontend: http://localhost:5173
Backend: http://localhost:3001

## Key Features

### Product Management
- **Batch → Date → Product** hierarchy
- Each product has 4 required file categories (+ optional 3rd microstructure)
- Per-product completion checklist and progress tracking

### File Uploads
- Backend-proxied upload flow (browser → backend → Supabase Storage)
- Upload progress tracking per file slot
- File preview, replace, and delete
- Secure access via short-lived signed download URLs

### PDF Report Generation
- Cover page with product metadata
- Microstructure images page (1-3 images, auto-layout)
- Graph image page
- WhatsApp image page
- Appended original source PDF pages
- Automatic outdated detection when source files change

### Backup & Deletion Workflow
1. **Batch closed** → retention timer starts (configurable days)
2. **Backup due** → download batch ZIP archive
3. **Backup confirmed** → worker records disk identifier, path, notes
4. **Deletion approved** (admin only) → Supabase Storage files permanently deleted
5. **Partial failure retry** → re-attempt any failed deletions

### Cloud Storage Monitoring
- Application-calculated storage estimates
- Configurable warning thresholds
- Per-batch storage breakdown

### Admin Features
- Dashboard with 8 summary statistics
- User role management (admin/worker)
- Audit log viewer with pagination
- Configurable retention and upload settings

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard` | Dashboard summary |
| POST | `/api/batches` | Create batch |
| GET | `/api/batches` | List batches |
| GET | `/api/batches/:id` | Get batch detail |
| PATCH | `/api/batches/:id` | Update batch |
| POST | `/api/batches/:id/close` | Close batch |
| DELETE | `/api/batches/:id` | Delete batch (admin) |
| POST | `/api/batches/:batchId/dates` | Create date folder |
| GET | `/api/batches/:batchId/dates` | List date folders |
| GET | `/api/dates/:dateId` | Get date folder detail |
| POST | `/api/dates/:dateId/products` | Create product |
| GET | `/api/dates/:dateId/products` | List products |
| GET | `/api/products/:productId` | Get product detail |
| POST | `/api/products/:productId/files/upload` | Upload file (multipart/form-data) |
| GET | `/api/products/:productId/files` | List files |
| GET | `/api/files/:fileId/download-url` | Get signed download URL |
| DELETE | `/api/files/:fileId` | Delete file |
| POST | `/api/products/:productId/generate-report` | Generate PDF report |
| GET | `/api/products/:productId/report` | Get report info |
| GET | `/api/products/:productId/report/download` | Download report |
| GET | `/api/products/:productId/archive` | Download product ZIP |
| GET | `/api/batches/:batchId/archive` | Download batch ZIP |
| GET | `/api/backup/batches` | List batches for backup |
| POST | `/api/batches/:batchId/backup-confirmation` | Confirm backup |
| POST | `/api/batches/:batchId/approve-deletion` | Approve deletion (admin) |
| POST | `/api/batches/:batchId/retry-deletion` | Retry failed deletions (admin) |
| GET | `/api/storage/summary` | Storage summary |
| GET | `/api/audit-logs` | Audit logs (admin) |
| GET/PATCH | `/api/admin/retention-settings` | Retention settings (admin) |
| GET | `/api/admin/users` | List users (admin) |
| PATCH | `/api/admin/users/:userId/role` | Update user role (admin) |

## Security

- All API routes require Supabase JWT authentication
- Admin-only endpoints enforced via `requireAdmin` middleware
- Rate limiting (200 req/15min general, 20 req/15min auth)
- Helmet security headers
- CORS restricted to frontend URL
- File size limits enforced (configurable, default 25 MB)
- Supabase service role key used only on the backend — never exposed to frontend
- Private storage bucket — all downloads via short-lived signed URLs
- Comprehensive audit logging

## Background Jobs

- **Retention check** (hourly): Transitions batch status from `closed` → `backup_due` → `backup_overdue`
- **Stale upload cleanup**: Marks pending uploads older than 1 hour as failed
