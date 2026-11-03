import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';
import { storageService } from '../services/storageService';
import { logAudit } from '../services/auditService';
import { AppError } from '../middleware/errorHandler';
import { format } from 'date-fns';

// Allowed image mimes that PDFKit can embed
const PDFKIT_IMAGE_FORMATS = ['image/jpeg', 'image/png'];

/** Helper to inspect image dimensions and aspect ratio */
async function getImageDimensions(
  buf: Buffer
): Promise<{ width: number; height: number; aspect: number }> {
  const meta = await sharp(buf).metadata();
  let width = meta.width || 800;
  let height = meta.height || 600;
  if (meta.orientation && meta.orientation >= 5) {
    const temp = width;
    width = height;
    height = temp;
  }
  return { width, height, aspect: width / height };
}

/** Compute fitted dimensions preserving aspect ratio */
function computeFit(
  aspect: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return { width: w, height: h };
}

export const pdfController = {
  /** Generate the final product report PDF */
  async generateReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId } = req.params;
      const userId = req.user!.id;

      // Fetch product with all confirmed files
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: {
          dateFolder: {
            include: { batch: { select: { id: true, batchName: true } } },
          },
          files: {
            where: { deletedAt: null, uploadStatus: 'confirmed', isLatest: true },
            orderBy: [{ category: 'asc' }, { slotIndex: 'asc' }],
          },
        },
      });

      if (!product) throw new AppError('Product not found', 404);

      // Map files by category
      const filesByCategory: Record<string, typeof product.files> = {};
      product.files.forEach((f) => {
        if (!filesByCategory[f.category]) filesByCategory[f.category] = [];
        filesByCategory[f.category].push(f);
      });

      // Validate that at least one file exists to generate a meaningful report
      const hasAnyFiles =
        (filesByCategory['microstructure']?.length || 0) > 0 ||
        (filesByCategory['graph']?.length || 0) > 0 ||
        (filesByCategory['source_pdf']?.length || 0) > 0 ||
        (filesByCategory['whatsapp_image']?.length || 0) > 0;

      if (!hasAnyFiles) {
        throw new AppError('At least one uploaded file is required to generate a report', 400);
      }

      // Download helper from Supabase Storage
      const downloadFile = async (key: string): Promise<Buffer> => {
        return storageService.downloadFile(key);
      };

      // Convert image to PNG/JPEG if needed for PDFKit compatibility
      const ensureCompatibleImage = async (
        buffer: Buffer,
        mimeType: string
      ): Promise<Buffer> => {
        if (PDFKIT_IMAGE_FORMATS.includes(mimeType)) return buffer;
        return sharp(buffer).png().toBuffer();
      };

      // Download microstructure images (up to 3)
      const microImages: Buffer[] = [];
      if (filesByCategory['microstructure']?.length) {
        for (const f of filesByCategory['microstructure'].slice(0, 3)) {
          const buf = await downloadFile(f.storageKey);
          microImages.push(await ensureCompatibleImage(buf, f.mimeType));
        }
      }

      // Download graph if present
      let graphBuffer: Buffer | null = null;
      if (filesByCategory['graph']?.length) {
        const graphFile = filesByCategory['graph'][0];
        graphBuffer = await ensureCompatibleImage(
          await downloadFile(graphFile.storageKey),
          graphFile.mimeType
        );
      }

      // Download WhatsApp image if present
      let waBuffer: Buffer | null = null;
      if (filesByCategory['whatsapp_image']?.length) {
        const waFile = filesByCategory['whatsapp_image'][0];
        waBuffer = await ensureCompatibleImage(
          await downloadFile(waFile.storageKey),
          waFile.mimeType
        );
      }

      // Download source PDF if present
      let sourcePdfBuffer: Buffer | null = null;
      if (filesByCategory['source_pdf']?.length) {
        const sourcePdfFile = filesByCategory['source_pdf'][0];
        sourcePdfBuffer = await downloadFile(sourcePdfFile.storageKey);
      }

      // ── 1. Inspect source PDF if provided ──
      let sourcePdfDoc: PDFLibDocument | null = null;
      let sourcePdfPageCount = 0;
      if (sourcePdfBuffer && sourcePdfBuffer.length > 0) {
        try {
          sourcePdfDoc = await PDFLibDocument.load(sourcePdfBuffer, {
            ignoreEncryption: true,
          });
          sourcePdfPageCount = sourcePdfDoc.getPageCount();
        } catch (err) {
          console.error('Failed to load source PDF:', err);
        }
      }

      // ── 2. Pre-calculate exact page numbers for generated sections ──
      let currentPage = 1;
      const coverPageNum = currentPage++;
      const microPageNum = microImages.length > 0 ? currentPage++ : null;
      const graphPageNum = graphBuffer ? currentPage++ : null;
      const effectiveSourcePdfCount = sourcePdfDoc
        ? sourcePdfPageCount
        : sourcePdfBuffer
        ? 1
        : 0;
      const waPageNum = waBuffer ? currentPage + effectiveSourcePdfCount : null;

      // ── 3. Build generated sections with PDFKit ──
      const pdfChunks: Buffer[] = [];
      const metadata = (product.metadata as Record<string, any>) || {};
      const workDate = format(product.dateFolder.workDate, 'dd-MM-yyyy');

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 45, left: 50, right: 50 },
        info: {
          Title: `Report - ${product.productName}`,
          Author: 'Material Data Management System',
        },
        autoFirstPage: true,
      });

      doc.on('data', (chunk: Buffer) => pdfChunks.push(chunk));

      const pageWidth = doc.page.width - 100; // 495.28 pt
      const startY = 88;
      const availH = 700;
      const availW = pageWidth;

      // Safe footer rendering: temporarily disable bottom margin and disable linebreaks
      // to guarantee PDFKit never triggers an automatic pageAddition on footer overflow
      const addFooter = (pageNum: number) => {
        const savedBottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc
          .fontSize(8)
          .fillColor('#999999')
          .font('Helvetica')
          .text(`Page ${pageNum}`, 50, doc.page.height - 35, {
            width: pageWidth,
            align: 'center',
            lineBreak: false,
          });
        doc.page.margins.bottom = savedBottom;
      };

      const addHeader = (title: string) => {
        doc
          .fontSize(14)
          .fillColor('#1e3a5f')
          .font('Helvetica-Bold')
          .text(title, 50, 50, { width: pageWidth });
        doc
          .moveTo(50, 72)
          .lineTo(50 + pageWidth, 72)
          .strokeColor('#1e3a5f')
          .lineWidth(1)
          .stroke();
      };

      // ── PAGE 1: Cover (preserved exact appearance) ──
      doc.moveDown(3);
      doc
        .fontSize(10)
        .fillColor('#888888')
        .font('Helvetica')
        .text('MATERIAL DATA MANAGEMENT SYSTEM', { align: 'center' });
      doc.moveDown(0.5);
      doc
        .fontSize(24)
        .fillColor('#1e3a5f')
        .font('Helvetica-Bold')
        .text('Product Report', { align: 'center' });
      doc.moveDown(2);

      // Info table
      const infoItems = [
        ['Product ID', product.productCode],
        ['Product Name', product.productName],
        ['Batch', product.dateFolder.batch.batchName],
        ['Date', workDate],
        ...(metadata.material ? [['Material/Grade', metadata.material]] : []),
        ...(metadata.remarks ? [['Remarks', metadata.remarks]] : []),
      ];

      doc.font('Helvetica').fontSize(11).fillColor('#333333');
      infoItems.forEach(([label, value]) => {
        doc.font('Helvetica-Bold').text(`${label}:  `, { continued: true });
        doc.font('Helvetica').text(value as string);
        doc.moveDown(0.3);
      });

      doc.moveDown(1);
      doc
        .fontSize(9)
        .fillColor('#999999')
        .text(`Generated on ${format(new Date(), 'dd-MM-yyyy HH:mm')}`, {
          align: 'center',
        });

      addFooter(coverPageNum);

      // ── PAGE 2: Microstructure Images (single dedicated page, up to 3 images) ──
      if (microImages.length > 0) {
        doc.addPage();
        addHeader('Microstructure Images');

        if (microImages.length === 1) {
          const meta = await getImageDimensions(microImages[0]);
          const fit = computeFit(meta.aspect, availW, availH);
          const x = 50 + (availW - fit.width) / 2;
          const y = startY + (availH - fit.height) / 2;
          doc.image(microImages[0], x, y, { width: fit.width, height: fit.height });
        } else if (microImages.length === 2) {
          const m0 = await getImageDimensions(microImages[0]);
          const m1 = await getImageDimensions(microImages[1]);
          const bothPortrait = m0.aspect < 0.9 && m1.aspect < 0.9;

          if (bothPortrait) {
            const colW = (availW - 15) / 2;
            const fit0 = computeFit(m0.aspect, colW, availH);
            const fit1 = computeFit(m1.aspect, colW, availH);
            doc.image(
              microImages[0],
              50 + (colW - fit0.width) / 2,
              startY + (availH - fit0.height) / 2,
              { width: fit0.width, height: fit0.height }
            );
            doc.image(
              microImages[1],
              50 + colW + 15 + (colW - fit1.width) / 2,
              startY + (availH - fit1.height) / 2,
              { width: fit1.width, height: fit1.height }
            );
          } else {
            const slotH = (availH - 20) / 2;
            const fit0 = computeFit(m0.aspect, availW, slotH);
            const fit1 = computeFit(m1.aspect, availW, slotH);
            doc.image(
              microImages[0],
              50 + (availW - fit0.width) / 2,
              startY + (slotH - fit0.height) / 2,
              { width: fit0.width, height: fit0.height }
            );
            doc.image(
              microImages[1],
              50 + (availW - fit1.width) / 2,
              startY + slotH + 20 + (slotH - fit1.height) / 2,
              { width: fit1.width, height: fit1.height }
            );
          }
        } else if (microImages.length >= 3) {
          const m0 = await getImageDimensions(microImages[0]);
          const m1 = await getImageDimensions(microImages[1]);
          const m2 = await getImageDimensions(microImages[2]);
          const rowH = (availH - 20) / 2;
          const colW = (availW - 15) / 2;

          const fit0 = computeFit(m0.aspect, colW, rowH);
          const fit1 = computeFit(m1.aspect, colW, rowH);
          const fit2 = computeFit(m2.aspect, availW * 0.75, rowH);

          doc.image(
            microImages[0],
            50 + (colW - fit0.width) / 2,
            startY + (rowH - fit0.height) / 2,
            { width: fit0.width, height: fit0.height }
          );
          doc.image(
            microImages[1],
            50 + colW + 15 + (colW - fit1.width) / 2,
            startY + (rowH - fit1.height) / 2,
            { width: fit1.width, height: fit1.height }
          );
          doc.image(
            microImages[2],
            50 + (availW - fit2.width) / 2,
            startY + rowH + 20 + (rowH - fit2.height) / 2,
            { width: fit2.width, height: fit2.height }
          );
        }

        if (microPageNum) addFooter(microPageNum);
      }

      // ── PAGE 3: Graph Image (dedicated page, centered) ──
      if (graphBuffer) {
        doc.addPage();
        addHeader('Graph');
        const meta = await getImageDimensions(graphBuffer);
        const fit = computeFit(meta.aspect, availW, availH);
        const x = 50 + (availW - fit.width) / 2;
        const y = startY + (availH - fit.height) / 2;
        doc.image(graphBuffer, x, y, { width: fit.width, height: fit.height });
        if (graphPageNum) addFooter(graphPageNum);
      }

      // ── WhatsApp Image (dedicated page, centered) ──
      if (waBuffer) {
        doc.addPage();
        addHeader('WhatsApp Image');
        const meta = await getImageDimensions(waBuffer);
        const fit = computeFit(meta.aspect, availW, availH);
        const x = 50 + (availW - fit.width) / 2;
        const y = startY + (availH - fit.height) / 2;
        doc.image(waBuffer, x, y, { width: fit.width, height: fit.height });
        if (waPageNum) addFooter(waPageNum);
      }

      doc.end();

      // Wait for PDFKit stream to complete
      const pdfKitBuffer = await new Promise<Buffer>((resolve) => {
        doc.on('end', () => resolve(Buffer.concat(pdfChunks)));
      });

      // ── 4. Merge sections in the EXACT required order with pdf-lib ──
      const mergedPdf = await PDFLibDocument.create();
      const generatedPdf = await PDFLibDocument.load(pdfKitBuffer);

      let genIdx = 0;

      // 1. Cover
      const [coverPage] = await mergedPdf.copyPages(generatedPdf, [genIdx++]);
      mergedPdf.addPage(coverPage);

      // 2. Microstructure Images (if present)
      if (microImages.length > 0) {
        const [microPage] = await mergedPdf.copyPages(generatedPdf, [genIdx++]);
        mergedPdf.addPage(microPage);
      }

      // 3. Graph (if present)
      if (graphBuffer) {
        const [graphPage] = await mergedPdf.copyPages(generatedPdf, [genIdx++]);
        mergedPdf.addPage(graphPage);
      }

      // 4. All pages from Original Uploaded PDF (unaltered, preserving dimensions/orientation)
      if (sourcePdfDoc) {
        const srcPages = await mergedPdf.copyPages(
          sourcePdfDoc,
          sourcePdfDoc.getPageIndices()
        );
        srcPages.forEach((page) => mergedPdf.addPage(page));
      } else if (sourcePdfBuffer && sourcePdfBuffer.length > 0) {
        const notePage = mergedPdf.addPage();
        notePage.drawText(
          'Original PDF could not be imported — file may be corrupted.',
          {
            x: 50,
            y: 700,
            size: 12,
          }
        );
      }

      // 5. WhatsApp Image (FINAL PAGE)
      if (waBuffer) {
        const [waPage] = await mergedPdf.copyPages(generatedPdf, [genIdx++]);
        mergedPdf.addPage(waPage);
      }

      const finalPdfBytes = await mergedPdf.save();
      const finalBuffer = Buffer.from(finalPdfBytes);

      // Upload to Supabase Storage
      const batchId = product.dateFolder.batch.id;
      const dateId = product.dateFolder.id;
      const reportKey = `${batchId}/${dateId}/${productId}/generated_report/${uuidv4()}.pdf`;

      await storageService.uploadFile(reportKey, finalBuffer, 'application/pdf');

      // Mark previous reports as non-latest
      await prisma.productFile.updateMany({
        where: {
          productId,
          category: 'generated_report',
          isLatest: true,
        },
        data: { isLatest: false },
      });

      // Create file record
      const reportRecord = await prisma.productFile.create({
        data: {
          productId,
          category: 'generated_report',
          slotIndex: 0,
          originalFilename: `${product.productCode}-report.pdf`,
          storageKey: reportKey,
          mimeType: 'application/pdf',
          fileSize: BigInt(finalBuffer.length),
          uploadedById: userId,
          uploadStatus: 'confirmed',
          isLatest: true,
        },
      });

      // Update product status
      await prisma.product.update({
        where: { id: productId },
        data: { status: 'report_generated' },
      });

      await logAudit(userId, 'GENERATE_REPORT', 'product', productId, {
        reportFileId: reportRecord.id,
        reportSize: finalBuffer.length,
        pageCount: mergedPdf.getPageCount(),
      });

      return res.json({
        message: 'Report generated successfully',
        fileId: reportRecord.id,
        size: finalBuffer.length,
        pageCount: mergedPdf.getPageCount(),
      });
    } catch (err) {
      next(err);
    }
  },

  /** Get the latest report download URL */
  async getReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId } = req.params;

      const report = await prisma.productFile.findFirst({
        where: {
          productId,
          category: 'generated_report',
          isLatest: true,
          deletedAt: null,
        },
      });

      if (!report) throw new AppError('No report found. Generate one first.', 404);

      const downloadUrl = await storageService.getSignedUrl(
        report.storageKey,
        config.app.signedUrlExpiry,
        { download: report.originalFilename }
      );

      return res.json({
        fileId: report.id,
        filename: report.originalFilename,
        size: report.fileSize.toString(),
        generatedAt: report.uploadedAt,
        downloadUrl,
      });
    } catch (err) {
      next(err);
    }
  },

  /** Download report — redirect to signed Supabase Storage URL (bypasses Vercel 4.5MB response limit) */
  async downloadReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId } = req.params;
      const userId = req.user!.id;

      const report = await prisma.productFile.findFirst({
        where: {
          productId,
          category: 'generated_report',
          isLatest: true,
          deletedAt: null,
        },
      });

      if (!report) throw new AppError('No report found', 404);

      // Log download initiation
      try {
        await prisma.downloadLog.create({
          data: {
            productId,
            downloadedById: userId,
            downloadType: 'report_pdf',
            filename: report.originalFilename,
          },
        });
        await logAudit(userId, 'DOWNLOAD_REPORT_PDF', 'product', productId, {
          filename: report.originalFilename,
        });
      } catch (logErr) {
        console.error('Failed to log report download:', logErr);
      }

      // Generate authorized signed download URL directly from Supabase Storage
      const downloadUrl = await storageService.getSignedUrl(
        report.storageKey,
        config.app.signedUrlExpiry,
        { download: report.originalFilename }
      );

      // If client requests JSON
      if (req.headers.accept?.includes('application/json') || req.query.json === 'true') {
        return res.json({
          downloadUrl,
          filename: report.originalFilename,
          size: report.fileSize.toString(),
        });
      }

      // Redirect client directly to Supabase Storage signed URL (bypasses 4.5MB Vercel limit)
      return res.redirect(downloadUrl);
    } catch (err) {
      if (!res.headersSent) next(err);
    }
  },
};
