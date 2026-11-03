const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const { createClient } = require('../backend/node_modules/@supabase/supabase-js');
const { PDFDocument } = require('../backend/node_modules/pdf-lib');
require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const prisma = new PrismaClient();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const outDir = path.join(__dirname, 'qa_inspection');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const product = await prisma.product.findUnique({
    where: { id: '9e010cdc-ae09-424d-881c-97aad490dcf2' },
    include: { files: { where: { deletedAt: null } } },
  });

  console.log('Downloading files for product:', product.productCode);

  for (const f of product.files) {
    console.log(`Downloading [${f.category}] ${f.originalFilename}...`);
    const { data, error } = await supabase.storage.from(process.env.SUPABASE_STORAGE_BUCKET || 'material-data').download(f.storageKey);
    if (error) {
      console.error('Error downloading:', f.storageKey, error);
      continue;
    }
    const buf = Buffer.from(await data.arrayBuffer());
    const savePath = path.join(outDir, f.originalFilename.replace(/\s+/g, '_'));
    fs.writeFileSync(savePath, buf);
    console.log(`Saved ${savePath} (${buf.length} bytes)`);

    if (f.originalFilename.endsWith('.pdf')) {
      const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
      console.log(`  -> PDF Page Count: ${pdf.getPageCount()}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

