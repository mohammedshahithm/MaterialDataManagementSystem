# Material Data Management System (MDMS) — Production Deployment Guide

**Version:** 1.1.0  
**Target Environment:** Production  
**Classification:** Operational & DevOps Manual  
**Last Verified:** 2026-11-01  

---

## 1. System Architecture & Prerequisites

The Material Data Management System (MDMS) is a multi-tier manufacturing inspection and material quality data platform. It securely ingests, validates, archives, and generates composite compliance reports for metallurgical test specimens.

```mermaid
flowchart TD
    Client["Shared Factory Terminal Browser (React 18 / Vite SPA)"]
    Proxy["Reverse Proxy (Nginx / Cloudflare)"]
    API["Express API Server (Node.js / TypeScript)"]
    DB[("Supabase PostgreSQL (Prisma ORM)")]
    Storage[("Supabase Storage (Private 'material-data' Bucket)")]
    DownloadLog[("Download Tracking & Audit Logs")]

    Client -->|HTTPS / Port 443| Proxy
    Proxy -->|Static Assets| Client
    Proxy -->|Reverse Proxy /api| API
    API -->|Prisma Client / Port 5432 / 6543| DB
    API -->|Signed REST API / S3 API| Storage
    Storage -->|Direct Streaming / Download| API
    API -->|Log Successful Downloads on finish| DownloadLog
```

### 1.1 Infrastructure Requirements

| Component | Minimum Specification | Recommended Production |
| :--- | :--- | :--- |
| **Node.js Runtime** | Node.js v20.x LTS or v22.x LTS | Node.js v22.x LTS |
| **Server Compute (API)** | 1 vCPU, 2 GB RAM | 2 vCPU, 4 GB RAM |
| **Operating System** | Ubuntu 22.04 LTS / Debian 12 / Windows Server 2022 | Ubuntu 24.04 LTS |
| **Database** | Supabase PostgreSQL v15+ (Prisma ORM) | Supabase PostgreSQL Pro / Dedicated |
| **Cloud Storage** | Supabase Storage (`material-data` private bucket) | Supabase Storage with CDN enabled |
| **Client Terminals** | Standard Factory Workstation or Terminal Browser | Chrome 120+, Edge 120+, Firefox 120+ on Company LAN/VPN |

---

## 2. Environment Variables Reference

Production environments require two isolated configuration contexts: the **Backend Environment** (`backend/.env`) and the **Frontend Environment** (`frontend/.env.production` or `.env.local`).

> [!WARNING]
> Never commit actual `.env` files into version control. Ensure `backend/.env` and `frontend/.env.local` are explicitly listed in `.gitignore`.

### 2.1 Backend Environment Configuration (`backend/.env`)

| Variable Name | Required | Default / Example | Purpose / Security Scope |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Enables Express production optimizations, secure cookies, and optimized logging. |
| `PORT` | Yes | `3001` | TCP port the Express server listens on. |
| `SUPABASE_URL` | Yes | `https://<supabase-project-id>.supabase.co` | Supabase project API endpoint. |
| `SUPABASE_ANON_KEY` | Yes | `eyJhbGciOi...` | Supabase Publishable API Key (client-safe public key). Modern Supabase naming: *Publishable key*. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | `eyJhbGciOi...` | **RESTRICTED**: Supabase Secret API Key (service-role key). Used strictly by the backend for authentication token verification and private storage management. Modern Supabase naming: *Secret key*. |
| `DATABASE_URL` | Yes | `postgresql://postgres.[ref]:[PWD]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true` | PgBouncer pooled connection string on port **6543** with `?pgbouncer=true`. Required for application transactional queries. |
| `DIRECT_URL` | Yes | `postgresql://postgres:[PWD]@db.[ref].supabase.co:5432/postgres` | Direct PostgreSQL connection string on session port **5432**. Required by Prisma CLI for `npx prisma migrate deploy`. |
| `SUPABASE_STORAGE_BUCKET` | Yes | `material-data` | Target private storage bucket name for product inspection files. |
| `FRONTEND_URL` | Yes | `https://<company-domain>` | Allowed CORS origin. Strict single-origin matching in production. |
| `BACKEND_URL` | Yes | `https://<company-domain>/api` | Public base URL used for absolute redirects, download links, or webhooks. |
| `APP_TIMEZONE` | No | `Asia/Kolkata` | Work date and audit timestamp formatting timezone. |
| `RETENTION_DAYS` | No | `5` | Grace period (in days) after batch closure before storage cleanup is flagged. |
| `STORAGE_WARNING_THRESHOLD_GB` | No | `0.8` | Warning threshold (GB) alerting administrators to approaching 1.0 GB Supabase free tier limits. |
| `MAX_FILE_SIZE_MB` | No | `25` | Maximum upload size per file (enforced in Express Multer & stream filters). |
| `SIGNED_URL_EXPIRY_SECONDS` | No | `900` | Expiration lifetime for pre-signed private download URLs (15 minutes). |
| `ENABLE_RETENTION_SCHEDULER` | No | `true` | Toggle for automated background retention scheduler. Set to `true` on primary/scheduler node, `false` on secondary cluster workers. |
| `NO_LOGIN_MODE` | No | `true` | **Internal Mode**: Enables login-free internal factory terminal mode. All direct web accesses open straight to Dashboard without login screens. Defaults to `true`. |
| `ADMIN_SECRET_KEY` | Yes | `AdminSecurityPasscode2026!` | **Security Safeguard**: Secret passcode required to unlock administrative privileges and authorize permanent cloud deletions from shared workstations. |
| `INTERNAL_NETWORK_ONLY` | No | `true` | **Perimeter Firewall**: When enabled, the backend strictly rejects requests originating outside internal RFC1918 private subnets or approved VPNs. Set to `true` in production. |
| `ALLOWED_IPS` | No | `192.168.1.0/24,10.0.0.0/8` | Comma-separated list of additional approved corporate IP subnets or CIDRs allowed when `INTERNAL_NETWORK_ONLY=true`. |

