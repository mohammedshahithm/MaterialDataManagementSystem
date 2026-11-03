const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('../backend/node_modules/pdf-lib');

async function inspectCorrected() {
  const p = path.join(__dirname, 'qa_inspection/PRD_-001-CORRECTED-report.pdf');
  const buf = fs.readFileSync(p);
  const pdf = await PDFDocument.load(buf);

  console.log('=== INSPECTION OF CORRECTED PDF ===');
  console.log(`Total Pages: ${pdf.getPageCount()}`);
  for (let i = 0; i < pdf.getPageCount(); i++) {
    const page = pdf.getPage(i);
    const { width, height } = page.getSize();
    console.log(`Page ${i + 1}: ${width.toFixed(1)} x ${height.toFixed(1)} pt (${(width/72*25.4).toFixed(0)} x ${(height/72*25.4).toFixed(0)} mm)`);
  }
}

inspectCorrected().catch(console.error);

