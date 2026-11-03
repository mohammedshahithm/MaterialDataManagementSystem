const fs = require('fs');
const path = require('path');
const sharp = require('../backend/node_modules/sharp');
const PDFDocument = require('../backend/node_modules/pdfkit');
const { PDFDocument: PDFLib, StandardFonts, rgb } = require('../backend/node_modules/pdf-lib');

const dir = path.join(__dirname, 'qa_inspection');
const micro1 = fs.readFileSync(path.join(dir, 'ChatGPT_Image_Jul_11,_2026,_10_20_48_AM.png'));
const micro2 = fs.readFileSync(path.join(dir, 'Screenshot_2026-10-19_234658.png'));
const graphBuf = fs.readFileSync(path.join(dir, 'Screenshot_2026-10-20_004725.png'));
const waBuf = fs.readFileSync(path.join(dir, 'Screenshot_2026-10-18_082402.png'));
const sourcePdfBuf = fs.readFileSync(path.join(dir, 'STRIPEQN1.pdf'));

async function getImageDimensions(buf) {
  const meta = await sharp(buf).metadata();
  return { width: meta.width || 800, height: meta.height || 600, aspect: (meta.width || 800) / (meta.height || 600) };
}

function computeFit(aspect, maxW, maxH) {
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return { width: w, height: h };
}

