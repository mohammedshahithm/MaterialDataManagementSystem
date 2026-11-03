import { Request, Response, NextFunction } from 'express';
import archiver from 'archiver';
import path from 'path';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';
import { storageService } from '../services/storageService';
import { logAudit } from '../services/auditService';
import { AppError } from '../middleware/errorHandler';
import { format } from 'date-fns';

/**
 * Sanitize strings for Windows-compatible filesystem naming.
 * Strips invalid Windows characters: \ / : * ? " < > |
 * Normalizes whitespace and collapses hyphens.
 */
export function sanitizeWindowsFilename(name: string): string {
  if (!name) return 'Archive';
  let sanitized = name.replace(/[\\/:*?"<>|]/g, '-');
  sanitized = sanitized.replace(/\s+/g, '-');
  sanitized = sanitized.replace(/-+/g, '-');
  sanitized = sanitized.replace(/^[-.]+|[-.]+$/g, '');
  return sanitized || 'Archive';
}

/**
 * Determine a clean, standardized filename for a product file according to category.
 * Follows MDMS standard:
 * - microstructure: Microstructure-Image-1.png, Microstructure-Image-2.png
 * - graph: Graph-Image.png
 * - source_pdf: Original-Document.pdf
 * - whatsapp_image: WhatsApp-Image.png
 * - generated_report: Generated-Report.pdf
 */
export function getStandardizedFilename(
  category: string,
  slotIndex: number,
  originalFilename: string,
  mimeType: string,
  categoryCount: number = 1
): string {
  let ext = path.extname(originalFilename || '').toLowerCase();
  if (!ext && mimeType) {
    if (mimeType === 'application/pdf') ext = '.pdf';
    else if (mimeType === 'image/jpeg') ext = '.jpg';
    else if (mimeType === 'image/png') ext = '.png';
    else if (mimeType === 'image/webp') ext = '.webp';
    else if (mimeType === 'image/tiff') ext = '.tiff';
  }
  if (!ext) ext = '.bin';

  switch (category) {
    case 'microstructure':
      return `Microstructure-Image-${slotIndex + 1}${ext}`;
    case 'graph':
      return categoryCount > 1 ? `Graph-Image-${slotIndex + 1}${ext}` : `Graph-Image${ext}`;
    case 'source_pdf':
      return categoryCount > 1 ? `Original-Document-${slotIndex + 1}${ext}` : `Original-Document${ext}`;
    case 'whatsapp_image':
      return categoryCount > 1 ? `WhatsApp-Image-${slotIndex + 1}${ext}` : `WhatsApp-Image${ext}`;
    case 'generated_report':
      return categoryCount > 1 ? `Generated-Report-${slotIndex + 1}${ext}` : `Generated-Report${ext}`;
    default: {
      const cleanCat = category.replace(/_/g, '-');
      const titleCase = cleanCat.charAt(0).toUpperCase() + cleanCat.slice(1);
      return categoryCount > 1 ? `${titleCase}-${slotIndex + 1}${ext}` : `${titleCase}${ext}`;
    }
  }
}

/**
 * Get standardized category folder name for zip folder hierarchy.
 * Follows MDMS specification:
 * - microstructure -> Microstructure
 * - graph -> Graph
 * - source_pdf -> Original-PDF
 * - whatsapp_image -> WhatsApp-Image
 * - generated_report -> Generated-Report
 */
export function getCategoryFolderName(category: string): string {
  switch (category) {
    case 'microstructure':
      return 'Microstructure';
    case 'graph':
      return 'Graph';
    case 'source_pdf':
      return 'Original-PDF';
    case 'whatsapp_image':
      return 'WhatsApp-Image';
    case 'generated_report':
      return 'Generated-Report';
    default: {
      const clean = category.replace(/_/g, '-');
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    }
  }
}

interface PreparedProductFile {
  file: any;
  archivePath: string;
  baseFilename: string;
}

interface PreparedBatchFile {
  file: any;
  archivePath: string;
  productCode: string;
  cleanFilename: string;
}

/** Lightweight concurrency pool for streaming storage downloads */
async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  });

  await Promise.all(workers);
  return results;
}

