const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('../backend/node_modules/pdf-lib');

async function main() {
  const pdfPath = path.join(__dirname, 'qa_inspection/PRD_-001-report.pdf');
  const buf = fs.readFileSync(pdfPath);
  const pdf = await PDFDocument.load(buf);

  console.log('Total pages in PRD -001-report.pdf:', pdf.getPageCount());

  // Let's inspect each page's size and structure
  for (let i = 0; i < pdf.getPageCount(); i++) {
    const page = pdf.getPage(i);
    const { width, height } = page.getSize();
    console.log(`Page ${i + 1}: ${width.toFixed(1)} x ${height.toFixed(1)} pt (${(width / 72 * 25.4).toFixed(0)} x ${(height / 72 * 25.4).toFixed(0)} mm)`);
  }
}

main().catch(console.error);

