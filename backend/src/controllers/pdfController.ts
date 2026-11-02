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

      // Verify required files exist
      const filesByCategory: Record<string, typeof product.files> = {};
      product.files.forEach((f) => {
        if (!filesByCategory[f.category]) filesByCategory[f.category] = [];
        filesByCategory[f.category].push(f);
      });

      const missing: string[] = [];
      if (!filesByCategory['microstructure']?.length) missing.push('Microstructure image');
      if (!filesByCategory['graph']?.length) missing.push('Graph image');
      if (!filesByCategory['source_pdf']?.length) missing.push('Original PDF');
      if (!filesByCategory['whatsapp_image']?.length) missing.push('WhatsApp image');

      if (missing.length > 0) {
        throw new AppError(`Missing required files: ${missing.join(', ')}`, 400);
      }

      // Download all source files from Supabase Storage
      const downloadFile = async (key: string): Promise<Buffer> => {
        return storageService.downloadFile(key);
      };

      // Convert image to PNG/JPEG if needed for PDFKit compatibility
      const ensureCompatibleImage = async (
        buffer: Buffer,
        mimeType: string
      ): Promise<Buffer> => {
        if (PDFKIT_IMAGE_FORMATS.includes(mimeType)) return buffer;
        // Convert TIFF, WEBP, etc. to PNG
        return sharp(buffer).png().toBuffer();
      };

      // Download microstructure images
      const microImages: Buffer[] = [];
      for (const f of filesByCategory['microstructure']) {
        const buf = await downloadFile(f.storageKey);
        microImages.push(await ensureCompatibleImage(buf, f.mimeType));
      }

      // Download graph
      const graphFile = filesByCategory['graph'][0];
      const graphBuffer = await ensureCompatibleImage(
        await downloadFile(graphFile.storageKey),
        graphFile.mimeType
      );

      // Download WhatsApp image
      const waFile = filesByCategory['whatsapp_image'][0];
      const waBuffer = await ensureCompatibleImage(
        await downloadFile(waFile.storageKey),
        waFile.mimeType
      );

      // Download source PDF
      const sourcePdfFile = filesByCategory['source_pdf'][0];
      const sourcePdfBuffer = await downloadFile(sourcePdfFile.storageKey);

      // ── Build the report PDF with PDFKit ──
      const pdfChunks: Buffer[] = [];
      const metadata = (product.metadata as Record<string, any>) || {};
      const workDate = format(product.dateFolder.workDate, 'dd-MM-yyyy');

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 60, bottom: 60, left: 50, right: 50 },
        info: {
          Title: `Report - ${product.productName}`,
          Author: 'Material Data Management System',
        },
      });

      doc.on('data', (chunk: Buffer) => pdfChunks.push(chunk));

      const pageWidth = doc.page.width - 100; // margins
      const pageHeight = doc.page.height - 120;
      let pageNumber = 1;

      const addPageNumber = () => {
        doc.fontSize(8).fillColor('#999999')
          .text(`Page ${pageNumber}`, 50, doc.page.height - 40, { align: 'center' });
        pageNumber++;
      };

      const addHeader = (title: string) => {
        doc.fontSize(14).fillColor('#1e3a5f').font('Helvetica-Bold')
          .text(title, { underline: false });
        doc.moveDown(0.3);
        doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y)
          .strokeColor('#1e3a5f').lineWidth(1).stroke();
        doc.moveDown(0.5);
      };

      // ── PAGE 1: Cover ──
      doc.moveDown(3);
      doc.fontSize(10).fillColor('#888888').font('Helvetica')
        .text('MATERIAL DATA MANAGEMENT SYSTEM', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(24).fillColor('#1e3a5f').font('Helvetica-Bold')
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
      doc.fontSize(9).fillColor('#999999')
        .text(`Generated on ${format(new Date(), 'dd-MM-yyyy HH:mm')}`, { align: 'center' });

      addPageNumber();

      // ── PAGE 2: Microstructure Images ──
      doc.addPage();
      addHeader('Microstructure Images');

      const fitImage = (
        buffer: Buffer,
        maxW: number,
        maxH: number
      ): { buffer: Buffer; width: number; height: number } => {
        // PDFKit auto-scales, but we compute for layout
        return { buffer, width: maxW, height: maxH };
      };

      if (microImages.length === 1) {
        doc.image(microImages[0], { fit: [pageWidth, pageHeight - 80], align: 'center' });
      } else if (microImages.length === 2) {
        const imgW = (pageWidth - 20) / 2;
        const y = doc.y;
        doc.image(microImages[0], 50, y, { fit: [imgW, 300] });
        doc.image(microImages[1], 50 + imgW + 20, y, { fit: [imgW, 300] });
        doc.y = y + 310;
      } else if (microImages.length === 3) {
        const imgW = (pageWidth - 20) / 2;
        const y = doc.y;
        doc.image(microImages[0], 50, y, { fit: [imgW, 250] });
        doc.image(microImages[1], 50 + imgW + 20, y, { fit: [imgW, 250] });
        doc.y = y + 260;
        doc.image(microImages[2], 50, doc.y, { fit: [imgW, 250], align: 'center' });
        doc.y += 260;
      }

      addPageNumber();

      // ── PAGE 3: Graph Image ──
      doc.addPage();
      addHeader('Graph');
      doc.image(graphBuffer, { fit: [pageWidth, pageHeight - 80], align: 'center' });
      addPageNumber();

      // ── PAGE 4: WhatsApp Image ──
      doc.addPage();
      addHeader('WhatsApp Image');
      doc.image(waBuffer, { fit: [pageWidth, pageHeight - 80], align: 'center' });
      addPageNumber();

      doc.end();

      // Wait for PDFKit to finish
      const pdfKitBuffer = await new Promise<Buffer>((resolve) => {
        doc.on('end', () => resolve(Buffer.concat(pdfChunks)));
      });

      // ── Merge with source PDF using pdf-lib ──
      const mergedPdf = await PDFLibDocument.create();

      // Load our generated pages
      const generatedPdf = await PDFLibDocument.load(pdfKitBuffer);
      const genPages = await mergedPdf.copyPages(
        generatedPdf,
        generatedPdf.getPageIndices()
      );
      genPages.forEach((page) => mergedPdf.addPage(page));

      // Load and append the original source PDF
      try {
        const sourcePdf = await PDFLibDocument.load(sourcePdfBuffer, {
          ignoreEncryption: true,
        });
        const srcPages = await mergedPdf.copyPages(
          sourcePdf,
          sourcePdf.getPageIndices()
        );
        srcPages.forEach((page) => mergedPdf.addPage(page));
      } catch (err) {
        console.error('Failed to import source PDF:', err);
        // Continue without source PDF pages — add a note page
        const notePage = mergedPdf.addPage();
        notePage.drawText('Original PDF could not be imported — file may be corrupted.', {
          x: 50, y: 700, size: 12,
        });
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
        pageCount: genPages.length + (filesByCategory['source_pdf'] ? 1 : 0),
      });

      return res.json({
        message: 'Report generated successfully',
        fileId: reportRecord.id,
        size: finalBuffer.length,
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

  /** Download report — stream PDF file and log on response finish */
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

      const buffer = await storageService.downloadFile(report.storageKey);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${report.originalFilename}"`);
      res.setHeader('Content-Length', buffer.length);

      res.on('finish', async () => {
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
          console.error('Failed to log report download on finish:', logErr);
        }
      });

      res.send(buffer);
    } catch (err) {
      if (!res.headersSent) next(err);
    }
  },
};
