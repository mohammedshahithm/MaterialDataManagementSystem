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

/**
 * Memory-efficient file signature validator.
 * Inspects magic bytes from the first 1024 bytes buffer to accurately identify
 * genuine MIME types without trusting user-supplied headers or loading full binaries.
 */
export function detectMimeType(buf: Buffer): string | null {
  if (!buf || buf.length < 3) return null;

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG signature: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP signature: RIFF (bytes 0-3) + WEBP (bytes 8-11)
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  // TIFF signature: II*. (little-endian) or MM.* (big-endian)
  if (
    buf.length >= 4 &&
    ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
      (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a))
  ) {
    return 'image/tiff';
  }

  // PDF signature: %PDF- in the first 1024 bytes
  if (buf.subarray(0, Math.min(1024, buf.length)).includes(Buffer.from('%PDF-'))) {
    return 'application/pdf';
  }

  return null;
}

export const fileController = {
  /**
   * 1. Request Signed Upload Authorization (Direct to Supabase Storage).
   *
   * Validates metadata, reserves upload slot, generates a unique storage path,
   * creates a signed upload URL via Supabase Storage, and initializes a pending
   * ProductFile record in PostgreSQL.
   */
  async requestUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId } = req.params;
      const userId = req.user!.id;
      const { category, slotIndex: rawSlotIndex, filename, fileSize, mimeType } = req.body;

      if (!category) throw new AppError('Category is required', 400);
      if (!filename) throw new AppError('Filename is required', 400);
      if (typeof fileSize !== 'number' || fileSize <= 0) {
        throw new AppError('Valid file size is required', 400);
      }

      const slotIndex = parseInt(rawSlotIndex ?? '0', 10);
      if (isNaN(slotIndex) || slotIndex < 0) {
        throw new AppError('Invalid slot index', 400);
      }

      // Validate product existence and status
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: {
          dateFolder: { include: { batch: { select: { id: true, status: true } } } },
          files: {
            where: {
              deletedAt: null,
              uploadStatus: 'confirmed',
            },
          },
        },
      });

      if (!product) throw new AppError('Product not found', 404);
      if (product.dateFolder.batch.status === 'deleted') {
        throw new AppError('Cannot upload to a deleted batch', 400);
      }

      // Validate category
      const allowedCategories = ['microstructure', 'graph', 'source_pdf', 'whatsapp_image'];
      if (!allowedCategories.includes(category)) {
        throw new AppError(`Invalid file category: ${category}`, 400);
      }

      // Validate file extension
      const ext = path.extname(filename).toLowerCase();
      const allowedExts = config.allowedExtensions[category];
      if (!allowedExts || !allowedExts.includes(ext)) {
        throw new AppError(
          `File extension "${ext}" is not allowed for category "${category}". Allowed: ${allowedExts?.join(', ')}`,
          400
        );
      }

      // Validate file size (max 25 MB)
      const { maxFileSizeMb } = await getRuntimeSettings();
      const maxBytes = maxFileSizeMb * 1024 * 1024;
      if (fileSize > maxBytes) {
        throw new AppError(`File size exceeds the ${maxFileSizeMb}MB limit`, 400);
      }

      // Validate slot availability
      const maxSlots = config.maxSlots[category] || 1;
      if (slotIndex >= maxSlots) {
        throw new AppError(
          `Invalid slot index ${slotIndex} for ${category} (allowed: 0 to ${maxSlots - 1})`,
          400
        );
      }

      if (category !== 'microstructure' && slotIndex !== 0) {
        throw new AppError(`${category} only supports a single file (slot 0)`, 400);
      }

      // Microstructure limit check: max 3 images total
      const categoryConfirmed = product.files.filter((f) => f.category === category);
      const existingInSlot = categoryConfirmed.find((f) => f.slotIndex === slotIndex);
      if (category === 'microstructure') {
        if (categoryConfirmed.length >= maxSlots && !existingInSlot) {
          throw new AppError(`Maximum ${maxSlots} microstructure images allowed`, 400);
        }
      }

      // Generate server-controlled, unguessable storage key
      const batchId = product.dateFolder.batch.id;
      const dateId = product.dateFolder.id;
      const fileUuid = uuidv4();
      const storageKey = `${batchId}/${dateId}/${productId}/${category}/${fileUuid}${ext}`;

      // Create Supabase signed upload URL (upsert: false ensures no overwrite)
      const signedUpload = await storageService.createSignedUploadUrl(storageKey);

      // Create or initialize pending ProductFile record in DB
      const pendingRecord = await prisma.productFile.create({
        data: {
          productId,
          category: category as any,
          slotIndex,
          originalFilename: filename,
          storageKey,
          mimeType: mimeType || 'application/octet-stream',
          fileSize: BigInt(fileSize),
          uploadedById: userId,
          uploadStatus: 'pending',
          isLatest: false,
        },
      });

      return res.status(200).json({
        fileId: pendingRecord.id,
        storageKey,
        signedUrl: signedUpload.signedUrl,
        path: signedUpload.path,
        token: signedUpload.token,
        bucket: config.storage.bucketName,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * 2. Confirm and Verify Uploaded File.
   *
   * Verifies that the client has uploaded the object to Supabase Storage.
   * Performs memory-efficient range-based verification of actual file size,
   * Content-Range, and magic bytes. Finalizes metadata in PostgreSQL.
   */
  async confirmUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId } = req.params;
      const fileId = req.params.fileId || req.body.fileId;
      const userId = req.user!.id;

      if (!fileId) throw new AppError('File ID is required', 400);

      const file = await prisma.productFile.findUnique({
        where: { id: fileId },
        include: { product: true },
      });

      if (!file || file.productId !== productId || file.deletedAt) {
        throw new AppError('File record not found', 404);
      }

      // Idempotency check: if already confirmed, return success immediately
      if (file.uploadStatus === 'confirmed') {
        return res.json({
          success: true,
          message: 'Upload already confirmed',
          fileId: file.id,
          storageKey: file.storageKey,
        });
      }

      if (file.uploadStatus !== 'pending') {
        throw new AppError(`Cannot confirm file with status: ${file.uploadStatus}`, 400);
      }

      // Memory-efficient range check: reads first 1024 bytes and extracts total size from Content-Range
      const header = await storageService.fetchObjectHeader(file.storageKey);

      if (!header.exists || header.buffer.length === 0) {
        throw new AppError(
          'Uploaded file not found in storage. The direct upload may have failed or was interrupted.',
          400
        );
      }

      // Validate actual file size does not exceed the limit
      const { maxFileSizeMb } = await getRuntimeSettings();
      const maxBytes = maxFileSizeMb * 1024 * 1024;
      if (header.size > maxBytes) {
        // Remove oversized object from storage
        await storageService.deleteFile(file.storageKey);
        await prisma.productFile.update({
          where: { id: fileId },
          data: { uploadStatus: 'failed' },
        });
        throw new AppError(
          `Uploaded file size (${Math.round(header.size / 1024 / 1024)}MB) exceeds the ${maxFileSizeMb}MB limit`,
          400
        );
      }

      // Validate magic bytes against allowed MIME types
      const detectedMime = detectMimeType(header.buffer);
      const allowedMimes = config.allowedTypes[file.category];

      if (!detectedMime || !allowedMimes?.includes(detectedMime)) {
        // Remove corrupted or malicious object from storage
        await storageService.deleteFile(file.storageKey);
        await prisma.productFile.update({
          where: { id: fileId },
          data: { uploadStatus: 'failed' },
        });
        throw new AppError(
          detectedMime
            ? `File content type "${detectedMime}" is not allowed for category "${file.category}"`
            : `Invalid or unrecognized file format for category "${file.category}"`,
          400
        );
      }

      // Concurrency check for microstructure: ensure we never exceed 3 confirmed images
      if (file.category === 'microstructure') {
        const confirmedMicro = await prisma.productFile.findMany({
          where: {
            productId,
            category: 'microstructure',
            uploadStatus: 'confirmed',
            deletedAt: null,
            slotIndex: { not: file.slotIndex },
          },
        });
        if (confirmedMicro.length >= 3) {
          await storageService.deleteFile(file.storageKey);
          await prisma.productFile.update({
            where: { id: fileId },
            data: { uploadStatus: 'failed' },
          });
          throw new AppError('Maximum 3 microstructure images allowed', 400);
        }
      }

      // Replace existing file in that slot if present
      const existingInSlot = await prisma.productFile.findMany({
        where: {
          productId,
          category: file.category,
          slotIndex: file.slotIndex,
          deletedAt: null,
          uploadStatus: 'confirmed',
          id: { not: fileId },
        },
      });

      if (existingInSlot.length > 0) {
        await prisma.productFile.updateMany({
          where: { id: { in: existingInSlot.map((f) => f.id) } },
          data: { isLatest: false, deletedAt: new Date() },
        });

        for (const oldFile of existingInSlot) {
          try {
            await storageService.deleteFile(oldFile.storageKey);
          } catch (delErr) {
            console.warn('Failed to clean up old storage file:', oldFile.storageKey, delErr);
          }
        }
      }

      // Confirm the file record
      const confirmedFile = await prisma.productFile.update({
        where: { id: fileId },
        data: {
          uploadStatus: 'confirmed',
          isLatest: true,
          fileSize: BigInt(header.size),
          mimeType: detectedMime,
        },
      });

      // Update product status
      await updateProductStatus(productId);

      await logAudit(userId, 'UPLOAD_FILE', 'product_file', fileId, {
        productId,
        category: file.category,
        filename: file.originalFilename,
        size: header.size,
        directUpload: true,
      });

      return res.json({
        success: true,
        message: 'File uploaded and verified successfully',
        fileId: confirmedFile.id,
        storageKey: confirmedFile.storageKey,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * 3. Abort or Cancel Pending Upload.
   */
  async abortUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId } = req.params;
      const fileId = req.params.fileId || req.body.fileId;

      const file = await prisma.productFile.findUnique({ where: { id: fileId } });
      if (file && file.productId === productId && file.uploadStatus === 'pending') {
        await prisma.productFile.update({
          where: { id: fileId },
          data: { uploadStatus: 'failed', deletedAt: new Date() },
        });
        try {
          await storageService.deleteFile(file.storageKey);
        } catch {}
      }

      return res.json({ success: true, message: 'Upload aborted' });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Legacy upload handler (multipart/form-data fallback).
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
