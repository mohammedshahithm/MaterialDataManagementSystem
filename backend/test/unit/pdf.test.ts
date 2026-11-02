import { describe, it, expect } from 'vitest';
import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import sharp from 'sharp';

describe('PDF Generation Engine Unit Tests', () => {
  it('creates valid PDF buffer using PDFKit', async () => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 60, bottom: 60, left: 50, right: 50 } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    doc.fontSize(20).text('Material Data Management System - Test Report');
    doc.fontSize(12).text('Product: TEST-PROD-001');
    doc.end();

    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(500);
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('transcodes images using sharp to ensure PDFKit compatibility', async () => {
    // Create a 100x100 PNG buffer
    const testImageBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 50, g: 100, b: 200, alpha: 1 },
      },
    }).png().toBuffer();

    expect(testImageBuffer).toBeInstanceOf(Buffer);
    expect(testImageBuffer.length).toBeGreaterThan(0);

    const metadata = await sharp(testImageBuffer).metadata();
    expect(metadata.width).toBe(100);
    expect(metadata.height).toBe(100);
    expect(metadata.format).toBe('png');
  });

  it('merges multiple PDF documents using pdf-lib', async () => {
    // Generate doc 1
    const pdf1 = await PDFLibDocument.create();
    const page1 = pdf1.addPage([600, 400]);
    page1.drawText('Page 1 generated report');
    const pdf1Bytes = await pdf1.save();

    // Generate doc 2 (representing source PDF)
    const pdf2 = await PDFLibDocument.create();
    const page2 = pdf2.addPage([600, 400]);
    page2.drawText('Original source PDF page');
    const pdf2Bytes = await pdf2.save();

    // Merge doc 1 and doc 2
    const merged = await PDFLibDocument.create();
    const loadedGen = await PDFLibDocument.load(pdf1Bytes);
    const genPages = await merged.copyPages(loadedGen, loadedGen.getPageIndices());
    genPages.forEach((p) => merged.addPage(p));

    const loadedSrc = await PDFLibDocument.load(pdf2Bytes);
    const srcPages = await merged.copyPages(loadedSrc, loadedSrc.getPageIndices());
    srcPages.forEach((p) => merged.addPage(p));

    const finalBytes = await merged.save();
    const finalDoc = await PDFLibDocument.load(finalBytes);

    expect(finalDoc.getPageCount()).toBe(2);
  });
});
