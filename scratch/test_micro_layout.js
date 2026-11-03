const fs = require('fs');
const path = require('path');
const sharp = require('../backend/node_modules/sharp');
const PDFDocument = require('../backend/node_modules/pdfkit');
const { PDFDocument: PDFLib } = require('../backend/node_modules/pdf-lib');

const dir = path.join(__dirname, 'qa_inspection');
const micro1 = fs.readFileSync(path.join(dir, 'ChatGPT_Image_Jul_11,_2026,_10_20_48_AM.png'));
const micro2 = fs.readFileSync(path.join(dir, 'Screenshot_2026-10-19_234658.png'));
const graph = fs.readFileSync(path.join(dir, 'Screenshot_2026-10-20_004725.png'));

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

async function renderMicrostructurePage(doc, images, pageNum) {
  const pageWidth = doc.page.width - 100;
  
  // Header
  doc.fontSize(14).fillColor('#1e3a5f').font('Helvetica-Bold')
    .text('Microstructure Images', 50, 50, { width: pageWidth });
  doc.moveTo(50, 72).lineTo(545, 72).strokeColor('#1e3a5f').lineWidth(1).stroke();

  const startY = 88;
  const availH = 700;
  const availW = 495;

  if (images.length === 0) {
    doc.fontSize(11).fillColor('#666666').font('Helvetica-Oblique')
      .text('No microstructure images uploaded for this product.', 50, 200, { width: availW, align: 'center' });
  } else if (images.length === 1) {
    const meta = await getImageDimensions(images[0]);
    const { width: w, height: h } = computeFit(meta.aspect, availW, availH);
    const x = 50 + (availW - w) / 2;
    const y = startY + (availH - h) / 2;
    doc.image(images[0], x, y, { width: w, height: h });
  } else if (images.length === 2) {
    const m0 = await getImageDimensions(images[0]);
    const m1 = await getImageDimensions(images[1]);
    const bothPortrait = m0.aspect < 0.9 && m1.aspect < 0.9;

    if (bothPortrait) {
      const colW = (availW - 15) / 2;
      const fit0 = computeFit(m0.aspect, colW, availH);
      const fit1 = computeFit(m1.aspect, colW, availH);
      doc.image(images[0], 50 + (colW - fit0.width) / 2, startY + (availH - fit0.height) / 2, { width: fit0.width, height: fit0.height });
      doc.image(images[1], 50 + colW + 15 + (colW - fit1.width) / 2, startY + (availH - fit1.height) / 2, { width: fit1.width, height: fit1.height });
    } else {
      const slotH = (availH - 20) / 2;
      const fit0 = computeFit(m0.aspect, availW, slotH);
      const fit1 = computeFit(m1.aspect, availW, slotH);
      doc.image(images[0], 50 + (availW - fit0.width) / 2, startY + (slotH - fit0.height) / 2, { width: fit0.width, height: fit0.height });
      doc.image(images[1], 50 + (availW - fit1.width) / 2, startY + slotH + 20 + (slotH - fit1.height) / 2, { width: fit1.width, height: fit1.height });
    }
  } else if (images.length >= 3) {
    const m0 = await getImageDimensions(images[0]);
    const m1 = await getImageDimensions(images[1]);
    const m2 = await getImageDimensions(images[2]);
    const rowH = (availH - 20) / 2;
    const colW = (availW - 15) / 2;

    const fit0 = computeFit(m0.aspect, colW, rowH);
    const fit1 = computeFit(m1.aspect, colW, rowH);
    const fit2 = computeFit(m2.aspect, availW * 0.75, rowH);

    // Row 1
    doc.image(images[0], 50 + (colW - fit0.width) / 2, startY + (rowH - fit0.height) / 2, { width: fit0.width, height: fit0.height });
    doc.image(images[1], 50 + colW + 15 + (colW - fit1.width) / 2, startY + (rowH - fit1.height) / 2, { width: fit1.width, height: fit1.height });
    // Row 2 (centered)
    doc.image(images[2], 50 + (availW - fit2.width) / 2, startY + rowH + 20 + (rowH - fit2.height) / 2, { width: fit2.width, height: fit2.height });
  }

  // Footer
  const oldBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.fontSize(8).fillColor('#999999').font('Helvetica').text(`Page ${pageNum}`, 50, doc.page.height - 35, {
    width: pageWidth,
    align: 'center',
    lineBreak: false,
  });
  doc.page.margins.bottom = oldBottom;
}

async function testAllMicroCounts() {
  for (const count of [1, 2, 3]) {
    const testImgs = [micro1, micro2, graph].slice(0, count);
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 45, left: 50, right: 50 } });
    let pageCount = 0;
    doc.on('pageAdded', () => pageCount++);
    
    await renderMicrostructurePage(doc, testImgs, 2);
    doc.end();

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    await new Promise(res => doc.on('end', res));

    const pdf = await PDFLib.load(Buffer.concat(chunks));
    console.log(`Micro count = ${count}: Pages produced = ${pdf.getPageCount()} (extra pageAdded: ${pageCount})`);
  }
}

testAllMicroCounts().catch(console.error);

