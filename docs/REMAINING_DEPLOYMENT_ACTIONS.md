# Material Data Management System (MDMS) — Remaining Pre-Deployment Actions

**Document Version:** 1.0.0  
**Generated Date:** 2026-11-01T23:58:00+05:30  
**Project:** Material Data Management System (MDMS)  
**Location:** `D:\Desktop\MaterialDataManagementSystem`  

---

## 1. Action Items Summary by Status

| Action Item | Category | Status | Assigned Persona | Notes |
| :--- | :--- | :---: | :--- | :--- |
| **Frontend Bundle Chunk Optimization** | Frontend Performance | **Fixed** | Lead Frontend Engineer | Route-level `React.lazy` implemented; bundle dropped from 643 kB to 70 kB. Zero chunk warnings. |
| **Clustered Retention Mutual Exclusion**| Backend Architecture | **Fixed** | DevOps / Backend Engineer | PostgreSQL advisory lock (`SELECT pg_try_advisory_lock`) + PM2 instance 0 check implemented and verified. |
| **Supabase Storage Security Documentation**| Security Review | **Fixed** | Security Engineer | Private bucket architecture documented; flawed `Deny Public Access` SQL policy corrected. |
| **Environment Variable Consistency** | DevOps / Configuration | **Fixed** | DevOps Engineer | `DEPLOYMENT_GUIDE.md` updated with exact variable names, modern key naming, and port 6543 vs 5432 distinction. |
| **Real Browser E2E Automation** | Quality Assurance | **Fixed** | QA Automation Engineer | 17/17 flows verified via Playwright Chrome automation; 0 console errors, 0 network failures. |
| **Test Fixture Inventory & Cleanup Request**| Data Management | **Requires company approval** | Database Administrator | Test users and batches inventoried; awaiting explicit company authorization prior to deletion. |
| **Dev-Only Dependency Vulnerabilities** | Dependency Management | **Unresolved** (Documented Risk) | Security Engineer | `esbuild` and `tinypool` in `devDependencies` do not ship in production builds. Upgrades deferred to avoid breaking changes. |
| **Production Domain & TLS Provisioning** | Infrastructure | **Blocked** | Corporate Infrastructure Team | Requires corporate DNS record assignment (`A`/`CNAME`) and Let's Encrypt / corporate TLS certificates. |

---

## 2. Detailed Status Breakdown

### 2.1 Fixed Actions

#### 1. Frontend Bundle Optimization
- **Problem:** Previous Vite production builds emitted a chunk size warning exceeding 500 kB (`index.js` at 643.29 kB).
- **Resolution:**
  - Configured route-based lazy loading (`React.lazy` and `Suspense`) in `frontend/src/App.tsx` across all 11 page components.
  - Configured custom Rolldown / Vite `manualChunks` function splitting vendor dependencies into `vendor-react` (242 kB), `vendor-supabase` (214 kB), and `vendor-ui` (24 kB).
  - Main application chunk reduced to **70.37 kB** (an **89.1% size reduction**).
  - Production build runs cleanly with zero warnings (`npm --prefix frontend run build`).

#### 2. Clustered Retention Scheduler Concurrency Control
- **Problem:** The proposed PM2 cluster configuration runs 2 backend instances (`instances: 2`). Without concurrency control, both instances would fire hourly retention jobs simultaneously, causing race conditions during batch status transitions and file deletions.
- **Resolution:**
  - Implemented dual-layer protection:
    1. **Process Level:** In `backend/src/server.ts`, retention scheduler initialization evaluates `process.env.NODE_APP_INSTANCE`. Only cluster instance `0` activates the timer; instance `1` runs in pure API worker mode.
    2. **Database Level:** In `backend/src/jobs/retentionJob.ts`, the cron task acquires a non-blocking PostgreSQL advisory lock:
       ```sql
       SELECT pg_try_advisory_lock(882736192) as acquired;
       ```
       If another instance holds the lock, the job logs a skip message and exits immediately. Once completed, `SELECT pg_advisory_unlock(882736192);` releases the lock in a `finally` block.
  - Tested directly against live Supabase PostgreSQL: verified lock acquisition, mutual exclusion, and clean release.

#### 3. Supabase Storage Security Strategy
- **Problem:** The previous deployment guide recommended a SQL policy `CREATE POLICY "Deny Public Access" ON storage.objects FOR ALL TO anon USING (false);`, which could inadvertently interfere with valid pre-signed URL downloads.
- **Resolution:**
  - Verified `material-data` bucket is strictly configured with `public: false` (Private bucket).
  - Direct public requests without tokens are rejected natively by Supabase Storage with HTTP 400/404.
  - All uploads, deletes, and signed URL generation are executed exclusively by the backend Express server using the `SUPABASE_SERVICE_ROLE_KEY`.
  - Updated `DEPLOYMENT_GUIDE.md` to reflect the correct architecture without applying flawed deny policies.

#### 4. Deployment Environment Consistency
- **Problem:** Discrepancies between example environment variables, key naming conventions, and database pooling configurations.
- **Resolution:**
  - Updated `DEPLOYMENT_GUIDE.md` with the exact variables used in the source code:
    - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `FRONTEND_URL`, `BACKEND_URL`, `DATABASE_URL`, `DIRECT_URL`, `ENABLE_RETENTION_SCHEDULER`, etc.
  - Documented modern Supabase key naming (*Publishable key* and *Secret key*) versus legacy terminology (*anon key* and *service role key*).
  - Clarified PostgreSQL connection architecture:
    - Port `6543` with `?pgbouncer=true` for application runtime queries (`DATABASE_URL`).
    - Port `5432` session mode for `prisma migrate deploy` (`DIRECT_URL`).
  - Replaced hardcoded sample domains (`mdms.company.com`) with placeholders (`<company-domain>`).

