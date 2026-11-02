import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { config } from '../config';
import { getRuntimeSettings, invalidateSettingsCache } from '../services/settingsService';
import { supabaseAdmin } from '../config/supabase';
import { updateRetentionSettingsSchema } from '../validators';
import { logAudit } from '../services/auditService';
import { AppError } from '../middleware/errorHandler';

export const adminController = {
  /** Get audit logs */
  async getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const entityType = req.query.entityType as string;
      const action = req.query.action as string;

      const where: any = {};
      if (entityType) where.entityType = entityType;
      if (action) where.action = { contains: action };

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          include: { user: { select: { fullName: true, email: true } } },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.auditLog.count({ where }),
      ]);

      return res.json({
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /** Get retention settings */
  async getRetentionSettings(_req: Request, res: Response, next: NextFunction) {
    try {
      const runtime = await getRuntimeSettings();
      return res.json(runtime);
    } catch (err) {
      next(err);
    }
  },

  /** Update retention settings */
  async updateRetentionSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const data = updateRetentionSettingsSchema.parse(req.body);
      const userId = req.user!.id;

      const updates = Object.entries(data).filter(([_, v]) => v !== undefined);

      for (const [key, value] of updates) {
        await prisma.appSetting.upsert({
          where: { key },
          update: { value: value as any },
          create: { key, value: value as any },
        });
      }

      invalidateSettingsCache();
      await logAudit(userId, 'UPDATE_SETTINGS', 'settings', undefined, data);

      return res.json({ message: 'Settings updated', ...data });
    } catch (err) {
      next(err);
    }
  },

  /** List users */
  async listUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          createdAt: true,
        },
      });
      return res.json(users);
    } catch (err) {
      next(err);
    }
  },

  /** Update user role */
  async updateUserRole(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      const actorId = req.user!.id;

      if (!['admin', 'worker'].includes(role)) {
        throw new AppError('Invalid role');
      }

      if (userId === actorId) {
        throw new AppError('Cannot change your own role');
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: { role },
      });

      await logAudit(actorId, 'UPDATE_USER_ROLE', 'user', userId, { newRole: role });

      return res.json(user);
    } catch (err) {
      next(err);
    }
  },

  /** Dashboard summary */
  async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const [
        totalBatches,
        activeBatches,
        totalProducts,
        completedProducts,
        totalFiles,
        storageAgg,
        readyForDeletion,
        runtimeSettings,
      ] = await Promise.all([
        prisma.batch.count({ where: { status: { not: 'deleted' } } }),
        prisma.batch.count({ where: { status: 'active' } }),
        prisma.product.count(),
        prisma.product.count({
          where: { status: { in: ['uploads_complete', 'report_generated', 'completed'] } },
        }),
        prisma.productFile.count({
          where: { deletedAt: null, uploadStatus: 'confirmed' },
        }),
        prisma.productFile.aggregate({
          where: { deletedAt: null, uploadStatus: 'confirmed' },
          _sum: { fileSize: true },
        }),
        prisma.batch.count({
          where: { status: { in: ['partially_deleted'] } },
        }),
        getRuntimeSettings(),
      ]);

      const pendingUploads = Math.max(0, totalProducts - completedProducts);
      const totalBytes = storageAgg._sum.fileSize || BigInt(0);
      const totalGb = Number(totalBytes) / (1024 * 1024 * 1024);

      return res.json({
        totalBatches,
        activeBatches,
        totalProducts,
        completedProducts,
        pendingUploads,
        totalFiles,
        storageUsedBytes: totalBytes.toString(),
        storageUsedGb: totalGb.toFixed(3),
        storageWarningGb: runtimeSettings.storageWarningGb,
        awaitingBackup: 0,
        closedBatches: 0,
        readyForDeletion,
      });
    } catch (err) {
      next(err);
    }
  },
};
