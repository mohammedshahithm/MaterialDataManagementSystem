import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { storageService } from '../services/storageService';
import { backupConfirmationSchema } from '../validators';
import { logAudit } from '../services/auditService';
import { AppError } from '../middleware/errorHandler';

export const backupController = {
  /** Confirm backup for a batch */
  async confirmBackup(req: Request, res: Response, next: NextFunction) {
    try {
      const { batchId } = req.params;
      const data = backupConfirmationSchema.parse(req.body);
      const userId = req.user!.id;

      const batch = await prisma.batch.findUnique({ where: { id: batchId } });
      if (!batch) throw new AppError('Batch not found', 404);
      if (batch.status === 'deleted') {
        throw new AppError('Cannot confirm backup for a deleted batch', 400);
      }

      const record = await prisma.backupRecord.create({
        data: {
          batchId,
          confirmedById: userId,
          diskIdentifier: data.diskIdentifier,
          destinationPath: data.destinationPath,
          archiveFilename: data.archiveFilename,
          archiveChecksum: data.archiveChecksum,
          notes: data.notes,
          status: 'confirmed',
        },
      });

      await prisma.batch.update({
        where: { id: batchId },
        data: { status: 'backup_confirmed' },
      });

      await logAudit(userId, 'CONFIRM_BACKUP', 'batch', batchId, {
        diskIdentifier: data.diskIdentifier,
        recordId: record.id,
      });

      return res.status(201).json(record);
    } catch (err) {
      next(err);
    }
  },

  /** Get backup status for a batch */
  async getBackupStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { batchId } = req.params;

      const batch = await prisma.batch.findUnique({
        where: { id: batchId },
        include: {
          backupRecords: {
            orderBy: { confirmedAt: 'desc' },
            include: { confirmedBy: { select: { fullName: true } } },
          },
        },
      });

      if (!batch) throw new AppError('Batch not found', 404);

      // Count files and storage
      const files = await prisma.productFile.findMany({
        where: {
          product: { dateFolder: { batchId } },
          deletedAt: null,
          uploadStatus: 'confirmed',
        },
        select: { fileSize: true },
      });

      const totalFiles = files.length;
      const totalStorage = files.reduce((acc, f) => acc + f.fileSize, BigInt(0));

      return res.json({
        batchId: batch.id,
        batchName: batch.batchName,
        status: batch.status,
        closedAt: batch.closedAt,
        retentionStartedAt: batch.retentionStartedAt,
        backupDueAt: batch.backupDueAt,
        totalFiles,
        totalStorage: totalStorage.toString(),
        backupRecords: batch.backupRecords.map((r) => ({
          ...r,
          confirmedBy: r.confirmedBy.fullName,
        })),
      });
    } catch (err) {
      next(err);
    }
  },

  /** Safe cloud deletion for closed batches (available to all shared terminal operators) */
  async approveDeletion(req: Request, res: Response, next: NextFunction) {
    try {
      const { batchId } = req.params;
      const userId = req.user!.id;

      const batch = await prisma.batch.findUnique({
        where: { id: batchId },
      });

      if (!batch) throw new AppError('Batch not found', 404);
      if (batch.status === 'deleted') {
        throw new AppError('Batch files have already been deleted from cloud storage', 400);
      }

      // Prevent deletion if any file upload or report generation is currently active in the last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      await prisma.productFile.updateMany({
        where: {
          product: { dateFolder: { batchId } },
          uploadStatus: 'pending',
          uploadedAt: { lt: oneHourAgo },
        },
        data: { uploadStatus: 'failed' },
      });

      const pendingFiles = await prisma.productFile.findFirst({
        where: {
          product: { dateFolder: { batchId } },
          deletedAt: null,
          uploadStatus: 'pending',
          uploadedAt: { gte: oneHourAgo },
        },
      });
      if (pendingFiles) {
        throw new AppError('Cannot delete batch while file operations are in progress', 400);
      }

      // Get all active file storage keys
      const files = await prisma.productFile.findMany({
        where: {
          product: { dateFolder: { batchId } },
          deletedAt: null,
          uploadStatus: 'confirmed',
        },
        select: { id: true, storageKey: true },
      });

      if (files.length === 0) {
        await prisma.batch.update({
          where: { id: batchId },
          data: { status: 'deleted' },
        });
        return res.json({ message: 'No files to delete. Batch marked as deleted.', deleted: 0, errors: 0 });
      }

      // Batch delete from Supabase Storage
      const keys = files.map((f) => f.storageKey);
      const result = await storageService.deleteFiles(keys);

      // Mark successfully deleted files
      const deletedKeys = new Set(result.deleted);
      const now = new Date();

      for (const file of files) {
        if (deletedKeys.has(file.storageKey)) {
          await prisma.productFile.update({
            where: { id: file.id },
            data: { deletedAt: now },
          });
        }
      }

      // Update batch status
      if (result.errors.length === 0) {
        await prisma.batch.update({
          where: { id: batchId },
          data: { status: 'deleted' },
        });
      } else {
        await prisma.batch.update({
          where: { id: batchId },
          data: { status: 'partially_deleted' },
        });
      }

      await logAudit(userId, 'APPROVE_DELETION', 'batch', batchId, {
        deletedCount: result.deleted.length,
        errorCount: result.errors.length,
        errors: result.errors.slice(0, 10), // Log first 10 errors
      });

      return res.json({
        message: result.errors.length === 0
          ? 'All cloud files deleted successfully'
          : 'Some files could not be deleted',
        deleted: result.deleted.length,
        errors: result.errors.length,
        failedKeys: result.errors.map((e) => e.key),
      });
    } catch (err) {
      next(err);
    }
  },

  /** Retry failed deletions */
  async retryDeletion(req: Request, res: Response, next: NextFunction) {
    try {
      const { batchId } = req.params;
      const userId = req.user!.id;

      const batch = await prisma.batch.findUnique({ where: { id: batchId } });
      if (!batch) throw new AppError('Batch not found', 404);
      if (batch.status !== 'partially_deleted') {
        throw new AppError('Only partially deleted batches can be retried');
      }

      // Find remaining un-deleted files
      const remainingFiles = await prisma.productFile.findMany({
        where: {
          product: { dateFolder: { batchId } },
          deletedAt: null,
          uploadStatus: 'confirmed',
        },
        select: { id: true, storageKey: true },
      });

      if (remainingFiles.length === 0) {
        await prisma.batch.update({
          where: { id: batchId },
          data: { status: 'deleted' },
        });
        return res.json({ message: 'No remaining files. Batch marked as deleted.' });
      }

      const keys = remainingFiles.map((f) => f.storageKey);
      const result = await storageService.deleteFiles(keys);

      const deletedKeys = new Set(result.deleted);
      const now = new Date();

      for (const file of remainingFiles) {
        if (deletedKeys.has(file.storageKey)) {
          await prisma.productFile.update({
            where: { id: file.id },
            data: { deletedAt: now },
          });
        }
      }

      if (result.errors.length === 0) {
        await prisma.batch.update({
          where: { id: batchId },
          data: { status: 'deleted' },
        });
      }

      await logAudit(userId, 'RETRY_DELETION', 'batch', batchId, {
        deletedCount: result.deleted.length,
        errorCount: result.errors.length,
      });

      return res.json({
        message: result.errors.length === 0
          ? 'All remaining files deleted'
          : 'Some files still could not be deleted',
        deleted: result.deleted.length,
        remaining: result.errors.length,
      });
    } catch (err) {
      next(err);
    }
  },

  /** List batches for download tracking, storage monitoring, and safe deletion */
  async listForBackup(req: Request, res: Response, next: NextFunction) {
    try {
      const batches = await prisma.batch.findMany({
        where: {
          status: {
            in: ['active', 'closed', 'backup_due', 'backup_overdue', 'backup_confirmed', 'deletion_approved', 'partially_deleted', 'deleted'],
          },
        },
        include: {
          createdBy: { select: { fullName: true } },
          dateFolders: {
            include: {
              products: {
                select: { id: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Enrich with download tracking metrics and storage counts
      const enriched = await Promise.all(
        batches.map(async (batch) => {
          const productIds = batch.dateFolders.flatMap((df) => df.products.map((p) => p.id));
          const totalProducts = productIds.length;

          const fileAgg = await prisma.productFile.aggregate({
            where: {
              product: { dateFolder: { batchId: batch.id } },
              deletedAt: null,
              uploadStatus: 'confirmed',
            },
            _count: true,
            _sum: { fileSize: true },
          });

          // Count generated reports
          const reportsGeneratedCount = totalProducts > 0
            ? await prisma.productFile.count({
                where: {
                  productId: { in: productIds },
                  category: 'generated_report',
                  uploadStatus: 'confirmed',
                  isLatest: true,
                  deletedAt: null,
                },
              })
            : 0;

          // Count distinct products whose PDF report has been downloaded
          const reportsDownloaded = totalProducts > 0
            ? await prisma.downloadLog.findMany({
                where: {
                  productId: { in: productIds },
                  downloadType: { in: ['report_pdf', 'pdf'] },
                },
                select: { productId: true },
                distinct: ['productId'],
              })
            : [];
          const reportsDownloadedCount = reportsDownloaded.length;

          // Count distinct products whose ZIP archive has been downloaded
          const productZipsDownloaded = totalProducts > 0
            ? await prisma.downloadLog.findMany({
                where: {
                  productId: { in: productIds },
                  downloadType: 'product_zip',
                },
                select: { productId: true },
                distinct: ['productId'],
              })
            : [];
          const productZipsDownloadedCount = productZipsDownloaded.length;

          // Check if complete batch ZIP archive has been downloaded
          const batchZipCount = await prisma.downloadLog.count({
            where: {
              batchId: batch.id,
              downloadType: 'batch_zip',
            },
          });
          const batchZipDownloaded = batchZipCount > 0;

          // Determine download status
          let downloadStatus: 'not_downloaded' | 'partially_downloaded' | 'downloaded' = 'not_downloaded';
          if (
            batchZipDownloaded ||
            (totalProducts > 0 &&
              reportsGeneratedCount === totalProducts &&
              reportsDownloadedCount === totalProducts &&
              productZipsDownloadedCount === totalProducts)
          ) {
            downloadStatus = 'downloaded';
          } else if (
            reportsDownloadedCount > 0 ||
            productZipsDownloadedCount > 0 ||
            batchZipDownloaded
          ) {
            downloadStatus = 'partially_downloaded';
          }

          return {
            id: batch.id,
            batchName: batch.batchName,
            status: batch.status,
            createdAt: batch.createdAt,
            closedAt: batch.closedAt,
            retentionStartedAt: batch.retentionStartedAt,
            backupDueAt: batch.backupDueAt,
            createdBy: batch.createdBy.fullName,
            totalFiles: fileAgg._count,
            totalStorage: (fileAgg._sum.fileSize || BigInt(0)).toString(),
            totalProducts,
            reportsGeneratedCount,
            reportsDownloadedCount,
            productZipsDownloadedCount,
            batchZipDownloaded,
            downloadStatus,
            latestBackup: null,
          };
        })
      );

      return res.json(enriched);
    } catch (err) {
      next(err);
    }
  },

  /** Get system download history log */
  async getDownloadHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const logs = await prisma.downloadLog.findMany({
        orderBy: { downloadedAt: 'desc' },
        take: 100,
        include: {
          product: {
            select: {
              productCode: true,
              productName: true,
              dateFolder: {
                select: {
                  batch: { select: { batchName: true } },
                },
              },
            },
          },
          batch: { select: { batchName: true } },
          downloadedBy: { select: { fullName: true } },
        },
      });

      const formatted = logs.map((log) => ({
        id: log.id,
        downloadType: log.downloadType,
        filename: log.filename,
        downloadedAt: log.downloadedAt,
        actor: log.downloadedBy.fullName || 'Shared Factory Terminal',
        batchName: log.batch?.batchName || log.product?.dateFolder.batch.batchName || '—',
        productCode: log.product?.productCode || null,
      }));

      return res.json(formatted);
    } catch (err) {
      next(err);
    }
  },
};
