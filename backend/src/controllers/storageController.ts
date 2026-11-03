import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { config } from '../config';
import { getRuntimeSettings } from '../services/settingsService';
import { AppError } from '../middleware/errorHandler';

export const storageController = {
  /** Get storage summary */
  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      // Passive maintenance: asynchronously mark abandoned pending uploads older than 1 hour as failed
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      prisma.productFile
        .updateMany({
          where: {
            uploadStatus: 'pending',
            uploadedAt: { lt: oneHourAgo },
          },
          data: { uploadStatus: 'failed' },
        })
        .catch(() => {});

      const [activeFiles, batches, failedUploads, pendingDeletions, runtimeSettings] = await Promise.all([
        prisma.productFile.aggregate({
          where: { deletedAt: null, uploadStatus: 'confirmed' },
          _count: true,
          _sum: { fileSize: true },
        }),
        prisma.batch.findMany({
          where: { status: { not: 'deleted' } },
          select: {
            id: true,
            batchName: true,
            status: true,
            backupDueAt: true,
            dateFolders: {
              select: {
                products: {
                  select: {
                    files: {
                      where: { deletedAt: null, uploadStatus: 'confirmed' },
                      select: { fileSize: true },
                    },
                  },
                },
              },
            },
          },
        }),
        prisma.productFile.count({
          where: { uploadStatus: 'failed' },
        }),
        prisma.batch.count({
          where: { status: { in: ['partially_deleted'] } },
        }),
        getRuntimeSettings(),
      ]);

      const batchStorage = batches.map((b) => {
        let totalSize = BigInt(0);
        let fileCount = 0;
        b.dateFolders.forEach((df) => {
          df.products.forEach((p) => {
            p.files.forEach((f) => {
              totalSize += f.fileSize;
              fileCount++;
            });
          });
        });
        return {
          batchId: b.id,
          batchName: b.batchName,
          status: b.status,
          backupDueAt: b.backupDueAt,
          fileCount,
          storageUsed: totalSize.toString(),
        };
      });

      const totalBytes = activeFiles._sum.fileSize || BigInt(0);
      const totalGb = Number(totalBytes) / (1024 * 1024 * 1024);
      const warningThreshold = runtimeSettings.storageWarningGb;

      return res.json({
        totalFiles: activeFiles._count,
        totalStorageBytes: totalBytes.toString(),
        totalStorageGb: totalGb.toFixed(3),
        warningThresholdGb: warningThreshold,
        isWarning: totalGb >= warningThreshold,
        failedUploads,
        pendingDeletions,
        batchStorage,
      });
    } catch (err) {
      next(err);
    }
  },
};
