import { Request, Response, NextFunction } from 'express';
import archiver from 'archiver';
import { createHash } from 'crypto';
import prisma from '../config/database';
import { storageService } from '../services/storageService';
import { logAudit } from '../services/auditService';
import { AppError } from '../middleware/errorHandler';
import { format } from 'date-fns';

/** Map file category to subfolder name */
const CATEGORY_FOLDER: Record<string, string> = {
  microstructure: 'Microstructure',
  graph: 'Graph',
  source_pdf: 'Original-PDF',
  whatsapp_image: 'WhatsApp-Image',
  generated_report: 'Generated-Report',
};

/** Lightweight concurrency limiter */
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
            orderBy: [{ category: 'asc' }, { slotIndex: 'asc' }],
          },
        },
      });

      if (!product) throw new AppError('Product not found', 404);
      if (product.files.length === 0) throw new AppError('No files to archive', 400);

      const zipFilename = `${product.productCode}.zip`;
      const workDate = format(product.dateFolder.workDate, 'dd-MM-yyyy');

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('error', (err) => {
        console.error('Product archive error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Archive creation failed' });
        } else {
          res.end();
        }
      });
      archive.pipe(res);

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

      // Download files concurrently (pool of 4) for high-speed ZIP assembly
      const downloadedFiles = await mapConcurrent(
        product.files,
        4,
        async (file) => {
          const folder = CATEGORY_FOLDER[file.category] || file.category;
          const archivePath = `${product.productCode}/${folder}/${file.originalFilename}`;
          try {
            const buffer = await storageService.downloadFile(file.storageKey);
            return { file, archivePath, buffer, success: true };
          } catch (err) {
            console.error(`Failed to fetch file ${file.storageKey}:`, err);
            return { file, archivePath, buffer: null, success: false };
          }
        }
      );

      for (const item of downloadedFiles) {
        if (item.success && item.buffer) {
          archive.append(item.buffer, { name: item.archivePath });
          manifest.files.push({
            category: item.file.category,
            filename: item.file.originalFilename,
            path: item.archivePath,
            size: item.file.fileSize.toString(),
            checksum: item.file.checksumSha256 || null,
            uploadedAt: item.file.uploadedAt.toISOString(),
          });
        } else {
          manifest.files.push({
            category: item.file.category,
            filename: item.file.originalFilename,
            error: 'File could not be retrieved from storage',
          });
        }
      }

      // Add manifest
      archive.append(JSON.stringify(manifest, null, 2), {
        name: `${product.productCode}/manifest.json`,
      });

      res.on('finish', async () => {
        try {
          await prisma.downloadLog.create({
            data: {
              productId,
              downloadedById: userId,
              downloadType: 'product_zip',
              filename: zipFilename,
            },
          });
          await logAudit(userId, 'DOWNLOAD_PRODUCT_ZIP', 'product', productId);
        } catch (logErr) {
          console.error('Failed to log product zip download on finish:', logErr);
        }
      });

      await archive.finalize();
    } catch (err) {
      if (!res.headersSent) next(err);
    }
  },

  /** Generate and download a batch ZIP */
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
                include: {
                  files: {
                    where: { deletedAt: null, uploadStatus: 'confirmed', isLatest: true },
                    orderBy: [{ category: 'asc' }, { slotIndex: 'asc' }],
                  },
                },
              },
            },
          },
        },
      });

      if (!batch) throw new AppError('Batch not found', 404);

      const zipFilename = `${batch.batchName.replace(/\s+/g, '-')}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('error', (err) => {
        console.error('Batch archive error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Archive creation failed' });
        } else {
          res.end();
        }
      });
      archive.pipe(res);

      const batchManifest: any = {
        batchId: batch.id,
        batchName: batch.batchName,
        dateFolders: [],
        createdAt: new Date().toISOString(),
      };

      const allBatchFiles: Array<{
        file: any;
        archivePath: string;
      }> = [];

      for (const df of batch.dateFolders) {
        const dateStr = format(df.workDate, 'dd-MM-yyyy');
        const dateManifest: any = { date: dateStr, products: [] };

        for (const product of df.products) {
          for (const file of product.files) {
            const folder = CATEGORY_FOLDER[file.category] || file.category;
            const archivePath = `${batch.batchName}/${dateStr}/${product.productCode}/${folder}/${file.originalFilename}`;
            allBatchFiles.push({ file, archivePath });
          }

          dateManifest.products.push({
            productCode: product.productCode,
            productName: product.productName,
            fileCount: product.files.length,
          });
        }

        batchManifest.dateFolders.push(dateManifest);
      }

      // Download all files concurrently (pool of 5)
      const downloadedBatchFiles = await mapConcurrent(
        allBatchFiles,
        5,
        async ({ file, archivePath }) => {
          try {
            const buffer = await storageService.downloadFile(file.storageKey);
            return { buffer, archivePath, success: true };
          } catch (err) {
            console.error(`Failed to fetch file ${file.storageKey}:`, err);
            return { buffer: null, archivePath, success: false };
          }
        }
      );

      for (const item of downloadedBatchFiles) {
        if (item.success && item.buffer) {
          archive.append(item.buffer, { name: item.archivePath });
        }
      }

      archive.append(JSON.stringify(batchManifest, null, 2), {
        name: `${batch.batchName}/manifest.json`,
      });

      // Calculate a checksum — we hash the manifest as a reference
      const checksumHash = createHash('sha256')
        .update(JSON.stringify(batchManifest))
        .digest('hex');

      res.on('finish', async () => {
        try {
          await prisma.downloadLog.create({
            data: {
              batchId,
              downloadedById: userId,
              downloadType: 'batch_zip',
              filename: zipFilename,
            },
          });
          await logAudit(userId, 'DOWNLOAD_BATCH_ZIP', 'batch', batchId, { checksum: checksumHash });
        } catch (logErr) {
          console.error('Failed to log batch zip download on finish:', logErr);
        }
      });

      await archive.finalize();
    } catch (err) {
      if (!res.headersSent) next(err);
    }
  },
};