### 2.2 Key Naming Convention Note
- **Legacy Supabase Terminology:** `anon` (anonymous key) and `service_role` (service role key).
- **Modern Supabase Terminology:** *Publishable key* and *Secret key*.
- The MDMS codebase is fully compatible with both nomenclatures. It reads `SUPABASE_ANON_KEY` (Publishable key) and `SUPABASE_SERVICE_ROLE_KEY` (Secret key). Client code uses `VITE_SUPABASE_ANON_KEY`.

### 2.3 PostgreSQL Connection Strategy (Transaction Pooler vs Direct)
Supabase provides two distinct database connection interfaces:
1. **Transaction Pooling (Port 6543 / `DATABASE_URL`):**
   - Connects to PgBouncer.
   - Use this for application runtime query execution to prevent connection exhaustion in serverless or multi-worker deployments.
   - Append `?pgbouncer=true` so Prisma optimizes its internal statement preparation.
2. **Session / Direct Connection (Port 5432 / `DIRECT_URL`):**
   - Direct connection to PostgreSQL without transaction pooling.
   - Required by Prisma schema engine to run `prisma migrate deploy` or administrative DDL operations (which fail under PgBouncer transaction pooling).

### 2.4 Frontend Environment Configuration (`frontend/.env.production`)

| Variable Name | Required | Example | Purpose / Security Scope |
| :--- | :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Yes | `https://<supabase-project-id>.supabase.co` | Client-side Supabase project endpoint. |
| `VITE_SUPABASE_ANON_KEY` | Yes | `eyJhbGciOi...` | Client-side Supabase Publishable Key. |
| `VITE_API_URL` | Yes | `https://<company-domain>/api` | REST API gateway base URL. |

---

## 3. Supabase Cloud Configuration

### 3.1 Authentication Setup
1. Navigate to the **Supabase Dashboard** -> **Authentication** -> **Providers**.
2. Verify **Email** is enabled:
   - Ensure "Allow new users to sign up" is **OFF** if open public registration is prohibited. User accounts in MDMS are created exclusively by authenticated administrators via `/users` or initial setup.
   - Confirm Email Confirmations setting according to company policy.
3. Under **Authentication** -> **URL Configuration**:
   - Set **Site URL** to `https://<company-domain>`.
   - Add `https://<company-domain>/**` to **Redirect URLs**.

### 3.2 Storage Bucket Setup (`material-data`)
1. Navigate to **Storage** -> **New Bucket**.
2. Bucket Name: `material-data`.
3. Set **Public Bucket** to **OFF (Private)**.
4. Set **File size limit** to `25MB`.
5. Under Allowed MIME types, restrict to:
   - `image/jpeg`
   - `image/png`
   - `image/webp`
   - `image/tiff`
   - `application/pdf`
