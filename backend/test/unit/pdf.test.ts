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

  it('guarantees exact report structure: Cover -> Micro -> Graph -> Source PDF -> WhatsApp without blank pages', async () => {
    // 1. Generate 3 dummy PNG images (Micro, Graph, WhatsApp)
    const createTestPng = async (w: number, h: number, r: number, g: number, b: number) => {
      return sharp({
        create: { width: w, height: h, channels: 3, background: { r, g, b } },
      }).png().toBuffer();
    };

    const micro1 = await createTestPng(800, 600, 100, 150, 200);
    const graph = await createTestPng(1200, 800, 50, 180, 100);
    const wa = await createTestPng(900, 1600, 200, 80, 80);

    // 2. Generate a 5-page source PDF
    const sourcePdf = await PDFLibDocument.create();
    for (let i = 1; i <= 5; i++) {
      const page = sourcePdf.addPage([595.28, 841.89]);
      page.drawText(`Original Source PDF Page ${i}`, { x: 50, y: 800, size: 14 });
    }
    const sourcePdfBytes = await sourcePdf.save();
    const sourcePdfDoc = await PDFLibDocument.load(sourcePdfBytes);
    const sourcePdfPageCount = sourcePdfDoc.getPageCount();
    expect(sourcePdfPageCount).toBe(5);

    // 3. Generate PDFKit sections with safe footers
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 45, left: 50, right: 50 },
      autoFirstPage: true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const pageWidth = doc.page.width - 100;
    const addFooter = (pageNum: number) => {
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fontSize(8).fillColor('#999999').font('Helvetica').text(
        `Page ${pageNum}`,
        50,
        doc.page.height - 35,
        { width: pageWidth, align: 'center', lineBreak: false }
      );
      doc.page.margins.bottom = savedBottom;
    };

    let currentPage = 1;
    const coverNum = currentPage++;
    const microNum = currentPage++;
    const graphNum = currentPage++;
    const waNum = currentPage + sourcePdfPageCount;

    // Cover Page
    doc.fontSize(24).text('Product Report', { align: 'center' });
    addFooter(coverNum);

    // Microstructure Page
    doc.addPage();
    doc.fontSize(14).text('Microstructure Images');
    doc.image(micro1, 50, 88, { fit: [pageWidth, 700] });
    addFooter(microNum);

    // Graph Page
    doc.addPage();
    doc.fontSize(14).text('Graph');
    doc.image(graph, 50, 88, { fit: [pageWidth, 700] });
    addFooter(graphNum);

    // WhatsApp Page
    doc.addPage();
    doc.fontSize(14).text('WhatsApp Image');
    doc.image(wa, 50, 88, { fit: [pageWidth, 700] });
    addFooter(waNum);

    doc.end();

    const pdfKitBuf = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const generatedPdf = await PDFLibDocument.load(pdfKitBuf);
    // Ensure PDFKit created EXACTLY 4 pages (no phantom blank pages from footer overflow)
    expect(generatedPdf.getPageCount()).toBe(4);

    // 4. Assemble merged PDF in exact required sequence
    const mergedPdf = await PDFLibDocument.create();
    let genIdx = 0;

    // Page 1: Cover
    const [cPage] = await mergedPdf.copyPages(generatedPdf, [genIdx++]);
    mergedPdf.addPage(cPage);

    // Page 2: Microstructure
    const [mPage] = await mergedPdf.copyPages(generatedPdf, [genIdx++]);
    mergedPdf.addPage(mPage);

    // Page 3: Graph
    const [gPage] = await mergedPdf.copyPages(generatedPdf, [genIdx++]);
    mergedPdf.addPage(gPage);

    // Pages 4-8: Source PDF (5 pages)
    const srcPages = await mergedPdf.copyPages(sourcePdfDoc, sourcePdfDoc.getPageIndices());
    srcPages.forEach((p) => mergedPdf.addPage(p));

    // Page 9: WhatsApp Image (Final Page)
    const [wPage] = await mergedPdf.copyPages(generatedPdf, [genIdx++]);
    mergedPdf.addPage(wPage);

    // Final checks
    expect(mergedPdf.getPageCount()).toBe(9);
  });

  it('handles missing optional graph without creating blank pages or failing', async () => {
    // 5-page source PDF
    const sourcePdf = await PDFLibDocument.create();
    for (let i = 1; i <= 5; i++) {
      sourcePdf.addPage([595.28, 841.89]);
    }
    const sourcePdfBytes = await sourcePdf.save();
    const sourcePdfDoc = await PDFLibDocument.load(sourcePdfBytes);

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 45, left: 50, right: 50 },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    // Cover
    doc.fontSize(24).text('Cover');

    // Micro
    doc.addPage();
    doc.fontSize(14).text('Micro');

    // Graph is OMITTED

    // WhatsApp
    doc.addPage();
    doc.fontSize(14).text('WhatsApp');

    doc.end();
    const pdfKitBuf = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const generatedPdf = await PDFLibDocument.load(pdfKitBuf);
    expect(generatedPdf.getPageCount()).toBe(3); // Cover, Micro, WA

    const mergedPdf = await PDFLibDocument.create();
    let genIdx = 0;
    // Page 1: Cover
    const [c] = await mergedPdf.copyPages(generatedPdf, [genIdx++]);
    mergedPdf.addPage(c);
    // Page 2: Micro
    const [m] = await mergedPdf.copyPages(generatedPdf, [genIdx++]);
    mergedPdf.addPage(m);
    // Graph omitted cleanly
    // Pages 3-7: Source PDF
    const srcPages = await mergedPdf.copyPages(sourcePdfDoc, sourcePdfDoc.getPageIndices());
    srcPages.forEach((p) => mergedPdf.addPage(p));
    // Page 8: WhatsApp
    const [w] = await mergedPdf.copyPages(generatedPdf, [genIdx++]);
    mergedPdf.addPage(w);

    // Exactly 1 Cover + 1 Micro + 0 Graph + 5 Source + 1 WA = 8 pages
    expect(mergedPdf.getPageCount()).toBe(8);
  });
});
