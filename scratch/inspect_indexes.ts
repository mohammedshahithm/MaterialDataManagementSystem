import prisma from '../backend/src/config/database';

async function inspectIndexes() {
  const indexes: any = await prisma.$queryRaw`
    SELECT
      tablename,
      indexname,
      indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname;
  `;

  console.log('--- Current Database Indexes ---');
  for (const idx of indexes) {
    console.log(`${idx.tablename}: ${idx.indexname}`);
  }

  await prisma.$disconnect();
}

inspectIndexes().catch(console.error);