6. Click **Save**.

### 3.3 Storage Access Architecture & Security Review
- **Private Bucket Isolation:** Because `material-data` is marked Private, unauthenticated direct HTTP GET requests to files are rejected by Supabase Storage gateway with 400 Bad Request or 404 Not Found.
- **Backend Service Role Proxy:** All file uploads, deletions, and pre-signed URL generations are performed exclusively by the backend Express server using `SUPABASE_SERVICE_ROLE_KEY`.
- **Shared Terminal Access Control:** All connected users on the approved internal network have full capability to upload files, generate reports, download archives, and perform safe cloud storage cleanup.
- **Short-Lived Signed URLs & Streamed Downloads:** File previews utilize signed tokens with a strict 15-minute expiration (`SIGNED_URL_EXPIRY_SECONDS=900`), while report PDFs and ZIP archives are streamed directly from backend with atomic download logging on socket finish (`res.on('finish')`).
- **Policy Notice:** Do NOT apply blanket `Deny Public Access` SQL policies with `USING (false)` on `storage.objects`, as this can inadvertently block signed URL token validation in certain Supabase gateway versions. Private bucket status natively enforces confidentiality.

### 3.4 Shared Factory Terminal Architecture & Deletion Safeguards

In accordance with explicit client requirements, the system operates as a **Shared Factory Terminal Application** with **NO separation between administrators and workers**. Every person connected to the approved corporate network has full operational functionality across all pages, workflows, and settings.

#### 3.4.1 Dedicated System Terminal Identity
- All terminal operations are automatically and transparently mapped to the permanent **Shared Factory Terminal** identity:
  - **User ID:** `00000000-0000-0000-0000-000000000001`
  - **Email:** `terminal@internal.mdms`
  - **Full Name:** `Shared Factory Terminal`
  - **Role:** `worker` (with unrestricted operational capabilities)
- **Database & Audit Integrity:** Foreign key integrity across PostgreSQL is 100% maintained without requiring nullable foreign keys or risking schema corruption. All batches, date folders, inspection files, and audit events created on the shop floor are honestly attributed to `Shared Factory Terminal`.

#### 3.4.2 Batch Deletion Safeguards (Pure Download Tracking & Retention Mode)
Every visitor connected through the approved company network can initiate permanent cloud storage deletion of eligible batches. To prevent accidental data loss, the following technical safeguards are strictly enforced:
1. **Retention Inactivity Eligibility:** Batches are evaluated dynamically based on their latest activity (latest product creation, file upload, or modification). After 5 days of inactivity, the batch is marked as eligible for deletion with a clear warning in Batch Management. Active batches currently in use by workers do not expire.
2. **Download Status Inspection & Prominent Warning:** The modal inspects whether the Complete Batch ZIP archive has been downloaded. If the batch archive has NOT been downloaded, a prominent warning alerts the operator before proceeding.
3. **No Active Operations:** The backend verifies that no file uploads or report generations are currently in progress (`uploadStatus: 'pending'`).
4. **Complete Information Modal:** The user interface displays full batch metrics (Batch Name, Total Products, Files Count, Storage Size Reclaimed, and Download Status).
5. **Explicit Declaration Checkbox:** The operator must actively check an explicit verification declaration before the deletion button activates.
6. **Cloud Object Deletion & Database Preservation:** Supabase Storage binary files are deleted and verified, `ProductFile.deletedAt` timestamps are set, while all database batch records, date folders, product inspection tests, checklists, and audit entries are preserved.
7. **Partial Failure Retries:** If transient network interruptions occur during storage deletion, batches transition to `partially_deleted` with one-click retry support.
8. **Zero Automated Destructive Deletions:** The background retention job never automatically deletes batches or cloud files; deletion is strictly manual upon confirmation.

#### 3.4.3 Network Perimeter & Access Controls
Because individual login screens are eliminated, perimeter security is strictly enforced:
1. **Hosting Firewall & Nginx Gateway:** Access must be restricted to factory subnets (`192.168.1.0/24`) and corporate VPN ranges (`10.0.0.0/8`).
2. **Application IP Enforcement (`INTERNAL_NETWORK_ONLY=true`):** The Express middleware (`networkSecurity.ts`) validates client IP addresses and rejects external requests with `HTTP 403 Forbidden`.
3. **Private Cloud Storage:** The Supabase Storage bucket (`material-data`) remains completely private; file previews and downloads use temporary pre-signed URLs with strict expirations.

