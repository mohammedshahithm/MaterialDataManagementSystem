const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PDFDocument } = require('../backend/node_modules/pdf-lib');

async function main() {
  const pdfPath = path.join(__dirname, 'qa_inspection/PRD_-001-report.pdf');
  const buf = fs.readFileSync(pdfPath);
  const pdf = await PDFDocument.load(buf);

  console.log(`=== ANALYZING ${pdf.getPageCount()} PAGES IN PRD -001-report.pdf ===\n`);

  for (let i = 0; i < pdf.getPageCount(); i++) {
    const page = pdf.getPage(i);
    const contents = page.node.Contents();
    let textSummary = '';
    
    const streams = [];
    if (contents) {
      if (contents.asArray) {
        streams.push(...contents.asArray());
      } else {
        streams.push(contents);
      }
    }

    for (const s of streams) {
      try {
        const bytes = s.getContents();
        let decompressed;
        try {
          decompressed = zlib.inflateSync(Buffer.from(bytes));
        } catch {
          decompressed = Buffer.from(bytes);
        }
        const str = decompressed.toString('latin1');
        const matches = str.match(/\((.*?)\)\s*Tj/g) || [];
        textSummary += ' ' + matches.map(m => m.replace(/\((.*?)\)\s*Tj/, '$1')).join(' | ');
      } catch (e) {
        textSummary += ' [Stream error: ' + e.message + ']';
      }
    }
    console.log(`Page ${i + 1}: ${textSummary.trim() || '(NO TEXT DETECTED / IMAGES ONLY)'}`);
  }
}

main().catch(console.error);
