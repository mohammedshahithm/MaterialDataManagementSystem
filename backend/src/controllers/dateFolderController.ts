import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { createDateFolderSchema } from '../validators';
import { logAudit } from '../services/auditService';
import { AppError } from '../middleware/errorHandler';

export const dateFolderController = {
  /** Create a date folder inside a batch */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { batchId } = req.params;
      const data = createDateFolderSchema.parse(req.body);
      const userId = req.user!.id;

      // Verify batch exists and is not deleted
      const batch = await prisma.batch.findUnique({ where: { id: batchId } });
      if (!batch) throw new AppError('Batch not found', 404);
      if (batch.status === 'deleted') throw new AppError('Cannot add dates to a deleted batch', 400);

      const dateFolder = await prisma.dateFolder.create({
        data: {
          batchId,
          workDate: new Date(data.workDate),
          createdById: userId,
        },
        include: { createdBy: { select: { fullName: true } } },
      });

      await logAudit(userId, 'CREATE_DATE_FOLDER', 'date_folder', dateFolder.id, {
        batchId,
        workDate: data.workDate,
      });

      return res.status(201).json(dateFolder);
    } catch (err: any) {
      // Handle unique constraint violation for duplicate dates
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'This date already exists in this batch' });
      }
      next(err);
    }
  },

  /** List date folders for a batch */
  async listByBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const { batchId } = req.params;

      const folders = await prisma.dateFolder.findMany({
        where: { batchId },
        include: {
          createdBy: { select: { fullName: true } },
          products: {
            include: {
              files: {
                where: { deletedAt: null, uploadStatus: 'confirmed' },
                select: { id: true, category: true, fileSize: true },
              },
            },
          },
        },
        orderBy: { workDate: 'desc' },
      });

      const enriched = folders.map((df) => {
        let totalStorage = BigInt(0);
        let completedProducts = 0;
        df.products.forEach((p) => {
          const cats = new Set(p.files.map((f) => f.category));
          if (cats.has('microstructure') && cats.has('graph') && cats.has('source_pdf') && cats.has('whatsapp_image')) {
            completedProducts++;
          }
          p.files.forEach((f) => { totalStorage += f.fileSize; });
        });
        return {
          id: df.id,
          batchId: df.batchId,
          workDate: df.workDate,
          createdBy: df.createdBy.fullName,
          createdAt: df.createdAt,
          totalProducts: df.products.length,
          completedProducts,
          storageUsed: totalStorage.toString(),
        };
      });

      return res.json(enriched);
    } catch (err) {
      next(err);
    }
  },

  /** Get single date folder with products */
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { dateId } = req.params;

      const folder = await prisma.dateFolder.findUnique({
        where: { id: dateId },
        include: {
          batch: { select: { id: true, batchName: true, status: true } },
          createdBy: { select: { fullName: true } },
          products: {
            orderBy: { createdAt: 'desc' },
            include: {
              createdBy: { select: { fullName: true } },
              files: {
                where: { deletedAt: null, uploadStatus: 'confirmed' },
                select: {
                  id: true, category: true, slotIndex: true,
                  originalFilename: true, fileSize: true, uploadedAt: true,
                },
              },
            },
          },
        },
      });

      if (!folder) throw new AppError('Date folder not found', 404);

      return res.json(folder);
    } catch (err) {
      next(err);
    }
  },

  /** Delete a date folder (admin only) */
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { dateId } = req.params;
      const userId = req.user!.id;

      const folder = await prisma.dateFolder.findUnique({
        where: { id: dateId },
        include: { products: { include: { files: { where: { deletedAt: null } } } } },
      });

      if (!folder) throw new AppError('Date folder not found', 404);

      const hasFiles = folder.products.some((p) => p.files.length > 0);
      if (hasFiles) {
        throw new AppError('Cannot delete date folder with uploaded files. Remove files first.', 400);
      }

      const productIds = folder.products.map((p) => p.id);
      await prisma.$transaction([
        prisma.downloadLog.deleteMany({ where: { productId: { in: productIds } } }),
        prisma.dateFolder.delete({ where: { id: dateId } }),
      ]);
      await logAudit(userId, 'DELETE_DATE_FOLDER', 'date_folder', dateId);

      return res.json({ message: 'Date folder deleted' });
    } catch (err) {
      next(err);
    }
  },
};
