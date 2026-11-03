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
| **Dynamic Retention & Manual Deletion** | Compliance | **Verified** | QA / System Admin | Retention eligibility is evaluated dynamically in real time (5 days inactive). Batches are never automatically deleted; manual deletion requires explicit confirmation. |
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
| `NODE_ENV` | Backend | `production` (automatically set by Vercel) |
| `DATABASE_URL` | Backend | `postgresql://postgres.[ref]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | Backend | `postgresql://postgres.[ref]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres` |
| `SUPABASE_URL` | Backend | `https://[project-id].supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend | `[Secret service_role key]` (bypasses RLS for storage management) |
| `SUPABASE_ANON_KEY` | Backend | `[Publishable anon key]` |
| `SUPABASE_STORAGE_BUCKET` | Backend | `material-data` (default) |
| `FRONTEND_URL` | Backend | `https://[your-company-domain.com]` (allowed CORS origin) |
| `RETENTION_DAYS` | Backend | `5` |
| `MAX_FILE_SIZE_MB` | Backend | `25` |
| `SIGNED_URL_EXPIRY_SECONDS` | Backend | `900` |
| `NO_LOGIN_MODE` | Backend | `true` |
| `VITE_API_URL` | Frontend | Leave blank or `/api` (uses relative path via Vercel rewrites) |
| `VITE_SUPABASE_URL` | Frontend | `https://[project-id].supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Frontend | `[Publishable anon key]` |

---

### Step 4: Verify Dynamic Retention & Manual Deletion
1. MDMS calculates retention eligibility dynamically in real-time whenever batches are viewed.
2. Inactive batches (no new products or files for 5 days) display an amber "Eligible for Deletion" badge in the UI.
3. The system **NEVER automatically deletes batches or cloud files**.
4. Operators manually delete eligible batches through the explicit confirmation dialog, which preserves all download history and audit logs.
5. No Vercel cron jobs or external schedulers are configured, ensuring 100% compatibility with both Vercel Hobby and Pro plans.

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