export const archiveController = {
  /** Generate and download a product ZIP */
  async productArchive(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId } = req.params;
      const userId = req.user!.id;

      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: {
          dateFolder: { include: { batch: true } },
          files: {
            where: { deletedAt: null, uploadStatus: 'confirmed', isLatest: true },
            orderBy: [{ category: 'asc' }, { slotIndex: 'asc' }, { uploadedAt: 'asc' }],
          },
        },
      });

      if (!product) throw new AppError('Product not found', 404);
      if (product.files.length === 0) throw new AppError('No files to archive for this product', 400);

      const sanitizedProductCode = sanitizeWindowsFilename(product.productCode);
      const zipFilename = `${sanitizedProductCode}.zip`;
      const workDate = format(product.dateFolder.workDate, 'dd-MM-yyyy');

      const archive = archiver('zip', { zlib: { level: 6 } });
      const zipChunks: Buffer[] = [];
      archive.on('data', (chunk: Buffer) => zipChunks.push(chunk));
      archive.on('error', (err) => {
        console.error('Product archive error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Product archive creation failed' });
        } else {
          res.end();
        }
      });

      const manifest: any = {
        batchId: product.dateFolder.batch.id,
        batchName: product.dateFolder.batch.batchName,
        date: workDate,
        productId: product.id,
        productCode: product.productCode,
        productName: product.productName,
        files: [],
        createdAt: new Date().toISOString(),
      };

      // Count files per category for numbering
      const catCounts: Record<string, number> = {};
      product.files.forEach((f: any) => {
        catCounts[f.category] = (catCounts[f.category] || 0) + 1;
      });

      const usedNames = new Set<string>();
      const preparedFiles: PreparedProductFile[] = product.files.map((file: any) => {
        let baseFilename = getStandardizedFilename(
          file.category,
          file.slotIndex,
          file.originalFilename,
          file.mimeType,
          catCounts[file.category] || 1
        );

        if (usedNames.has(baseFilename)) {
          let counter = 2;
          const parsed = path.parse(baseFilename);
          while (usedNames.has(`${parsed.name}-${counter}${parsed.ext}`)) {
            counter++;
          }
          baseFilename = `${parsed.name}-${counter}${parsed.ext}`;
        }
        usedNames.add(baseFilename);

        const catFolder = getCategoryFolderName(file.category);
        const archivePath = `${sanitizedProductCode}/${catFolder}/${baseFilename}`;
        return { file, archivePath, baseFilename };
      });

      // Download files concurrently (pool of 4)
      const downloadedFiles = await mapConcurrent(
        preparedFiles,
        4,
        async ({ file, archivePath, baseFilename }: PreparedProductFile) => {
          try {
            const buffer = await storageService.downloadFile(file.storageKey);
            return { file, archivePath, baseFilename, buffer, success: true };
          } catch (err) {
            console.error(`Failed to fetch file ${file.storageKey}:`, err);
            return { file, archivePath, baseFilename, buffer: null, success: false };
          }
        }
      );

      for (const item of downloadedFiles) {
        if (item.success && item.buffer) {
          archive.append(item.buffer, { name: item.archivePath });
          manifest.files.push({
            category: item.file.category,
            filename: item.baseFilename,
            originalFilename: item.file.originalFilename,
            path: item.archivePath,
            size: item.file.fileSize.toString(),
            checksum: item.file.checksumSha256 || null,
            uploadedAt: item.file.uploadedAt.toISOString(),
          });
        } else {
          manifest.files.push({
            category: item.file.category,
            filename: item.baseFilename,
            originalFilename: item.file.originalFilename,
            error: 'File could not be retrieved from storage',
          });
        }
      }

      // Add manifest
      archive.append(JSON.stringify(manifest, null, 2), {
        name: `${sanitizedProductCode}/manifest.json`,
      });

      await archive.finalize();

      const zipBuffer = Buffer.concat(zipChunks);
      const tempKey = `_temp_archives/${uuidv4()}-${zipFilename}`;

      await storageService.uploadFile(tempKey, zipBuffer, 'application/zip');
      const downloadUrl = await storageService.getSignedUrl(tempKey, 3600, { download: zipFilename });

      // Passive cleanup of expired temp archives (>2 hours) without blocking response
      storageService.cleanupTempArchives().catch(() => {});

      try {
        await prisma.downloadLog.create({
          data: {
            productId,
            downloadedById: userId,
            downloadType: 'product_zip',
            filename: zipFilename,
          },
        });
        await logAudit(userId, 'DOWNLOAD_PRODUCT_ZIP', 'product', productId, {
          filename: zipFilename,
          totalFiles: manifest.files.length,
          size: zipBuffer.length,
        });
      } catch (logErr) {
        console.error('Failed to log product zip download:', logErr);
      }

      if (req.headers.accept?.includes('application/json') || req.query.json === 'true') {
        return res.json({ downloadUrl, filename: zipFilename, size: zipBuffer.length });
      }

      return res.redirect(downloadUrl);
    } catch (err) {
      if (!res.headersSent) next(err);
    }
  },

  /** Generate and download a complete batch-level ZIP */
  async batchArchive(req: Request, res: Response, next: NextFunction) {
    try {
      const { batchId } = req.params;
      const userId = req.user!.id;

      const batch = await prisma.batch.findUnique({
        where: { id: batchId },
        include: {
          dateFolders: {
            orderBy: { workDate: 'asc' },
            include: {
              products: {
                orderBy: { productCode: 'asc' },
                include: {
                  files: {
                    where: { deletedAt: null, uploadStatus: 'confirmed', isLatest: true },
                    orderBy: [{ category: 'asc' }, { slotIndex: 'asc' }, { uploadedAt: 'asc' }],
                  },
                },
              },
            },
          },
        },
      });

      if (!batch) throw new AppError('Batch not found', 404);

      const sanitizedBatchName = sanitizeWindowsFilename(batch.batchName);
      const zipFilename = `${sanitizedBatchName}.zip`;

      const archive = archiver('zip', { zlib: { level: 6 } });
      const zipChunks: Buffer[] = [];
      archive.on('data', (chunk: Buffer) => zipChunks.push(chunk));
      archive.on('error', (err) => {
        console.error('Batch archive error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Batch archive creation failed' });
        } else {
          res.end();
        }
      });

      const batchManifest: any = {
        batchId: batch.id,
        batchName: batch.batchName,
        sanitizedBatchName,
        createdAt: new Date().toISOString(),
        products: [],
      };

      // Structure: Batch-Name/Date-YYYY-MM-DD/Product-XXX/<Category-Folder>/<Standardized-File-Name>.<ext>
      const allBatchFiles: PreparedBatchFile[] = [];

      for (const df of batch.dateFolders) {
        const dateStr = format(df.workDate, 'yyyy-MM-dd');
        const dateFolder = sanitizeWindowsFilename(`Date-${dateStr}`);
        const usedProductFolders = new Set<string>();

        for (const product of df.products) {
          let productFolder = sanitizeWindowsFilename(product.productCode);
          if (usedProductFolders.has(productFolder)) {
            let suffix = 2;
            while (usedProductFolders.has(`${productFolder}-${suffix}`)) {
              suffix++;
            }
            productFolder = `${productFolder}-${suffix}`;
          }
          usedProductFolders.add(productFolder);

          // Count categories for numbering inside this product
          const catCounts: Record<string, number> = {};
          product.files.forEach((f: any) => {
            catCounts[f.category] = (catCounts[f.category] || 0) + 1;
          });

          const productUsedFilenames = new Set<string>();
          const productFilesManifest: any[] = [];

          for (const file of product.files) {
            let cleanFilename = getStandardizedFilename(
              file.category,
              file.slotIndex,
              file.originalFilename,
              file.mimeType,
              catCounts[file.category] || 1
            );

            if (productUsedFilenames.has(cleanFilename)) {
              let counter = 2;
              const parsed = path.parse(cleanFilename);
              while (productUsedFilenames.has(`${parsed.name}-${counter}${parsed.ext}`)) {
                counter++;
              }
              cleanFilename = `${parsed.name}-${counter}${parsed.ext}`;
            }
            productUsedFilenames.add(cleanFilename);

            const catFolder = getCategoryFolderName(file.category);
            // Path: Batch-Name/Date-YYYY-MM-DD/Product-001/Microstructure/Microstructure-Image-1.png
            const archivePath = `${sanitizedBatchName}/${dateFolder}/${productFolder}/${catFolder}/${cleanFilename}`;

            allBatchFiles.push({
              file,
              archivePath,
              productCode: product.productCode,
              cleanFilename,
            });

            productFilesManifest.push({
              category: file.category,
              categoryFolder: catFolder,
              filename: cleanFilename,
              originalFilename: file.originalFilename,
              archivePath,
              size: file.fileSize.toString(),
              checksum: file.checksumSha256 || null,
              uploadedAt: file.uploadedAt.toISOString(),
            });
          }

          batchManifest.products.push({
            date: dateStr,
            dateFolder,
            productCode: product.productCode,
            productName: product.productName,
            folder: `${sanitizedBatchName}/${dateFolder}/${productFolder}`,
            fileCount: product.files.length,
            files: productFilesManifest,
          });
        }
      }

      // Handle empty batches properly so Windows File Explorer can always extract cleanly
      if (allBatchFiles.length === 0) {
        archive.append(
          `Material Data Management System\nBatch: ${batch.batchName} (ID: ${batch.id})\nStatus: This batch currently has no uploaded product files.\nGenerated: ${new Date().toISOString()}\n`,
          { name: `${sanitizedBatchName}/README.txt` }
        );
      } else {
        // Download all files concurrently (pool of 5)
        const downloadedBatchFiles = await mapConcurrent(
          allBatchFiles,
          5,
          async ({ file, archivePath }: PreparedBatchFile) => {
            try {
              const buffer = await storageService.downloadFile(file.storageKey);
              return { buffer, archivePath, success: true };
            } catch (err) {
              console.warn(`[ARCHIVE] Failed to download storage file: ${file.storageKey}`, err);
              return { buffer: null, archivePath, success: false };
            }
          }
        );

        for (const item of downloadedBatchFiles) {
          if (item.success && item.buffer) {
            archive.append(item.buffer, { name: item.archivePath });
          }
        }
      }

      // Append batch manifest to root folder
      archive.append(JSON.stringify(batchManifest, null, 2), {
        name: `${sanitizedBatchName}/manifest.json`,
      });

      // Calculate checksum of manifest
      const checksumHash = createHash('sha256')
        .update(JSON.stringify(batchManifest))
        .digest('hex');

      await archive.finalize();

      const zipBuffer = Buffer.concat(zipChunks);
      const tempKey = `_temp_archives/${uuidv4()}-${zipFilename}`;

      await storageService.uploadFile(tempKey, zipBuffer, 'application/zip');
      const downloadUrl = await storageService.getSignedUrl(tempKey, 3600, { download: zipFilename });

      // Passive cleanup of expired temp archives (>2 hours) without blocking response
      storageService.cleanupTempArchives().catch(() => {});

      try {
        await prisma.downloadLog.create({
          data: {
            batchId,
            downloadedById: userId,
            downloadType: 'batch_zip',
            filename: zipFilename,
          },
        });
        await logAudit(userId, 'DOWNLOAD_BATCH_ZIP', 'batch', batchId, {
          filename: zipFilename,
          totalProducts: batchManifest.products.length,
          totalFiles: allBatchFiles.length,
          size: zipBuffer.length,
          checksum: checksumHash,
        });
      } catch (logErr) {
        console.error('Failed to log batch zip download:', logErr);
      }

      if (req.headers.accept?.includes('application/json') || req.query.json === 'true') {
        return res.json({ downloadUrl, filename: zipFilename, size: zipBuffer.length });
      }

      return res.redirect(downloadUrl);
    } catch (err) {
      if (!res.headersSent) next(err);
    }
  },
};
