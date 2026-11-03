# Material Data Management System (MDMS) — Remaining Pre-Deployment Actions

**Document Version:** 2.0.0 (Shared Factory Terminal — Vercel Multi-Service & Final Launch Checklist)  
**Generated Date:** 2026-11-02T21:07:00+05:30  
**Project:** Material Data Management System (MDMS)  
**Location:** `D:\Desktop\MaterialDataManagementSystem`  
**Deployment Target:** Vercel Multi-Service (Express Serverless API + Vite React SPA)  

---

## 1. Executive Summary & Action Status

All code, configuration, builds, and automated tests for the Material Data Management System are **100% complete and verified**. The application is ready to be launched to production.

The table below outlines the actionable steps remaining before final DNS cutover:

| Action Item | Category | Status | Assigned Persona | Description / Notes |
| :--- | :--- | :---: | :--- | :--- |
| **Vercel Project Setup** | DevOps | **Pending User Action** | DevOps Engineer | Push repository to Git (GitHub/GitLab) and import project into Vercel. |
| **Vercel Environment Variables** | Configuration | **Pending User Action** | DevOps / System Admin | Configure required backend & frontend environment variables in Vercel project settings. |
| **Vercel Cron Verification** | Background Scheduling | **Ready** | DevOps Engineer | Verify `/api/cron/retention` appears under Project Settings -> Cron Jobs (runs `0 * * * *`). |
| **Supabase IP & Network Whitelist** | Database Security | **Pending User Action** | Database Administrator | Ensure Supabase database allows connections from Vercel Serverless Functions. |
| **Corporate Domain & DNS Cutover** | Infrastructure | **Pending User Action** | Corporate IT / Network Admin | Add DNS records (`CNAME` / `A`) pointing company domain to Vercel edge network. |
| **Factory Network Access Restriction** | Network Perimeter | **Pending User Action** | Network Administrator | Configure Vercel IP Allowlist or corporate firewall so only approved factory devices access the system. |
| **Post-Launch Smoke Test** | Quality Assurance | **Ready to Execute** | QA Lead / Factory Supervisor | Execute 5-minute production verification checklist on live factory domain. |

---

## 2. Step-by-Step Pre-Launch Execution Checklist

### Step 1: Push Code to Git Repository
Push the complete repository to your organization's Git provider (GitHub, GitLab, or Bitbucket):
```bash
git add .
git commit -m "feat: complete MDMS final QA, batch zip enhancement, and Vercel configuration"
git push origin main
```
> [!NOTE]
> `.vercelignore` and `.gitignore` ensure `.env`, test scratch directories, and logs are excluded from version control.

---

### Step 2: Import into Vercel as Multi-Service Project
1. Log into the **Vercel Dashboard**.
2. Click **Add New** -> **Project**.
3. Select the `MaterialDataManagementSystem` repository.
4. Vercel automatically detects the root `vercel.json` and configures the two services:
   - **backend:** Root `backend/`, entrypoint `src/server.ts`
   - **frontend:** Root `frontend/`, framework `vite`
5. Do NOT click Deploy yet; proceed to Step 3 to add Environment Variables.

---

### Step 3: Configure Environment Variables in Vercel
Under **Project Settings** -> **Environment Variables**, configure the following variables for the **Production** environment:

| Variable Name | Service Scope | Recommended Value / Notes |
| :--- | :---: | :--- |
| `NODE_ENV` | Backend | `production` |
| `DATABASE_URL` | Backend | `postgresql://postgres.[ref]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | Backend | `postgresql://postgres:[PASSWORD]@db.[ref].supabase.co:5432/postgres` |
| `SUPABASE_URL` | Backend & Frontend | `https://[project-id].supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend | `[Secret service_role key]` |
| `SUPABASE_ANON_KEY` | Backend & Frontend | `[Publishable anon key]` |
| `SUPABASE_STORAGE_BUCKET` | Backend | `material-data` |
| `JWT_SECRET` | Backend | `[Secure random 64-character secret]` |
| `ALLOWED_ORIGIN` | Backend | `https://[your-company-domain.com]` (or `*` for internal network) |
| `CRON_SECRET` | Backend | `[Secure random string for Vercel Cron authentication]` |
| `RETENTION_DAYS` | Backend | `5` |
| `MAX_FILE_SIZE_MB` | Backend | `25` |

---

### Step 4: Verify Vercel Cron Scheduling
1. Once deployed, open **Settings** -> **Cron Jobs**.
2. Confirm the hourly retention check is active:
   - **Path:** `/api/cron/retention`
   - **Schedule:** `0 * * * *` (hourly at minute 0)
3. This endpoint runs the inactivity retention evaluation with PostgreSQL distributed locking (`pg_try_advisory_lock`), guaranteeing safe single execution without destructive automated deletions.

---

### Step 5: Enforce Factory Network Perimeter
Because the application runs in **Shared Factory Terminal Mode** without individual login screens:
1. Open **Vercel Project Settings** -> **Security** -> **Deployment Protection**.
2. Enable **IP Allowlist** (Trusted IPs).
3. Add your company's approved factory subnets and VPN IP addresses (e.g., `192.168.1.0/24`, corporate static IP).
4. Any device outside the approved network will be blocked at the edge with HTTP 403.

---

### Step 6: Configure Custom Factory Domain & DNS
1. Under **Settings** -> **Domains**, add your company domain (e.g. `mdms.company.com`).
2. Add the required DNS record in your DNS provider:
   - **Type:** `CNAME`
   - **Name:** `mdms`
   - **Value:** `cname.vercel-dns.com`
3. Vercel will automatically issue and renew a free Let's Encrypt TLS certificate.

---

### Step 7: Post-Launch Production Smoke Test (5 Minutes)
Upon DNS propagation, perform the following quick manual verification on the live URL:
1. **Direct Navigation:** Open `https://mdms.company.com` — verify the Dashboard loads immediately without any login or signup prompt.
2. **Batch Management:** Navigate to `/batches` — verify batches display active status with 0 lock icons.
3. **Batch ZIP Download:** Click "Download Batch ZIP" on an existing batch — verify the ZIP downloads and extracts cleanly with the `Batch-Name/Date-YYYY-MM-DD/Product-001/Microstructure/...` structure.
4. **Product Progress Checklist:** Open a product — verify the 9-item checklist displays without any external hard disk backup requirements.
5. **Download History & Storage:** Open `/storage` — verify download logs record the downloaded ZIP archive with the "Shared Factory Terminal" identity.
