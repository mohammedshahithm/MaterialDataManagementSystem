import { z } from 'zod';

// ── Batches ──────────────────────────────────────────────────

export const createBatchSchema = z.object({
  batchName: z.string().min(1, 'Batch name is required').max(100),
  description: z.string().max(500).optional(),
});

export const updateBatchSchema = z.object({
  batchName: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

// ── Date Folders ─────────────────────────────────────────────

export const createDateFolderSchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

// ── Products ─────────────────────────────────────────────────

export const createProductSchema = z.object({
  productName: z.string().min(1, 'Product name is required').max(200),
  productCode: z.string().min(1, 'Product code is required').max(50),
  metadata: z
    .object({
      material: z.string().optional(),
      grade: z.string().optional(),
      remarks: z.string().optional(),
    })
    .optional(),
});

export const updateProductSchema = z.object({
  productName: z.string().min(1).max(200).optional(),
  metadata: z
    .object({
      material: z.string().optional(),
      grade: z.string().optional(),
      remarks: z.string().optional(),
    })
    .optional(),
});

// ── Backup ───────────────────────────────────────────────────

export const backupConfirmationSchema = z.object({
  diskIdentifier: z.string().min(1, 'Hard disk identifier is required').max(200),
  destinationPath: z.string().max(500).optional(),
  archiveFilename: z.string().max(500).optional(),
  archiveChecksum: z.string().max(128).optional(),
  notes: z.string().max(1000).optional(),
});

// ── Settings ─────────────────────────────────────────────────

export const updateRetentionSettingsSchema = z.object({
  retentionDays: z.number().int().min(1).max(30).optional(),
  storageWarningGb: z.number().positive().max(100).optional(),
  maxFileSizeMb: z.number().int().positive().max(100).optional(),
  requiredCategories: z
    .array(z.enum(['microstructure', 'graph', 'source_pdf', 'whatsapp_image']))
    .optional(),
});

// ── Type exports ─────────────────────────────────────────────

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;
export type CreateDateFolderInput = z.infer<typeof createDateFolderSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type BackupConfirmationInput = z.infer<typeof backupConfirmationSchema>;
export type UpdateRetentionSettingsInput = z.infer<typeof updateRetentionSettingsSchema>;
