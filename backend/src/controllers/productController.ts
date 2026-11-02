import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import { createProductSchema, updateProductSchema } from '../validators';
import { logAudit } from '../services/auditService';
import { AppError } from '../middleware/errorHandler';

export const productController = {
  /** Create a product inside a date folder */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { dateId } = req.params;
      const data = createProductSchema.parse(req.body);
      const userId = req.user!.id;

      // Verify date folder exists
      const folder = await prisma.dateFolder.findUnique({
        where: { id: dateId },
        include: { batch: { select: { status: true } } },
      });
      if (!folder) throw new AppError('Date folder not found', 404);
      if (folder.batch.status === 'deleted') {
        throw new AppError('Cannot add products to a deleted batch', 400);
      }

      const product = await prisma.product.create({
        data: {
          dateFolderId: dateId,
          productCode: data.productCode,
          productName: data.productName,
          metadata: data.metadata || {},
          createdById: userId,
        },
        include: { createdBy: { select: { fullName: true } } },
      });

      await logAudit(userId, 'CREATE_PRODUCT', 'product', product.id, {
        productCode: data.productCode,
        productName: data.productName,
      });

      return res.status(201).json(product);
    } catch (err: any) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'A product with this code already exists in this date' });
      }
      next(err);
    }
  },

  /** List products in a date folder */
  async listByDate(req: Request, res: Response, next: NextFunction) {
    try {
      const { dateId } = req.params;

      const products = await prisma.product.findMany({
        where: { dateFolderId: dateId },
        include: {
          createdBy: { select: { fullName: true } },
          files: {
            where: { deletedAt: null, uploadStatus: 'confirmed' },
            select: {
              id: true, category: true, slotIndex: true,
              originalFilename: true, fileSize: true, mimeType: true,
              uploadedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Enrich with completion info
      const enriched = products.map((product) => {
        const files = product.files;
        const categories = {
          microstructure: files.filter((f) => f.category === 'microstructure').length,
          graph: files.filter((f) => f.category === 'graph').length,
          source_pdf: files.filter((f) => f.category === 'source_pdf').length,
          whatsapp_image: files.filter((f) => f.category === 'whatsapp_image').length,
          generated_report: files.filter((f) => f.category === 'generated_report').length,
        };

        const requiredComplete =
          categories.microstructure >= 1 &&
          categories.graph >= 1 &&
          categories.source_pdf >= 1 &&
          categories.whatsapp_image >= 1;

        const totalSize = files.reduce((acc, f) => acc + f.fileSize, BigInt(0));

        // Calculate completion percentage
        let completedSteps = 0;
        const totalSteps = 5; // 1 micro, graph, pdf, whatsapp, generated report
        if (categories.microstructure >= 1) completedSteps++;
        if (categories.graph >= 1) completedSteps++;
        if (categories.source_pdf >= 1) completedSteps++;
        if (categories.whatsapp_image >= 1) completedSteps++;
        if (categories.generated_report >= 1) completedSteps++;

        return {
          ...product,
          fileSize: undefined,
          categories,
          requiredComplete,
          completionPercent: Math.round((completedSteps / totalSteps) * 100),
          totalStorage: totalSize.toString(),
        };
      });

      return res.json(enriched);
    } catch (err) {
      next(err);
    }
  },

  /** Get product detail with all files */
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId } = req.params;

      const [product, downloads] = await Promise.all([
        prisma.product.findUnique({
          where: { id: productId },
          include: {
            createdBy: { select: { fullName: true, email: true } },
            dateFolder: {
              include: {
                batch: { select: { id: true, batchName: true, status: true } },
              },
            },
            files: {
              where: { deletedAt: null, uploadStatus: 'confirmed' },
              include: {
                uploadedBy: { select: { fullName: true } },
              },
              orderBy: [{ category: 'asc' }, { slotIndex: 'asc' }, { uploadedAt: 'desc' }],
            },
          },
        }),
        prisma.downloadLog.findMany({
          where: { productId },
          select: { downloadType: true },
        }),
      ]);

      if (!product) throw new AppError('Product not found', 404);

      // Build checklist
      const files = product.files;
      const microFiles = files.filter((f) => f.category === 'microstructure');
      const hasReport = files.some((f) => f.category === 'generated_report' && f.isLatest);

      const checklist = {
        microstructure1: microFiles.some((f) => f.slotIndex === 0),
        microstructure2: microFiles.some((f) => f.slotIndex === 1),
        microstructure3: microFiles.some((f) => f.slotIndex === 2),
        graph: files.some((f) => f.category === 'graph'),
        sourcePdf: files.some((f) => f.category === 'source_pdf'),
        whatsappImage: files.some((f) => f.category === 'whatsapp_image'),
        reportGenerated: hasReport,
        reportDownloaded: downloads.some((d) => d.downloadType === 'report_pdf' || d.downloadType === 'pdf'),
        zipDownloaded: downloads.some((d) => d.downloadType === 'product_zip'),
      };

      // Check if report is outdated
      const latestReport = files.find((f) => f.category === 'generated_report' && f.isLatest);
      const latestSourceUpload = files
        .filter((f) => f.category !== 'generated_report')
        .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];

      const reportOutdated = latestReport && latestSourceUpload
        ? latestSourceUpload.uploadedAt > latestReport.uploadedAt
        : false;

      // Completion percentage: 8 workflow items (Microstructure 3 is optional)
      const steps = [
        checklist.microstructure1,
        checklist.microstructure2,
        checklist.graph,
        checklist.sourcePdf,
        checklist.whatsappImage,
        checklist.reportGenerated,
        checklist.reportDownloaded,
        checklist.zipDownloaded,
      ];
      const completionPercent = Math.round(
        (steps.filter(Boolean).length / steps.length) * 100
      );

      return res.json({
        ...product,
        checklist,
        reportOutdated,
        completionPercent,
      });
    } catch (err) {
      next(err);
    }
  },

  /** Update product */
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId } = req.params;
      const data = updateProductSchema.parse(req.body);
      const userId = req.user!.id;

      const product = await prisma.product.update({
        where: { id: productId },
        data: {
          ...(data.productName && { productName: data.productName }),
          ...(data.metadata && { metadata: data.metadata }),
        },
      });

      await logAudit(userId, 'UPDATE_PRODUCT', 'product', productId, data);
      return res.json(product);
    } catch (err) {
      next(err);
    }
  },

  /** Delete a product */
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId } = req.params;
      const userId = req.user!.id;

      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: { files: { where: { deletedAt: null } } },
      });

      if (!product) throw new AppError('Product not found', 404);

      if (product.files.length > 0) {
        throw new AppError('Cannot delete product with uploaded files. Remove files first.', 400);
      }

      await prisma.$transaction([
        prisma.downloadLog.deleteMany({ where: { productId } }),
        prisma.product.delete({ where: { id: productId } }),
      ]);
      await logAudit(userId, 'DELETE_PRODUCT', 'product', productId, {
        productCode: product.productCode,
      });

      return res.json({ message: 'Product deleted' });
    } catch (err) {
      next(err);
    }
  },
};
