import { describe, it, expect } from 'vitest';
import { addDays, subDays } from 'date-fns';
import {
  calculateBatchLastActivity,
  evaluateBatchRetention,
  BatchActivitySource,
} from '../../src/services/retentionService';

describe('Retention and Inactivity Lifecycle Calculations', () => {
  it('defaults to 5 days retention period and calculates retentionDueAt from lastActivityAt', () => {
    const baseDate = new Date('2026-11-01T10:00:00.000Z');
    const batch: BatchActivitySource = {
      createdAt: baseDate,
      dateFolders: [],
    };

    const status = evaluateBatchRetention(batch, 5, baseDate);
    expect(status.retentionDays).toBe(5);
    expect(status.lastActivityAt.toISOString()).toBe('2026-11-01T10:00:00.000Z');
    expect(status.retentionDueAt.toISOString()).toBe('2026-11-06T10:00:00.000Z');
    expect(status.isEligibleForDeletion).toBe(false);
    expect(status.inactivityDays).toBe(0);
  });

  it('determines last activity from the latest date folder creation', () => {
    const batchCreated = new Date('2026-10-20T08:00:00.000Z');
    const dfCreated = new Date('2026-10-25T14:00:00.000Z');

    const batch: BatchActivitySource = {
      createdAt: batchCreated,
      dateFolders: [
        {
          createdAt: dfCreated,
          products: [],
        },
      ],
    };

    const lastActivity = calculateBatchLastActivity(batch);
    expect(lastActivity.toISOString()).toBe(dfCreated.toISOString());
  });

  it('determines last activity from the latest product creation or update', () => {
    const batchCreated = new Date('2026-10-20T08:00:00.000Z');
    const dfCreated = new Date('2026-10-22T08:00:00.000Z');
    const productCreated = new Date('2026-10-24T10:00:00.000Z');
    const productUpdated = new Date('2026-10-26T16:30:00.000Z');

    const batch: BatchActivitySource = {
      createdAt: batchCreated,
      dateFolders: [
        {
          createdAt: dfCreated,
          products: [
            {
              createdAt: productCreated,
              updatedAt: productUpdated,
              files: [],
            },
          ],
        },
      ],
    };

    const lastActivity = calculateBatchLastActivity(batch);
    expect(lastActivity.toISOString()).toBe(productUpdated.toISOString());
  });

  it('determines last activity from latest file upload or file modification', () => {
    const batchCreated = new Date('2026-10-20T08:00:00.000Z');
    const dfCreated = new Date('2026-10-22T08:00:00.000Z');
    const productCreated = new Date('2026-10-24T10:00:00.000Z');
    const fileUploaded = new Date('2026-10-28T11:15:00.000Z');
    const fileDeleted = new Date('2026-10-29T09:45:00.000Z');

    const batch: BatchActivitySource = {
      createdAt: batchCreated,
      dateFolders: [
        {
          createdAt: dfCreated,
          products: [
            {
              createdAt: productCreated,
              updatedAt: productCreated,
              files: [
                { uploadedAt: fileUploaded, deletedAt: null },
                { uploadedAt: fileUploaded, deletedAt: fileDeleted },
              ],
            },
          ],
        },
      ],
    };

    const lastActivity = calculateBatchLastActivity(batch);
    expect(lastActivity.toISOString()).toBe(fileDeleted.toISOString());
  });

  it('marks batch as eligible for deletion when inactive for 5 or more days', () => {
    const lastActivity = new Date('2026-10-25T10:00:00.000Z');
    const batch: BatchActivitySource = {
      createdAt: lastActivity,
      dateFolders: [],
    };

    // Exactly 5 days later
    const exactly5DaysLater = new Date('2026-10-30T10:00:00.000Z');
    const statusAt5Days = evaluateBatchRetention(batch, 5, exactly5DaysLater);
    expect(statusAt5Days.isEligibleForDeletion).toBe(true);
    expect(statusAt5Days.inactivityDays).toBe(5);

    // 6 days later
    const sixDaysLater = new Date('2026-10-31T10:00:00.000Z');
    const statusAt6Days = evaluateBatchRetention(batch, 5, sixDaysLater);
    expect(statusAt6Days.isEligibleForDeletion).toBe(true);
    expect(statusAt6Days.inactivityDays).toBe(6);
  });

  it('active batches DO NOT expire while workers are using them', () => {
    // Original batch created 10 days ago
    const batchCreated = new Date('2026-10-20T10:00:00.000Z');
    const today = new Date('2026-10-30T10:00:00.000Z');

    // Without activity, it would be eligible for deletion
    const inactiveBatch: BatchActivitySource = {
      createdAt: batchCreated,
      dateFolders: [],
    };
    expect(evaluateBatchRetention(inactiveBatch, 5, today).isEligibleForDeletion).toBe(true);

    // BUT a worker uploaded a file yesterday (2026-10-29)
    const recentUpload = new Date('2026-10-29T15:00:00.000Z');
    const activeBatch: BatchActivitySource = {
      createdAt: batchCreated,
      dateFolders: [
        {
          createdAt: batchCreated,
          products: [
            {
              createdAt: batchCreated,
              updatedAt: recentUpload,
              files: [{ uploadedAt: recentUpload, deletedAt: null }],
            },
          ],
        },
      ],
    };

    const status = evaluateBatchRetention(activeBatch, 5, today);
    // Since last activity was yesterday, inactivity is < 1 day, NOT eligible for deletion!
    expect(status.isEligibleForDeletion).toBe(false);
    expect(status.inactivityDays).toBe(0); // or 0 full days
    expect(status.retentionDueAt.toISOString()).toBe(addDays(recentUpload, 5).toISOString());
  });

  it('respects custom retentionDays configured in settings', () => {
    const lastActivity = new Date('2026-11-01T00:00:00.000Z');
    const batch: BatchActivitySource = {
      createdAt: lastActivity,
      dateFolders: [],
    };

    // Custom 10 days retention
    const status10Days = evaluateBatchRetention(batch, 10, new Date('2026-11-07T00:00:00.000Z'));
    expect(status10Days.retentionDays).toBe(10);
    expect(status10Days.inactivityDays).toBe(6);
    expect(status10Days.isEligibleForDeletion).toBe(false); // only 6 days inactive, need 10
  });
});