---

## 4. Database Setup & Prisma Migrations

> [!CRITICAL]
> In production environments, **NEVER** run `npx prisma migrate dev` or `npx prisma db push`. Always execute `npx prisma migrate deploy` to safely apply versioned migrations without dropping tables or resetting sequences.

### 4.1 Step-by-Step Database Migration
From the `backend/` directory on the production server:

```bash
# 1. Install dependencies
npm ci --omit=dev

# 2. Generate Prisma Client bindings
npx prisma generate

# 3. Apply pending migrations safely to Supabase PostgreSQL (uses DIRECT_URL on port 5432)
npx prisma migrate deploy

# 4. Verify migration status
npx prisma migrate status
```

### 4.2 Initial Administrator Account Provisioning
If deploying to a fresh database without an administrator:
1. Ensure the backend server is running.
2. The first user registration can be securely initialized using the one-time admin provisioning endpoint:

```bash
curl -X POST https://<company-domain>/api/auth/setup-first-admin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@mdms.com",
    "password": "StrongAdminPassword123!",
    "fullName": "System Administrator",
    "setupSecret": "YOUR_INITIAL_SETUP_SECRET"
  }'
```
3. Once the initial admin is registered, future user invitations (`admin` or `worker`) are conducted exclusively through the **Users Management** dashboard (`/users`) by authenticated administrators.

---

## 5. Production Build & Execution

### 5.1 Backend Compilation & Packaging
Compile the TypeScript source to production JavaScript:

```bash
cd /opt/mdms/backend

# Clean previous build artifacts
rm -rf dist

# Build TypeScript
npm run build

# Verify build output
ls -la dist/server.js
```

### 5.2 Frontend Compilation & Bundling
Compile the React TypeScript application with Vite:

```bash
cd /opt/mdms/frontend

# Build optimized static distribution with route-level code splitting
npm run build

# Output artifacts will be placed in frontend/dist/
ls -la dist/index.html
```

> [!NOTE]
> The frontend production build utilizes `React.lazy` and `Suspense` for all 11 application pages, along with separate vendor chunking (`vendor-react`, `vendor-supabase`, `vendor-ui`). The main application chunk is ~70 kB (well under the 500 kB threshold).

---

## 6. Process Management & Deployment Configurations

### 6.1 Option A: PM2 Process Manager (Recommended for Clustered Node Environments)

Install PM2 globally:
```bash
npm install -g pm2
```

Create `/opt/mdms/ecosystem.config.js`:
```javascript
module.exports = {
  apps: [
    {
      name: 'mdms-backend',
      cwd: '/opt/mdms/backend',
      script: 'dist/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        ENABLE_RETENTION_SCHEDULER: 'true'
      },
      max_memory_restart: '1G',
      exp_backoff_restart_delay: 100,
      error_file: '/var/log/mdms/backend-err.log',
      out_file: '/var/log/mdms/backend-out.log',
      merge_logs: true,
      time: true
    }
  ]
};
```

Start and persist the PM2 service:
```bash
mkdir -p /var/log/mdms
pm2 start /opt/mdms/ecosystem.config.js
pm2 save
pm2 startup
```

### 6.2 Clustered Retention Scheduler & Concurrency Control
When running in PM2 cluster mode (e.g. 2 instances) or across multi-container orchestrations, scheduled retention jobs must not execute redundantly or conflict.

MDMS implements a two-tier concurrency safety model:
1. **Instance Isolation (Process Level):**
   In `backend/src/server.ts`, the cron scheduler evaluates `process.env.NODE_APP_INSTANCE`. In PM2 cluster mode, only instance `0` activates the timer. Secondary instances (`1`, `2`, ...) bypass scheduler initialization.
2. **PostgreSQL Distributed Advisory Lock (Database Level):**
   In `backend/src/jobs/retentionJob.ts`, the job acquires a session-level advisory lock using `pg_try_advisory_lock(882736192)`.
   - If another instance or container holds the lock, the job safely logs a message and aborts immediately.
   - Once completed, the lock is released in a `finally` block using `pg_advisory_unlock(882736192)`.
   - This ensures full idempotency and prevents duplicate database mutations or concurrent file deletions.

### 6.3 Option B: Systemd Service Unit (Linux Enterprise Standard)

