import { describe, it, expect } from 'vitest';
import {
  createBatchSchema,
  updateBatchSchema,
  createDateFolderSchema,
  createProductSchema,
  updateProductSchema,
  backupConfirmationSchema,
  updateRetentionSettingsSchema,
} from '../../src/validators';

describe('Zod Validators Unit Tests', () => {
  describe('createBatchSchema', () => {
    it('accepts valid batch name and description', () => {
      const result = createBatchSchema.safeParse({
        batchName: 'Batch 2026-W44',
        description: 'Weekly production run',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty batch name', () => {
      const result = createBatchSchema.safeParse({ batchName: '' });
      expect(result.success).toBe(false);
    });

    it('accepts batch name without description', () => {
      const result = createBatchSchema.safeParse({ batchName: 'Batch 1' });
      expect(result.success).toBe(true);
    });
  });

  describe('createDateFolderSchema', () => {
    it('accepts valid YYYY-MM-DD date', () => {
      const result = createDateFolderSchema.safeParse({ workDate: '2026-11-01' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid date format', () => {
      expect(createDateFolderSchema.safeParse({ workDate: '01-11-2026' }).success).toBe(false);
      expect(createDateFolderSchema.safeParse({ workDate: '2026/11/01' }).success).toBe(false);
      expect(createDateFolderSchema.safeParse({ workDate: 'invalid' }).success).toBe(false);
    });
  });

  describe('createProductSchema', () => {
    it('accepts valid product with metadata', () => {
      const result = createProductSchema.safeParse({
        productName: 'Titanium Rod Specimen',
        productCode: 'PROD-TI-001',
        metadata: {
          material: 'Ti-6Al-4V',
          grade: 'Grade 5',
          remarks: 'Tested after annealing',
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing product code or name', () => {
      expect(createProductSchema.safeParse({ productName: 'Sample' }).success).toBe(false);
      expect(createProductSchema.safeParse({ productCode: 'P-1' }).success).toBe(false);
    });
  });

  describe('backupConfirmationSchema', () => {
    it('accepts valid backup confirmation with disk identifier', () => {
      const result = backupConfirmationSchema.safeParse({
        diskIdentifier: 'HDD-SEAGATE-01',
        destinationPath: 'E:\\Backups\\Batch-1',
        notes: 'Copied and verified manually',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing disk identifier', () => {
      const result = backupConfirmationSchema.safeParse({
        destinationPath: 'E:\\Backups',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateRetentionSettingsSchema', () => {
    it('accepts valid retention settings', () => {
      const result = updateRetentionSettingsSchema.safeParse({
        retentionDays: 7,
        storageWarningGb: 0.8,
        maxFileSizeMb: 25,
      });
      expect(result.success).toBe(true);
    });

    it('rejects retention days out of allowed range (1-30)', () => {
      expect(updateRetentionSettingsSchema.safeParse({ retentionDays: 0 }).success).toBe(false);
      expect(updateRetentionSettingsSchema.safeParse({ retentionDays: 31 }).success).toBe(false);
    });
  });
});
