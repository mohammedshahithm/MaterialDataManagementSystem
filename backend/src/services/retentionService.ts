import { addDays, isBefore } from 'date-fns';
import { getRuntimeSettings } from './settingsService';

export interface BatchActivitySource {
  createdAt: Date;
  dateFolders?: Array<{
    createdAt: Date;
    products?: Array<{
      createdAt: Date;
      updatedAt: Date;
      files?: Array<{
        uploadedAt: Date;
        deletedAt?: Date | null;
      }>;
    }>;
  }>;
}

export interface RetentionStatus {
  lastActivityAt: Date;
  retentionDueAt: Date;
  inactivityDays: number;
  isEligibleForDeletion: boolean;
  retentionDays: number;
}

/**
 * Calculate the latest activity timestamp for a batch across:
 * - Batch creation
 * - Date folder creation
 * - Product creation and updates
 * - File uploads and deletions
 */
export function calculateBatchLastActivity(batch: BatchActivitySource): Date {
  let latest = new Date(batch.createdAt);

  if (batch.dateFolders && Array.isArray(batch.dateFolders)) {
    for (const df of batch.dateFolders) {
      const dfCreated = new Date(df.createdAt);
      if (dfCreated.getTime() > latest.getTime()) {
        latest = dfCreated;
      }

      if (df.products && Array.isArray(df.products)) {
        for (const p of df.products) {
          const pCreated = new Date(p.createdAt);
          if (pCreated.getTime() > latest.getTime()) {
            latest = pCreated;
          }

          const pUpdated = new Date(p.updatedAt);
          if (pUpdated.getTime() > latest.getTime()) {
            latest = pUpdated;
          }

          if (p.files && Array.isArray(p.files)) {
            for (const f of p.files) {
              const fUploaded = new Date(f.uploadedAt);
              if (fUploaded.getTime() > latest.getTime()) {
                latest = fUploaded;
              }

              if (f.deletedAt) {
                const fDeleted = new Date(f.deletedAt);
                if (fDeleted.getTime() > latest.getTime()) {
                  latest = fDeleted;
                }
              }
            }
          }
        }
      }
    }
  }

  return latest;
}

/**
 * Calculate full retention status for a batch:
 * - Default retention period is 5 days (or from runtime settings)
 * - Expiry occurs when now >= retentionDueAt
 * - Active batches do not expire while workers are using them
 */
export function evaluateBatchRetention(
  batch: BatchActivitySource,
  retentionDays: number = 5,
  referenceDate: Date = new Date()
): RetentionStatus {
  const lastActivityAt = calculateBatchLastActivity(batch);
  const retentionDueAt = addDays(lastActivityAt, retentionDays);
  const isEligibleForDeletion = !isBefore(referenceDate, retentionDueAt); // referenceDate >= retentionDueAt

  const diffMs = Math.max(0, referenceDate.getTime() - lastActivityAt.getTime());
  const inactivityDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  return {
    lastActivityAt,
    retentionDueAt,
    inactivityDays,
    isEligibleForDeletion,
    retentionDays,
  };
}