Create `/etc/systemd/system/mdms-backend.service`:
```ini
[Unit]
Description=Material Data Management System Backend
After=network.target

[Service]
Type=simple
User=node
WorkingDirectory=/opt/mdms/backend
ExecStart=/usr/bin/node /opt/mdms/backend/dist/server.js
Restart=always
RestartSec=10
EnvironmentFile=/opt/mdms/backend/.env
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=mdms-backend

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable mdms-backend
sudo systemctl start mdms-backend
sudo systemctl status mdms-backend
```

### 6.4 Option C: Docker & Docker Compose

Create `docker-compose.production.yml` in the project root:
```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: mdms-api
    restart: unless-stopped
    ports:
      - "3001:3001"
    env_file:
      - ./backend/.env
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "5"

  web:
    image: nginx:alpine
    container_name: mdms-web
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./frontend/dist:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - backend

### 6.5 Option D: Vercel Multi-Service Deployment (Serverless Architecture)

MDMS is pre-configured for modern Vercel multi-service deployment with an Express Serverless Function backend and a Vite React SPA frontend.

#### Root Configuration (`vercel.json`):
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "services": {
    "backend": {
      "rootDirectory": "backend",
      "framework": "node",
      "entrypoint": "src/server.ts"
    },
    "frontend": {
      "rootDirectory": "frontend",
      "framework": "vite"
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "backend" },
    { "source": "/(.*)", "destination": "frontend" }
  ],
  "crons": [
    {
      "path": "/api/cron/retention",
      "schedule": "0 * * * *"
    }
  ]
}
```

#### Key Serverless Architectural Features:
1. **Serverless Entrypoint Compatibility:**
   - In `backend/src/server.ts`, `app.listen()` is guarded by `if (!process.env.VERCEL)`. Under Vercel, the Express app is exported directly (`export default app`) for serverless function execution.
   - Persistent `node-cron` is disabled in serverless mode.
2. **Automated Vercel Cron Scheduling:**
   - The retention calculation job runs hourly via Vercel Cron at `/api/cron/retention` (`0 * * * *`).
   - Uses PostgreSQL advisory lock (`pg_try_advisory_lock`) to guarantee single execution.
3. **Frontend SPA Catch-All Rewrites:**
   - `frontend/vercel.json` routes all client paths (`/(.*)`) to `/index.html`, preventing 404 errors on browser page reloads.
4. **Production API Base Routing:**
   - `frontend/src/services/api.ts` automatically resolves `API_BASE` to `'/api'` in production, seamlessly routing through Vercel's edge network to the backend service.
5. **Private Network Boundary on Vercel:**
   - Configure **Vercel Deployment Protection / Trusted IPs** in Project Settings -> Security -> IP Allowlist to restrict access to approved factory IP addresses.
```

---

## 7. Nginx Reverse Proxy & SSL Configuration

Create `/etc/nginx/sites-available/<company-domain>`:

```nginx
# Upstream Node.js cluster
upstream mdms_backend_upstream {
    server 127.0.0.1:3001 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

# HTTP Redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name <company-domain>;
    return 301 https://$host$request_uri;
}

# Production HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name <company-domain>;

    # SSL Certificates
    ssl_certificate /etc/letsencrypt/live/<company-domain>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<company-domain>/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co;" always;

    # Client Request & Upload Limits
    client_max_body_size 30M;
    client_body_timeout 120s;
    client_header_timeout 60s;

    # ── PRIVATE NETWORK / VPN ACCESS CONTROL (NO-LOGIN SECURITY) ──
    # Restrict application access exclusively to company intranet and approved VPN subnets:
    allow 192.168.1.0/24;   # Factory & Plant LAN
    allow 10.8.0.0/24;      # Company VPN Subnet
    allow 127.0.0.1;        # Localhost Loopback
    deny all;               # Deny all unrestricted public internet traffic

    # Frontend Static Distribution
    root /opt/mdms/frontend/dist;
    index index.html;

    # Single Page Application (SPA) Fallback
    location / {
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, no-transform";
    }

    # Static Assets Cache
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Backend API Reverse Proxy
    location /api/ {
        proxy_pass http://mdms_backend_upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Buffer and Streaming Optimizations for ZIP/PDF transfers
        proxy_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }

    # Health Check Proxy
    location /health {
        proxy_pass http://mdms_backend_upstream/health;
        access_log off;
    }
}
```

Enable site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/<company-domain> /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 8. Background Jobs & Retention Automation

### 8.1 Automated Cron Lifecycle
The backend includes an integrated cron scheduler (`node-cron`) running in `backend/src/jobs/retentionJob.ts`:
- **Execution Frequency:** Hourly (`0 * * * *`).
- **Core Operations:**
  1. Monitors closed batches that have exceeded `RETENTION_DAYS` (default: 5 days) and logs storage cleanup eligibility.
  2. Purges stale multipart uploads or broken temporary files that have remained pending for >1 hour (`uploadStatus: 'failed'`).
  3. Uses a PostgreSQL distributed advisory lock (`pg_try_advisory_lock(882736192)`) ensuring idempotency across clustered instances.

### 8.2 Verifying Worker Health
Operators can check retention worker execution in real-time:
```bash
# PM2 Logs
pm2 logs mdms-backend --lines 50 | grep -E "(Retention|Cron)"

