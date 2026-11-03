const fs = require('fs');
const path = require('path');
const PDFDocument = require('../backend/node_modules/pdfkit');
const { PDFDocument: PDFLib, StandardFonts, rgb } = require('../backend/node_modules/pdf-lib');

async function testApproach1() {
  // Approach 1: PDFKit with margin safeguard
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 60, bottom: 60, left: 50, right: 50 }
  });
  let extraPages = 0;
  doc.on('pageAdded', () => extraPages++);

  const chunks = [];
  doc.on('data', c => chunks.push(c));

  const addPageNum = (p) => {
    const old = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fontSize(8).fillColor('#999999').text(`Page ${p}`, 50, doc.page.height - 35, {
      width: doc.page.width - 100,
      align: 'center',
      lineBreak: false,
    });
    doc.page.margins.bottom = old;
  };

  doc.text('Cover');
  addPageNum(1);

  doc.addPage();
  doc.text('Microstructure');
  addPageNum(2);

  doc.addPage();
  doc.text('Graph');
  addPageNum(3);

  doc.addPage();
  doc.text('WhatsApp');
  addPageNum(9);

  doc.end();

  await new Promise(res => doc.on('end', res));
  const pdf1 = await PDFLib.load(Buffer.concat(chunks));
  console.log('Approach 1 (PDFKit safe margin): Total pages =', pdf1.getPageCount(), '| extra pageAdded =', extraPages);
}

async function testApproach2() {
  // Approach 2: pdf-lib footer stamping
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 60, bottom: 60, left: 50, right: 50 }
  });
  let extraPages = 0;
  doc.on('pageAdded', () => extraPages++);

  const chunks = [];
  doc.on('data', c => chunks.push(c));

  doc.text('Cover');
  doc.addPage();
  doc.text('Microstructure');
  doc.addPage();
  doc.text('Graph');
  doc.addPage();
  doc.text('WhatsApp');
  doc.end();

  await new Promise(res => doc.on('end', res));
  const pdfKitBuf = Buffer.concat(chunks);
  const loaded = await PDFLib.load(pdfKitBuf);
  const merged = await PDFLib.create();
  const font = await merged.embedFont(StandardFonts.Helvetica);

  const copied = await merged.copyPages(loaded, loaded.getPageIndices());
  const pageNumbers = [1, 2, 3, 9];
  copied.forEach((p, idx) => {
    const text = `Page ${pageNumbers[idx]}`;
    const textWidth = font.widthOfTextAtSize(text, 8);
    const { width } = p.getSize();
    p.drawText(text, {
      x: (width - textWidth) / 2,
      y: 25,
      size: 8,
      font,
      color: rgb(0.6, 0.6, 0.6),
    });
    merged.addPage(p);
  });

  console.log('Approach 2 (pdf-lib stamping): Total pages =', merged.getPageCount(), '| extra pageAdded =', extraPages);
}

Promise.all([testApproach1(), testApproach2()]).catch(console.error);