async function generateReportPdf(options) {
  const {
    productCode = 'PRD -001',
    productName = 'STEEL',
    batchName = 'batch-03 week 3',
    workDate = '05-11-2026',
    metadata = {},
    microImages = [],
    graph = null,
    sourcePdfBuffer = null,
    whatsappImage = null,
  } = options;

  // 1. Inspect source PDF if provided
  let sourcePdfDoc = null;
  let sourcePdfPageCount = 0;
  if (sourcePdfBuffer && sourcePdfBuffer.length > 0) {
    try {
      sourcePdfDoc = await PDFLib.load(sourcePdfBuffer, { ignoreEncryption: true });
      sourcePdfPageCount = sourcePdfDoc.getPageCount();
    } catch (err) {
      console.error('Failed to load source PDF:', err);
      throw new Error(`Invalid or corrupt source PDF: ${err.message}`);
    }
  }

  // Calculate page numbers for generated sections
  let currentPage = 1;
  const coverPageNum = currentPage++;
  const microPageNum = currentPage++;
  const graphPageNum = graph ? currentPage++ : null;
  const waPageNum = whatsappImage ? (currentPage + sourcePdfPageCount) : null;

  // 2. Build generated sections in PDFKit
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 45, left: 50, right: 50 },
    info: {
      Title: `Report - ${productName}`,
      Author: 'Material Data Management System',
    },
    autoFirstPage: true,
  });

  const pdfChunks = [];
  doc.on('data', c => pdfChunks.push(c));

  const pageWidth = doc.page.width - 100; // 495.28 pt
  const startY = 88;
  const availH = 700;
  const availW = pageWidth;

  const addFooter = (pageNum) => {
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fontSize(8).fillColor('#999999').font('Helvetica').text(
      `Page ${pageNum}`,
      50,
      doc.page.height - 35,
      {
        width: pageWidth,
        align: 'center',
        lineBreak: false,
      }
    );
    doc.page.margins.bottom = savedBottom;
  };

  const addHeader = (title) => {
    doc.fontSize(14).fillColor('#1e3a5f').font('Helvetica-Bold')
      .text(title, 50, 50, { width: pageWidth });
    doc.moveTo(50, 72).lineTo(50 + pageWidth, 72)
      .strokeColor('#1e3a5f').lineWidth(1).stroke();
  };

  // ── PAGE 1: Cover ──
  doc.moveDown(3);
  doc.fontSize(10).fillColor('#888888').font('Helvetica')
    .text('MATERIAL DATA MANAGEMENT SYSTEM', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(24).fillColor('#1e3a5f').font('Helvetica-Bold')
    .text('Product Report', { align: 'center' });
  doc.moveDown(2);

  const infoItems = [
    ['Product ID', productCode],
    ['Product Name', productName],
    ['Batch', batchName],
    ['Date', workDate],
    ...(metadata.material ? [['Material/Grade', metadata.material]] : []),
    ...(metadata.remarks ? [['Remarks', metadata.remarks]] : []),
  ];

  doc.font('Helvetica').fontSize(11).fillColor('#333333');
  infoItems.forEach(([label, value]) => {
    doc.font('Helvetica-Bold').text(`${label}:  `, { continued: true });
    doc.font('Helvetica').text(value);
    doc.moveDown(0.3);
  });

  doc.moveDown(1);
  doc.fontSize(9).fillColor('#999999')
    .text(`Generated on 03-11-2026 10:00`, { align: 'center' });

  addFooter(coverPageNum);

  // ── PAGE 2: Microstructure Images ──
  doc.addPage();
  addHeader('Microstructure Images');

  if (microImages.length === 0) {
    doc.fontSize(11).fillColor('#666666').font('Helvetica-Oblique')
      .text('No microstructure images uploaded for this product.', 50, 200, { width: availW, align: 'center' });
  } else if (microImages.length === 1) {
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
      doc.image(microImages[0], 50 + (colW - fit0.width) / 2, startY + (availH - fit0.height) / 2, { width: fit0.width, height: fit0.height });
      doc.image(microImages[1], 50 + colW + 15 + (colW - fit1.width) / 2, startY + (availH - fit1.height) / 2, { width: fit1.width, height: fit1.height });
    } else {
      const slotH = (availH - 20) / 2;
      const fit0 = computeFit(m0.aspect, availW, slotH);
      const fit1 = computeFit(m1.aspect, availW, slotH);
      doc.image(microImages[0], 50 + (availW - fit0.width) / 2, startY + (slotH - fit0.height) / 2, { width: fit0.width, height: fit0.height });
      doc.image(microImages[1], 50 + (availW - fit1.width) / 2, startY + slotH + 20 + (slotH - fit1.height) / 2, { width: fit1.width, height: fit1.height });
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

    doc.image(microImages[0], 50 + (colW - fit0.width) / 2, startY + (rowH - fit0.height) / 2, { width: fit0.width, height: fit0.height });
    doc.image(microImages[1], 50 + colW + 15 + (colW - fit1.width) / 2, startY + (rowH - fit1.height) / 2, { width: fit1.width, height: fit1.height });
    doc.image(microImages[2], 50 + (availW - fit2.width) / 2, startY + rowH + 20 + (rowH - fit2.height) / 2, { width: fit2.width, height: fit2.height });
  }

  addFooter(microPageNum);

  // ── PAGE 3: Graph (only if graph exists) ──
  if (graph) {
    doc.addPage();
    addHeader('Graph');
    const meta = await getImageDimensions(graph);
    const fit = computeFit(meta.aspect, availW, availH);
    const x = 50 + (availW - fit.width) / 2;
    const y = startY + (availH - fit.height) / 2;
    doc.image(graph, x, y, { width: fit.width, height: fit.height });
    addFooter(graphPageNum);
  }

  // ── WhatsApp Image (only if whatsapp exists) ──
  if (whatsappImage) {
    doc.addPage();
    addHeader('WhatsApp Image');
    const meta = await getImageDimensions(whatsappImage);
    const fit = computeFit(meta.aspect, availW, availH);
    const x = 50 + (availW - fit.width) / 2;
    const y = startY + (availH - fit.height) / 2;
    doc.image(whatsappImage, x, y, { width: fit.width, height: fit.height });
    addFooter(waPageNum);
  }

  doc.end();

  await new Promise(res => doc.on('end', res));
  const pdfKitBuf = Buffer.concat(pdfChunks);

  // 3. Assemble final document in pdf-lib following the EXACT required order
  const generatedPdf = await PDFLib.load(pdfKitBuf);
  const mergedPdf = await PDFLib.create();

  // 1. Cover
  const [coverPage] = await mergedPdf.copyPages(generatedPdf, [0]);
  mergedPdf.addPage(coverPage);

  // 2. Microstructure Images
  const [microPage] = await mergedPdf.copyPages(generatedPdf, [1]);
  mergedPdf.addPage(microPage);

  // 3. Graph (if present)
  let genNextIdx = 2;
  if (graph) {
    const [graphPage] = await mergedPdf.copyPages(generatedPdf, [genNextIdx++]);
    mergedPdf.addPage(graphPage);
  }

  // 4. All pages from Original Uploaded PDF
  if (sourcePdfDoc) {
    const srcPages = await mergedPdf.copyPages(sourcePdfDoc, sourcePdfDoc.getPageIndices());
    srcPages.forEach(p => mergedPdf.addPage(p));
  }

  // 5. WhatsApp Image (FINAL PAGE)
  if (whatsappImage) {
    const [waPage] = await mergedPdf.copyPages(generatedPdf, [genNextIdx++]);
    mergedPdf.addPage(waPage);
  }

  const finalPdfBytes = await mergedPdf.save();
  return {
    buffer: Buffer.from(finalPdfBytes),
    pageCount: mergedPdf.getPageCount(),
    pdfKitPageCount: generatedPdf.getPageCount(),
    sourcePdfPageCount,
  };
}

async function run() {
  console.log('=== TESTING REAL SAMPLE: PRD -001 ===');
  const result = await generateReportPdf({
    microImages: [micro1, micro2],
    graph: graphBuf,
    sourcePdfBuffer: sourcePdfBuf,
    whatsappImage: waBuf,
  });

  const outPath = path.join(dir, 'PRD_-001-CORRECTED-report.pdf');
  fs.writeFileSync(outPath, result.buffer);
  console.log(`Saved corrected report to: ${outPath}`);
  console.log(`Page count: ${result.pageCount} (Expected: 9)`);
  console.log(`PDFKit intermediate page count: ${result.pdfKitPageCount} (Expected: 4)`);
  console.log(`Source PDF pages preserved: ${result.sourcePdfPageCount} (Expected: 5)`);
}

run().catch(console.error);