# Systemd Logs
journalctl -u mdms-backend -n 50 --no-pager | grep -E "(Retention|Cron)"
```

---

## 9. Application Download Tracking & Safe Cloud Storage Management

To preserve the company's 1 GB free Supabase Storage allowance and track worker downloads, the application automatically logs successful file downloads and provides safe batch cleanup:

```mermaid
sequenceDiagram
    autonumber
    actor Terminal as Shared Factory Terminal Operator
    participant UI as MDMS Web Application (Download History & Storage)
    participant API as Express API Server
    participant Storage as Supabase Storage Bucket
    participant Log as Download Logs Table

    Terminal->>UI: Close Batch (All inspections verified)
    UI->>API: POST /api/batches/:id/close
    Note over API: Status -> 'closed'<br/>5-Day Temporary Retention Window Starts

    Terminal->>UI: Download Report PDF / Product ZIP / Batch ZIP
    UI->>API: GET /api/batches/:id/archive (or /products/:id/archive)
    API->>Storage: Stream archive contents
    API-->>Terminal: Complete streamed archive
    Note over API,Log: res.on('finish') triggers atomic download log<br/>Records: type, filename, timestamp, Terminal actor

    Terminal->>UI: Open "Download History & Storage" (/downloads)
    Note over UI: Displays download metrics, batch download status,<br/>and complete download history table

    Terminal->>UI: Click "Delete Cloud Files" on Closed Batch
    UI->>UI: Displays safe deletion modal with storage reclaimed & warnings
    Note over UI: Prominently warns if batch ZIP has NOT been downloaded yet
    Terminal->>UI: Check consent checkbox & confirm deletion
    UI->>API: POST /api/batches/:id/approve-deletion
    API->>Storage: Delete all files in batch folder
    API->>API: Update Status -> 'deleted'<br/>Retain all DB records, test metadata & audit history
    Storage-->>Terminal: Supabase Storage Quota Reclaimed!
```

### Operator Workflow:
1. **Batch Closure:** Close the completed batch to start the 5-day temporary retention countdown.
2. **Download Archive:** In the MDMS web interface under **Download History & Storage**, click **Download Batch ZIP** (or individual product ZIPs/PDFs).
3. **Verify Download Status:** The batch card automatically updates its status to **Downloaded** (green badge) as soon as the download finishes.
4. **Initiate Cloud Cleanup:** When ready to reclaim storage, click **Delete Cloud Files**.
5. **Review Deletion Modal:** Confirm that the Batch ZIP has been downloaded, read the warning, check the explicit consent checkbox, and click **Delete Cloud Files**.
6. **Storage Reclaimed:** Supabase storage space is instantly freed while all inspection test records, checklists, and audit entries remain permanently available.

---

## 10. Health Monitoring, Logging & Disaster Recovery

### 10.1 Monitoring Endpoints
- **Health Check:** `GET https://<company-domain>/health`  
  Returns HTTP 200 with JSON payload:
  ```json
  {
    "status": "ok",
    "timestamp": "2026-11-01T23:50:00.000Z"
  }
  ```

### 10.2 Rollback Procedure
If a production issue occurs following an update:
1. Revert Git repository to the previous tagged release.
2. If database schema was altered:
   - Review migration SQL in `backend/prisma/migrations/`.
   - Apply the corresponding down-migration script manually using `psql`.
3. Re-run `npm run build` in both `backend` and `frontend`.
4. Restart application services (`pm2 restart mdms-backend` or `systemctl restart mdms-backend`).
5. Confirm endpoint health at `/health`.
