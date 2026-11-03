import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../../src/config/database';
import { v4 as uuidv4 } from 'uuid';

describe('Supabase PostgreSQL & Prisma Live Integration Tests', () => {
  const testRunId = uuidv4().substring(0, 8);
  const testUserEmail = `test-user-${testRunId}@mdms-test.local`;
  let testUserId: string;
  let testBatchId: string;
  let testDateFolderId: string;
  let testProductId: string;

  beforeAll(async () => {
    // Ensure BigInt serialization is globally available
    (BigInt.prototype as any).toJSON = function () {
      return this.toString();
    };

    // Create an isolated test user
    const user = await prisma.user.create({
      data: {
        email: testUserEmail,
        fullName: `QA Test Runner ${testRunId}`,
        role: 'worker',
      },
    });
    testUserId = user.id;
  }, 30000);

  afterAll(async () => {
    // Clean up only our explicitly created test records
    try {
      if (testProductId) {
        await prisma.downloadLog.deleteMany({ where: { productId: testProductId } });
        await prisma.productFile.deleteMany({ where: { productId: testProductId } });
        await prisma.product.deleteMany({ where: { id: testProductId } });
      }
      if (testDateFolderId) {
        await prisma.dateFolder.deleteMany({ where: { id: testDateFolderId } });
      }
      if (testBatchId) {
        await prisma.backupRecord.deleteMany({ where: { batchId: testBatchId } });
        await prisma.downloadLog.deleteMany({ where: { batchId: testBatchId } });
        await prisma.batch.deleteMany({ where: { id: testBatchId } });
      }
      if (testUserId) {
        await prisma.user.deleteMany({ where: { id: testUserId } });
      }
      await prisma.$disconnect();
    } catch (err) {
      console.warn('Test cleanup warning:', err);
    }
  }, 30000);

  it('connects to Supabase PostgreSQL database', async () => {
    const result = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 as result`;
    expect(result).toBeDefined();
    expect(result[0].result).toBe(1);
  });

  it('creates and lists a test Batch', async () => {
    const batch = await prisma.batch.create({
      data: {
        batchName: `QA-Batch-${testRunId}`,
        description: 'Automated Test Batch for QA Validation',
        createdById: testUserId,
      },
    });
    testBatchId = batch.id;

    expect(batch.id).toBeDefined();
    expect(batch.batchName).toBe(`QA-Batch-${testRunId}`);
    expect(batch.status).toBe('active');

    const fetched = await prisma.batch.findUnique({ where: { id: testBatchId } });
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(testBatchId);
  });

  it('creates a DateFolder inside the Batch and enforces uniqueness', async () => {
    const workDate = new Date('2026-11-01T00:00:00.000Z');
    const folder = await prisma.dateFolder.create({
      data: {
        batchId: testBatchId,
        workDate,
        createdById: testUserId,
      },
    });
    testDateFolderId = folder.id;

    expect(folder.id).toBeDefined();
    expect(folder.batchId).toBe(testBatchId);

    // Attempt duplicate date in the same batch — must fail
    await expect(
      prisma.dateFolder.create({
        data: {
          batchId: testBatchId,
          workDate,
          createdById: testUserId,
        },
      })
    ).rejects.toThrow();
  });

  it('creates a Product inside the DateFolder and enforces unique productCode', async () => {
    const productCode = `QA-PROD-${testRunId}`;
    const product = await prisma.product.create({
      data: {
        dateFolderId: testDateFolderId,
        productCode,
        productName: 'Stainless Steel Specimen 316L',
        metadata: { material: 'SS-316L', remarks: 'QA automated test run' },
        createdById: testUserId,
      },
    });
    testProductId = product.id;

    expect(product.id).toBeDefined();
    expect(product.productCode).toBe(productCode);

    // Attempt duplicate product code in the same date folder — must fail
    await expect(
      prisma.product.create({
        data: {
          dateFolderId: testDateFolderId,
          productCode,
          productName: 'Duplicate Code Product',
          createdById: testUserId,
        },
      })
    ).rejects.toThrow();
  });

  it('records a ProductFile with BigInt fileSize and serializes to JSON without errors', async () => {
    const file = await prisma.productFile.create({
      data: {
        productId: testProductId,
        category: 'microstructure',
        slotIndex: 0,
        originalFilename: 'qa-microstructure-1.jpg',
        storageKey: `${testBatchId}/${testDateFolderId}/${testProductId}/microstructure/${uuidv4()}.jpg`,
        mimeType: 'image/jpeg',
        fileSize: BigInt(2048576), // 2 MB
        uploadedById: testUserId,
        uploadStatus: 'confirmed',
        isLatest: true,
      },
    });

    expect(file.id).toBeDefined();
    expect(typeof file.fileSize).toBe('bigint');

    // Verify serialization via JSON.stringify does NOT throw
    const payload = { file };
    let jsonString = '';
    expect(() => {
      jsonString = JSON.stringify(payload);
    }).not.toThrow();
    expect(jsonString).toContain('"fileSize":"2048576"');
  });

  it('supports cascading query for batch detail without BigInt crashes', async () => {
    const batchWithDetails = await prisma.batch.findUnique({
      where: { id: testBatchId },
      include: {
        createdBy: { select: { fullName: true, email: true } },
        dateFolders: {
          include: {
            products: {
              include: {
                files: {
                  where: { deletedAt: null, uploadStatus: 'confirmed' },
                  select: { id: true, category: true, fileSize: true },
                },
              },
            },
          },
        },
        backupRecords: true,
      },
    });

    expect(batchWithDetails).not.toBeNull();
    expect(() => JSON.stringify(batchWithDetails)).not.toThrow();
  });
});
