const fs = require('fs');
const path = require('path');
const PDFDocument = require('../backend/node_modules/pdfkit');
const { PDFDocument: PDFLib } = require('../backend/node_modules/pdf-lib');

async function testWithRealFiles() {
  const dir = path.join(__dirname, 'qa_inspection');
  const micro1 = fs.readFileSync(path.join(dir, 'ChatGPT_Image_Jul_11,_2026,_10_20_48_AM.png'));
  const micro2 = fs.readFileSync(path.join(dir, 'Screenshot_2026-10-19_234658.png'));
  const graph = fs.readFileSync(path.join(dir, 'Screenshot_2026-10-20_004725.png'));
  const wa = fs.readFileSync(path.join(dir, 'Screenshot_2026-10-18_082402.png'));
  const sourcePdfBuf = fs.readFileSync(path.join(dir, 'STRIPEQN1.pdf'));

  console.log('Real files loaded successfully.');

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 60, bottom: 60, left: 50, right: 50 }
  });

  const chunks = [];
  doc.on('data', c => chunks.push(c));
  doc.on('pageAdded', () => console.log('pageAdded fired! Current page count so far. y:', doc.y));

  const pageWidth = doc.page.width - 100;
  const pageHeight = doc.page.height - 120;
  let pageNumber = 1;

  const addPageNumber = () => {
    console.log('addPageNumber called for page', pageNumber, 'at doc.y =', doc.y);
    doc.fontSize(8).fillColor('#999999')
      .text(`Page ${pageNumber}`, 50, doc.page.height - 40, { align: 'center' });
    pageNumber++;
  };

  const addHeader = (title) => {
    doc.fontSize(14).fillColor('#1e3a5f').font('Helvetica-Bold')
      .text(title, { underline: false });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y)
      .strokeColor('#1e3a5f').lineWidth(1).stroke();
    doc.moveDown(0.5);
  };

  // Page 1: Cover
  console.log('--- Drawing Cover ---');
  doc.moveDown(3);
  doc.fontSize(10).fillColor('#888888').font('Helvetica')
    .text('MATERIAL DATA MANAGEMENT SYSTEM', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(24).fillColor('#1e3a5f').font('Helvetica-Bold')
    .text('Product Report', { align: 'center' });
  doc.moveDown(2);

  const infoItems = [
    ['Product ID', 'PRD -001'],
    ['Product Name', 'STEEL'],
    ['Batch', 'batch-03 week 3'],
    ['Date', '05-11-2026'],
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

  addPageNumber();

  // Page 2: Microstructure
  console.log('--- Drawing Microstructure ---');
  doc.addPage();
  addHeader('Microstructure Images');

  const microImages = [micro1, micro2];
  const imgW = (pageWidth - 20) / 2;
  const y = doc.y;
  doc.image(microImages[0], 50, y, { fit: [imgW, 300] });
  doc.image(microImages[1], 50 + imgW + 20, y, { fit: [imgW, 300] });
  doc.y = y + 310;

  addPageNumber();

  // Page 3: Graph
  console.log('--- Drawing Graph ---');
  doc.addPage();
  addHeader('Graph');
  doc.image(graph, { fit: [pageWidth, pageHeight - 80], align: 'center' });
  addPageNumber();

  // Page 4: WhatsApp
  console.log('--- Drawing WhatsApp ---');
  doc.addPage();
  addHeader('WhatsApp Image');
  doc.image(wa, { fit: [pageWidth, pageHeight - 80], align: 'center' });
  addPageNumber();

  doc.end();

  doc.on('end', async () => {
    const pdfKitBuffer = Buffer.concat(chunks);
    const generatedPdf = await PDFLib.load(pdfKitBuffer);
    console.log('\nPDFKit generated page count:', generatedPdf.getPageCount());

    const mergedPdf = await PDFLib.create();
    const genPages = await mergedPdf.copyPages(generatedPdf, generatedPdf.getPageIndices());
    genPages.forEach(p => mergedPdf.addPage(p));

    const sourcePdf = await PDFLib.load(sourcePdfBuf);
    const srcPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
    srcPages.forEach(p => mergedPdf.addPage(p));

    console.log('Total merged page count:', mergedPdf.getPageCount());
  });
}

testWithRealFiles().catch(console.error);

