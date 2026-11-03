import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { createBatchSchema, updateBatchSchema } from '../validators';
import { logAudit } from '../services/auditService';
import { AppError } from '../middleware/errorHandler';
import { config } from '../config';
import { storageService } from '../services/storageService';
import { getRuntimeSettings } from '../services/settingsService';
import { evaluateBatchRetention } from '../services/retentionService';

export const batchController = {
  /** Create a new batch */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = createBatchSchema.parse(req.body);
      const userId = req.user!.id;

      const batch = await prisma.batch.create({
        data: {
          batchName: data.batchName,
          description: data.description,
          createdById: userId,
        },
        include: { createdBy: { select: { fullName: true, email: true } } },
      });

      await logAudit(userId, 'CREATE_BATCH', 'batch', batch.id, { batchName: data.batchName });

      return res.status(201).json(batch);
    } catch (err) {
      next(err);
    }
  },

  /** List all batches */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = req.query;
      const runtime = await getRuntimeSettings();
      const retentionDays = runtime.retentionDays || 5;

      const batches = await prisma.batch.findMany({
        where: status ? { status: status as any } : { status: { not: 'deleted' } },
        include: {
          createdBy: { select: { fullName: true } },
          dateFolders: {
            include: {
              products: {
                include: {
                  files: {
                    select: {
                      fileSize: true,
                      category: true,
                      uploadedAt: true,
                      deletedAt: true,
                      uploadStatus: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Compute summary stats and retention eligibility for each batch
      const enriched = batches.map((batch) => {
        let totalProducts = 0;
        let completedProducts = 0;
        let totalStorage = BigInt(0);

        batch.dateFolders.forEach((df) => {
          df.products.forEach((product) => {
            totalProducts++;
            const activeFiles = product.files.filter(
              (f) => !f.deletedAt && f.uploadStatus === 'confirmed'
            );
            const cats = new Set(activeFiles.map((f) => f.category));
            if (
              cats.has('microstructure') &&
              cats.has('graph') &&
              cats.has('source_pdf') &&
              cats.has('whatsapp_image')
            ) {
              completedProducts++;
            }
            activeFiles.forEach((f) => {
              totalStorage += f.fileSize;
            });
          });
        });

        const retention = evaluateBatchRetention(batch, retentionDays);

        return {
          id: batch.id,
          batchName: batch.batchName,
          description: batch.description,
          createdBy: batch.createdBy.fullName,
          createdAt: batch.createdAt,
          closedAt: batch.closedAt,
          status: batch.status,
          backupDueAt: batch.backupDueAt,
          lastActivityAt: retention.lastActivityAt.toISOString(),
          retentionDueAt: retention.retentionDueAt.toISOString(),
          isEligibleForDeletion: retention.isEligibleForDeletion,
          inactivityDays: retention.inactivityDays,
          retentionDays: retention.retentionDays,
          totalDateFolders: batch.dateFolders.length,
          totalProducts,
          completedProducts,
          storageUsed: totalStorage.toString(),
          backupStatus: null,
        };
      });

      return res.json(enriched);
    } catch (err) {
      next(err);
    }
  },

  /** Get a single batch with details */
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const runtime = await getRuntimeSettings();
      const retentionDays = runtime.retentionDays || 5;

      const batch = await prisma.batch.findUnique({
        where: { id },
        include: {
          createdBy: { select: { fullName: true, email: true } },
          dateFolders: {
            orderBy: { workDate: 'desc' },
            include: {
              createdBy: { select: { fullName: true } },
              products: {
                include: {
                  files: {
                    select: {
                      id: true,
                      category: true,
                      fileSize: true,
                      uploadedAt: true,
                      deletedAt: true,
                      uploadStatus: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!batch) {
        throw new AppError('Batch not found', 404);
      }

      const retention = evaluateBatchRetention(batch, retentionDays);

      return res.json({
        ...batch,
        backupRecords: [],
        lastActivityAt: retention.lastActivityAt.toISOString(),
        retentionDueAt: retention.retentionDueAt.toISOString(),
        isEligibleForDeletion: retention.isEligibleForDeletion,
        inactivityDays: retention.inactivityDays,
        retentionDays: retention.retentionDays,
      });
    } catch (err) {
      next(err);
    }
  },

  /** Update batch name/description */
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = updateBatchSchema.parse(req.body);
      const userId = req.user!.id;

      const batch = await prisma.batch.update({
        where: { id },
        data: {
          ...(data.batchName && { batchName: data.batchName }),
          ...(data.description !== undefined && { description: data.description }),
        },
      });

      await logAudit(userId, 'UPDATE_BATCH', 'batch', id, data);

      return res.json(batch);
    } catch (err) {
      next(err);
    }
  },

  /** Get deletion summary including product count, file count, storage used, and download history */
  async getDeletionSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const runtime = await getRuntimeSettings();
      const retentionDays = runtime.retentionDays || 5;

      const batch = await prisma.batch.findUnique({
        where: { id },
        include: {
          dateFolders: {
            include: {
              products: {
                include: {
                  files: {
                    select: {
                      id: true,
                      fileSize: true,
                      originalFilename: true,
                      category: true,
                      uploadedAt: true,
                      deletedAt: true,
                      uploadStatus: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!batch) throw new AppError('Batch not found', 404);

      const retention = evaluateBatchRetention(batch, retentionDays);

      let totalProducts = 0;
      let totalFiles = 0;
      let totalStorage = BigInt(0);
      const productIds: string[] = [];

      batch.dateFolders.forEach((df) => {
        df.products.forEach((p) => {
          totalProducts++;
          productIds.push(p.id);
          const activeFiles = p.files.filter((f) => !f.deletedAt && f.uploadStatus === 'confirmed');
          activeFiles.forEach((f) => {
            totalFiles++;
            totalStorage += f.fileSize;
          });
        });
      });

      // Fetch download logs for this batch and its products
      const downloadLogs = await prisma.downloadLog.findMany({
        where: {
          OR: [
            { batchId: id },
            { productId: { in: productIds } },
          ],
        },
        include: {
          downloadedBy: { select: { fullName: true } },
          product: { select: { productName: true, productCode: true } },
        },
        orderBy: { downloadedAt: 'desc' },
      });

      const formattedDownloads = downloadLogs.map((dl) => ({
        id: dl.id,
        downloadType: dl.downloadType,
        filename: dl.filename || undefined,
        downloadedAt: dl.downloadedAt.toISOString(),
        downloadedBy: dl.downloadedBy.fullName,
        productName: dl.product?.productName,
        productCode: dl.product?.productCode,
      }));

      const batchZipDownloaded = downloadLogs.some((dl) => dl.downloadType === 'batch_zip');
      const productZipsDownloadedCount = new Set(
        downloadLogs.filter((dl) => dl.downloadType === 'product_zip' && dl.productId).map((dl) => dl.productId)
      ).size;
      const reportsDownloadedCount = new Set(
        downloadLogs.filter((dl) => (dl.downloadType === 'pdf' || dl.downloadType === 'report_pdf') && dl.productId).map((dl) => dl.productId)
      ).size;

      return res.json({
        batchId: batch.id,
        batchName: batch.batchName,
        lastActivityAt: retention.lastActivityAt.toISOString(),
        retentionDueAt: retention.retentionDueAt.toISOString(),
        isEligibleForDeletion: retention.isEligibleForDeletion,
        inactivityDays: retention.inactivityDays,
        retentionDays: retention.retentionDays,
        totalDateFolders: batch.dateFolders.length,
        totalProducts,
        totalFiles,
        storageUsed: totalStorage.toString(),
        downloadHistory: formattedDownloads,
        hasDownloads: downloadLogs.length > 0,
        batchZipDownloaded,
        productZipsDownloadedCount,
        reportsDownloadedCount,
      });
    } catch (err) {
      next(err);
    }
  },

  /** Delete a batch — safely removes Supabase Storage objects, soft-deletes files, marks batch deleted, preserves audit history */
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const batch = await prisma.batch.findUnique({
        where: { id },
        include: {
          dateFolders: {
            include: {
              products: {
                include: {
                  files: {
                    where: { deletedAt: null },
                    select: { id: true, storageKey: true, uploadStatus: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!batch) throw new AppError('Batch not found', 404);
      if (batch.status === 'deleted') throw new AppError('Batch has already been deleted', 400);

      // Check active pending uploads within the last hour; mark older stale uploads as failed
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      await prisma.productFile.updateMany({
        where: {
          product: { dateFolder: { batchId: id } },
          uploadStatus: 'pending',
          uploadedAt: { lt: oneHourAgo },
        },
        data: { uploadStatus: 'failed' },
      });

      const pendingFiles = await prisma.productFile.findFirst({
        where: {
          product: { dateFolder: { batchId: id } },
          deletedAt: null,
          uploadStatus: 'pending',
          uploadedAt: { gte: oneHourAgo },
        },
      });
      if (pendingFiles) {
        throw new AppError('Cannot delete batch while file operations are in progress', 400);
      }

      // Collect all active files
      const allFiles = batch.dateFolders.flatMap((df) =>
        df.products.flatMap((p) => p.files)
      );

      // Delete files from Supabase Storage
      if (allFiles.length > 0) {
        const keys = allFiles.map((f) => f.storageKey);
        await storageService.deleteFiles(keys);
      }

      // Soft delete files in database
      const now = new Date();
      const fileIds = allFiles.map((f) => f.id);
      if (fileIds.length > 0) {
        await prisma.productFile.updateMany({
          where: { id: { in: fileIds } },
          data: { deletedAt: now },
        });
      }

      // Mark batch as deleted
      await prisma.batch.update({
        where: { id },
        data: { status: 'deleted' },
      });

      await logAudit(userId, 'DELETE_BATCH', 'batch', id, {
        batchName: batch.batchName,
        filesDeleted: fileIds.length,
      });

      return res.json({ message: 'Batch deleted successfully', filesDeleted: fileIds.length });
    } catch (err) {
      next(err);
    }
  },
};