#### 5. Real Browser End-to-End Automation
- **Problem:** Previous verification reports relied primarily on backend API calls without exercising actual browser UI flows.
- **Resolution:**
  - Implemented and executed Playwright automation (`scratch/runPlaywrightE2E.ts`) driving Google Chrome.
  - Verified 17 complete user workflows:
    - Administrator login and role-based redirect.
    - Worker login and admin route shielding (`Access Denied` on `/settings`).
    - Modal-based creation of Batches, Date Folders, and Products.
    - Multi-category file uploads (6 files across microstructure, graph, PDF, and WhatsApp image).
    - File preview generation.
    - Composite PDF report generation and download trigger.
    - Product ZIP download trigger.
    - Batch closure (initiating 5-day retention timer).
    - External hard disk backup confirmation form submission.
    - Administrator-only cloud deletion approval and storage reclamation.
  - Result: **17 passed, 0 failed, 0 console errors, 0 network failures**.

---

### 2.2 Actions Requiring Company Approval

#### Test Data Inventory & Cleanup Request
During automated QA and integration testing, test fixtures were created in the Supabase database. In accordance with strict operational rules, **no company data was modified or deleted**, and test records remain intact awaiting explicit authorization:

| Data Type | Record Identifier / Name | Database ID | Origin | Recommended Action |
| :--- | :--- | :--- | :--- | :--- |
| **Real User** | `admin@mdms.com` | `b1ee3abc-bfb8-4f14-a323-d49f5be30691` | Production Admin | **PRESERVE (Do Not Delete)** |
| **Real Batch** | `Batch 1 - Week 44` | `e9f27ace-c1ef-4868-a54c-a98507df2c65` | Company Inspections | **PRESERVE (Do Not Delete)** |
| **Test User** | `qa-admin@mdms-test.local` | `92daaa76-f8d4-4ef8-92f3-a4b50b51fa9f` | Automated QA Harness | **Delete upon approval** |
| **Test User** | `qa-worker@mdms-test.local` | `1a20cc14-d047-48af-bce0-ab7e8e9d9efd` | Automated QA Harness | **Delete upon approval** |
| **Test User** | `qa-admin-20085ddc@mdms-test.local` | `61547b26-6c61-4487-a0a6-a9c354297df8` | Automated QA Harness | **Delete upon approval** |
| **Test User** | `qa-worker-20085ddc@mdms-test.local` | `e560a4b8-69b6-4fd8-8e57-21fa753f9017` | Automated QA Harness | **Delete upon approval** |
| **Test Batch** | `QA Batch 20085ddc - Testing` | `c12584d7-f3e2-4d6a-8cf6-1db04ca03a49` | Automated QA Harness | **Delete upon approval** |
| **Test Batch** | `QA Batch 858fe60e - Testing` | `67f49521-80b2-4739-b294-eb4f34880257` | Automated QA Harness | **Delete upon approval** |
| **Test Batch** | `PLAYWRIGHT-BATCH-602372` | `7098cb2d-b0d8-4692-9499-161b0b85ce27` | Playwright E2E Harness | **Delete upon approval** |
| **Test Batch** | `PW-BATCH-798364` | `ade6b090-e15c-41cf-aaf4-56fa08ecff1f` | Playwright E2E Harness | **Delete upon approval** |
| **Test Batch** | `PW-BATCH-419377` | `eaac5f96-5496-423d-bff8-2bc6135fd50c` | Playwright E2E Harness | **Delete upon approval** |

> [!IMPORTANT]
> **Action Required from Company Leadership:**  
> Please confirm whether you authorize the automated purge of the test accounts and test batches listed above. Once approved, a single command (`npx tsx scratch/cleanupTestFixtures.ts`) will safely remove only the test records while strictly preserving `admin@mdms.com` and `Batch 1 - Week 44`.

---

### 2.3 Unresolved / Documented Risks

#### Development-Only Dependency Vulnerabilities
- **Affected Packages:** `esbuild` (`GHSA-67mh-4wv8-2f99`), `tinypool` (`GHSA-v92f-g44h-55w3`), `vite` (`GHSA-955w-7g7x-7945`).
- **Nature of Finding:**
  - `tinypool` is a sub-dependency of `vitest` (used only during local unit test execution).
  - `esbuild` is a sub-dependency of `vite` (used during local `vite dev` development server).
- **Risk Assessment:** **ZERO in Production**. The production server runs compiled JavaScript (`node dist/server.js`) and serves static frontend bundles via Nginx. Neither `vitest`, `tinypool`, nor `esbuild` runs in or is bundled into production.
- **Decision:** In accordance with the project rule ("Do not upgrade major versions unnecessarily"), these development packages are maintained on their stable, working versions rather than forcing major breaking upgrades.

---

### 2.4 Blocked Actions

#### Production Host Domain & TLS Provisioning
- **Current State:** The application is verified on local production-mode ports (`:3001` API and `:5173` / `dist/` web assets).
- **Prerequisite:** Corporate network infrastructure team must provision:
  1. DNS `A` or `CNAME` records pointing `<company-domain>` to the target production server IP.
  2. TLS certificates (Let's Encrypt or corporate internal CA) installed at `/etc/letsencrypt/live/<company-domain>/`.
- **Next Step:** As soon as the corporate host is provisioned, follow Section 6 and Section 7 of [DEPLOYMENT_GUIDE.md](file:///d:/Desktop/MaterialDataManagementSystem/docs/DEPLOYMENT_GUIDE.md) to launch the PM2 service and Nginx reverse proxy.

