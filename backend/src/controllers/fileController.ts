import { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';
import { storageService } from '../services/storageService';
import { config } from '../config';
import { getRuntimeSettings } from '../services/settingsService';
import { logAudit } from '../services/auditService';
import { AppError } from '../middleware/errorHandler';

export const fileController = {
  /**
   * Upload a file through the backend (multipart/form-data).
   *
   * Expected form fields:
   *   - file      (the uploaded file, handled by multer)
   *   - category  ('microstructure' | 'graph' | 'source_pdf' | 'whatsapp_image')
   *   - slotIndex (number, default 0)
   */
  async upload(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId } = req.params;
      const userId = req.user!.id;
      const file = req.file; // populated by multer
      const category = req.body.category as string;
      const slotIndex = parseInt(req.body.slotIndex || '0', 10);

      if (!file) throw new AppError('No file provided');
      if (file.size === 0) throw new AppError('File cannot be empty');
      if (!category) throw new AppError('Category is required');

      // Verify product exists
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: {
          dateFolder: { include: { batch: { select: { id: true, status: true } } } },
          files: {
            where: {
              deletedAt: null,
              uploadStatus: 'confirmed',
              category: category as any,
            },
          },
        },
      });

      if (!product) throw new AppError('Product not found', 404);
      if (product.dateFolder.batch.status === 'deleted') {
        throw new AppError('Cannot upload to a deleted batch', 400);
      }

      // Validate file type
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedMimes = config.allowedTypes[category];
      const allowedExts = config.allowedExtensions[category];

      if (!allowedMimes?.includes(file.mimetype)) {
        throw new AppError(`File type "${file.mimetype}" is not allowed for ${category}`);
      }
      if (!allowedExts?.includes(ext)) {
        throw new AppError(`File extension "${ext}" is not allowed for ${category}`);
      }

      // Validate file size
      const { maxFileSizeMb } = await getRuntimeSettings();
      const maxBytes = maxFileSizeMb * 1024 * 1024;
      if (file.size > maxBytes) {
        throw new AppError(`File size exceeds the ${maxFileSizeMb}MB limit`);
      }

      // Validate slot availability
      const maxSlots = config.maxSlots[category] || 1;
      if (isNaN(slotIndex) || slotIndex < 0 || slotIndex >= maxSlots) {
        throw new AppError(`Invalid slot index ${slotIndex} for ${category} (allowed: 0 to ${maxSlots - 1})`);
      }

      // Verify file content signature (magic bytes and structure)
      if (category === 'source_pdf') {
        const header = file.buffer.subarray(0, 1024).toString('utf-8');
        if (!header.includes('%PDF-')) {
          throw new AppError('Invalid PDF file format (missing %PDF- signature)');
        }
      } else {
        try {
          const meta = await sharp(file.buffer).metadata();
          if (!meta.format) {
            throw new AppError('Unrecognized image format');
          }
        } catch (err: any) {
          throw new AppError(`Invalid or corrupted image file: ${err.message || 'decoding failed'}`);
        }
      }
      const existingInSlot = product.files.filter(
        (f) => f.slotIndex === slotIndex
      );

      // For non-microstructure categories, only 1 file allowed (slot 0)
      if (category !== 'microstructure' && slotIndex !== 0) {
        throw new AppError(`${category} only supports a single file (slot 0)`);
      }

      // Check total microstructure count
      if (category === 'microstructure') {
        const microCount = product.files.filter(
          (f) => f.category === 'microstructure'
        ).length;
        if (microCount >= maxSlots && existingInSlot.length === 0) {
          throw new AppError('Maximum 3 microstructure images allowed');
        }
      }

      // Build storage key (same path structure as before)
      const batchId = product.dateFolder.batch.id;
      const dateId = product.dateFolder.id;
      const fileUuid = uuidv4();
      const storageKey = `${batchId}/${dateId}/${productId}/${category}/${fileUuid}${ext}`;

      // If replacing, mark old file as non-latest
      if (existingInSlot.length > 0) {
        await prisma.productFile.updateMany({
          where: {
            productId,
            category: category as any,
            slotIndex,
            deletedAt: null,
          },
          data: { isLatest: false, deletedAt: new Date() },
        });

        // Delete old files from Supabase Storage
        for (const oldFile of existingInSlot) {
          try {
            await storageService.deleteFile(oldFile.storageKey);
          } catch (err) {
            console.error('Failed to delete old file from storage:', oldFile.storageKey, err);
          }
        }
      }

      // Upload to Supabase Storage
      await storageService.uploadFile(storageKey, file.buffer, file.mimetype);

      // Create confirmed file record (no separate "complete" step needed)
      const fileRecord = await prisma.productFile.create({
        data: {
          productId,
          category: category as any,
          slotIndex,
          originalFilename: file.originalname,
          storageKey,
          mimeType: file.mimetype,
          fileSize: BigInt(file.size),
          checksumSha256: createHash('sha256').update(file.buffer).digest('hex'),
          uploadedById: userId,
          uploadStatus: 'confirmed',
          isLatest: true,
        },
      });

      // Update product status
      await updateProductStatus(productId);

      await logAudit(userId, 'UPLOAD_FILE', 'product_file', fileRecord.id, {
        productId,
        category,
        filename: file.originalname,
        size: file.size,
      });

      return res.status(201).json({
        fileId: fileRecord.id,
        storageKey,
        message: 'File uploaded successfully',
      });
    } catch (err) {
      next(err);
    }
  },

  /** List files for a product */
  async listByProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId } = req.params;

      const files = await prisma.productFile.findMany({
        where: { productId, deletedAt: null, uploadStatus: 'confirmed' },
        include: { uploadedBy: { select: { fullName: true } } },
        orderBy: [{ category: 'asc' }, { slotIndex: 'asc' }],
      });

      return res.json(
        files.map((f) => ({ ...f, fileSize: f.fileSize.toString() }))
      );
    } catch (err) {
      next(err);
    }
  },

  /** Get a signed download URL for a file */
  async getDownloadUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const { fileId } = req.params;

      const file = await prisma.productFile.findUnique({
        where: { id: fileId },
        include: { product: true },
      });
      if (!file || file.deletedAt) throw new AppError('File not found', 404);

      const isInline = req.query.inline === 'true' || req.query.preview === 'true';

      // Standard default naming according to MDMS specification:
      // - Original PDF: Product-001-Original-Document.pdf
      // - Microstructure: Product-001-Microstructure-1.png
      // - Graph: Product-001-Graph-Image.png
      // - WhatsApp: Product-001-WhatsApp-Image.png
      const ext =
        path.extname(file.originalFilename || '').toLowerCase() ||
        (file.mimeType === 'application/pdf' ? '.pdf' : '.png');
      const productCode = file.product ? file.product.productCode.replace(/[\\/:*?"<>|]/g, '-') : 'Product';
      let defaultFilename = file.originalFilename;

      if (file.category === 'source_pdf') {
        defaultFilename = `${productCode}-Original-Document${ext}`;
      } else if (file.category === 'microstructure') {
        defaultFilename = `${productCode}-Microstructure-${(file.slotIndex ?? 0) + 1}${ext}`;
      } else if (file.category === 'graph') {
        defaultFilename = `${productCode}-Graph-Image${ext}`;
      } else if (file.category === 'whatsapp_image') {
        defaultFilename = `${productCode}-WhatsApp-Image${ext}`;
      } else if (file.category === 'generated_report') {
        defaultFilename = `${productCode}-Report.pdf`;
      }

      const downloadUrl = await storageService.getSignedUrl(
        file.storageKey,
        config.app.signedUrlExpiry,
        isInline ? undefined : { download: defaultFilename }
      );

      return res.json({ downloadUrl, filename: defaultFilename });
    } catch (err) {
      next(err);
    }
  },

  /** Delete a file */
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { fileId } = req.params;
      const userId = req.user!.id;

      const file = await prisma.productFile.findUnique({ where: { id: fileId } });
      if (!file || file.deletedAt) throw new AppError('File not found', 404);

      // Don't allow deleting generated reports — they get superseded
      if (file.category === 'generated_report') {
        throw new AppError('Generated reports cannot be manually deleted');
      }

      // Soft-delete from DB
      await prisma.productFile.update({
        where: { id: fileId },
        data: { deletedAt: new Date(), isLatest: false },
      });

      // Delete from Supabase Storage
      try {
        await storageService.deleteFile(file.storageKey);
      } catch (err) {
        console.error('Storage delete failed for', file.storageKey, err);
        // File is already marked deleted in DB, storage cleanup can be retried
      }

      await updateProductStatus(file.productId);
      await logAudit(userId, 'DELETE_FILE', 'product_file', fileId, {
        category: file.category,
        storageKey: file.storageKey,
      });

      return res.json({ message: 'File deleted' });
    } catch (err) {
      next(err);
    }
  },
};

/** Helper: update product status based on file completeness */
async function updateProductStatus(productId: string) {
  const files = await prisma.productFile.findMany({
    where: { productId, deletedAt: null, uploadStatus: 'confirmed' },
  });

  const cats = new Set(files.map((f) => f.category));
  let status: 'draft' | 'in_progress' | 'uploads_complete' | 'report_generated' = 'draft';

  if (files.length > 0) status = 'in_progress';
  if (
    cats.has('microstructure') &&
    cats.has('graph') &&
    cats.has('source_pdf') &&
    cats.has('whatsapp_image')
  ) {
    status = 'uploads_complete';
  }
  if (cats.has('generated_report')) {
    status = 'report_generated';
  }

  await prisma.product.update({
    where: { id: productId },
    data: { status },
  });
}
