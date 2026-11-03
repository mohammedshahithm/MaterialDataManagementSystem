import { Router } from 'express';
import multer from 'multer';
import { config } from '../config';
import { authenticate } from '../middleware/auth';
import { authController } from '../controllers/authController';
import { batchController } from '../controllers/batchController';
import { dateFolderController } from '../controllers/dateFolderController';
import { productController } from '../controllers/productController';
import { fileController } from '../controllers/fileController';
import { pdfController } from '../controllers/pdfController';
import { archiveController } from '../controllers/archiveController';
import { backupController } from '../controllers/backupController';
import { storageController } from '../controllers/storageController';
import { adminController } from '../controllers/adminController';
import { runRetentionCheck } from '../jobs/retentionJob';

const router = Router();

// Startup validation mechanism: intercept route registrations to detect undefined handlers early with clear error messages
const originalRouteMethods = {
  get: router.get.bind(router),
  post: router.post.bind(router),
  patch: router.patch.bind(router),
  delete: router.delete.bind(router),
  use: router.use.bind(router),
};

(['get', 'post', 'patch', 'delete', 'use'] as const).forEach((method) => {
  (router as any)[method] = function (pathOrMiddleware: any, ...handlers: any[]) {
    // If first argument is a middleware function for router.use
    if (typeof pathOrMiddleware !== 'string') {
      if (typeof pathOrMiddleware !== 'function') {
        throw new Error(
          `[STARTUP VALIDATION ERROR] Middleware passed to ${method.toUpperCase()} is ${typeof pathOrMiddleware}! Expected a function.`
        );
      }
    }
    handlers.forEach((fn, idx) => {
      if (typeof fn !== 'function') {
        const pathDesc = typeof pathOrMiddleware === 'string' ? pathOrMiddleware : '[middleware]';
        throw new Error(
          `[STARTUP VALIDATION ERROR] Route handler at index ${idx} for ${method.toUpperCase()} "${pathDesc}" is ${typeof fn}! Expected a function. Check controller imports and method names.`
        );
      }
    });
    return (originalRouteMethods as any)[method](pathOrMiddleware, ...handlers);
  };
});

// Configure multer for in-memory file uploads (max size from config)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.app.maxFileSizeMb * 1024 * 1024 },
});

// ── Public System Endpoints ─────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Scheduled retention check trigger (Vercel Cron / external scheduler)
router.get('/cron/retention', async (req, res, next) => {
  try {
    // Optional Vercel CRON_SECRET verification
    const authHeader = req.headers.authorization;
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized: Invalid CRON_SECRET' });
    }

    await runRetentionCheck();
    return res.json({ status: 'ok', message: 'Retention check completed' });
  } catch (err) {
    next(err);
  }
});

// ── Auth endpoints ───────────────────────────────────────────
router.get('/auth/me', authenticate, authController.me);
router.get('/auth/setup-status', authController.setupStatus);

// All routes are authenticated under Shared Factory Terminal
router.use(authenticate);

// ── Dashboard ────────────────────────────────────────────────
router.get('/dashboard', adminController.getDashboard);

// ── Batches ──────────────────────────────────────────────────
router.post('/batches', batchController.create);
router.get('/batches', batchController.list);
router.get('/batches/:id', batchController.getById);
router.get('/batches/:id/deletion-summary', batchController.getDeletionSummary);
router.patch('/batches/:id', batchController.update);
router.delete('/batches/:id', batchController.delete);

// ── Date Folders ─────────────────────────────────────────────
router.post('/batches/:batchId/dates', dateFolderController.create);
router.get('/batches/:batchId/dates', dateFolderController.listByBatch);
router.get('/dates/:dateId', dateFolderController.getById);
router.delete('/dates/:dateId', dateFolderController.delete);

// ── Products ─────────────────────────────────────────────────
router.post('/dates/:dateId/products', productController.create);
router.get('/dates/:dateId/products', productController.listByDate);
router.get('/products/:productId', productController.getById);
router.patch('/products/:productId', productController.update);
router.delete('/products/:productId', productController.delete);

// ── File Upload & Management ─────────────────────────────────
// Direct signed Supabase upload endpoints (bypasses Vercel 4.5MB request limit)
router.post('/products/:productId/files/request-upload', fileController.requestUpload);
router.post('/products/:productId/files/:fileId/confirm', fileController.confirmUpload);
router.post('/products/:productId/files/:fileId/abort', fileController.abortUpload);

// Legacy upload fallback (multipart/form-data)
router.post('/products/:productId/files/upload', upload.single('file'), fileController.upload);
router.get('/products/:productId/files', fileController.listByProduct);
router.get('/files/:fileId/download-url', fileController.getDownloadUrl);
router.delete('/files/:fileId', fileController.delete);

// ── PDF Generation ───────────────────────────────────────────
router.post('/products/:productId/generate-report', pdfController.generateReport);
router.get('/products/:productId/report', pdfController.getReport);
router.get('/products/:productId/report/download', pdfController.downloadReport);

// ── ZIP Archives ─────────────────────────────────────────────
router.get('/products/:productId/archive', archiveController.productArchive);
router.get('/batches/:batchId/archive', archiveController.batchArchive);

// ── Download Tracking, Storage & Safe Deletion ────────────────
router.get('/backup/batches', backupController.listForBackup);
router.get('/downloads/batches', backupController.listForBackup);
router.get('/downloads/history', backupController.getDownloadHistory);
router.post('/batches/:batchId/backup-confirmation', backupController.confirmBackup);
router.get('/batches/:batchId/backup-status', backupController.getBackupStatus);
router.post('/batches/:batchId/approve-deletion', backupController.approveDeletion);
router.post('/batches/:batchId/retry-deletion', backupController.retryDeletion);

// ── Storage ──────────────────────────────────────────────────
router.get('/storage/summary', storageController.getSummary);

// ── Audit Logs & Settings (Available to all terminal operators)
router.get('/audit-logs', adminController.getAuditLogs);
router.get('/admin/retention-settings', adminController.getRetentionSettings);
router.patch('/admin/retention-settings', adminController.updateRetentionSettings);
router.get('/admin/users', adminController.listUsers);
router.patch('/admin/users/:userId/role', adminController.updateUserRole);

export default router;
