import cron from 'node-cron';
import prisma from '../config/database';
import { getRuntimeSettings } from '../services/settingsService';
import { evaluateBatchRetention } from '../services/retentionService';

const RETENTION_ADVISORY_LOCK_ID = 882736192; // 32-bit unique identifier for MDMS retention lock

/**
 * Execute retention check idempotently with a distributed PostgreSQL advisory lock.
 * This guarantees mutual exclusion even if multiple clustered instances attempt to run.
 *
 * NOTE: As per company policy, this job NEVER automatically deletes batches or cloud files.
 * Batches inactive for 5+ days are marked as eligible for deletion, and workers must
 * delete them manually through the explicit confirmation dialog.
 */
export async function runRetentionCheck(): Promise<void> {
  let lockAcquired = false;

  try {
    // Attempt to acquire non-blocking PostgreSQL advisory lock
    const lockResult: any = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${RETENTION_ADVISORY_LOCK_ID}) as acquired`;
    lockAcquired = Boolean(lockResult?.[0]?.acquired);

    if (!lockAcquired) {
      console.log('[CRON] Another instance is currently executing the retention check. Skipping.');
      return;
    }

    console.log('[CRON] Acquired retention lock. Running checks...');
    const now = new Date();

    // 1. Clean up stale unconfirmed pending uploads older than 1 hour
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const cleaned = await prisma.productFile.updateMany({
      where: {
        uploadStatus: 'pending',
        uploadedAt: { lt: oneHourAgo },
      },
      data: { uploadStatus: 'failed' },
    });

    if (cleaned.count > 0) {
      console.log(`[CRON] Marked ${cleaned.count} stale pending uploads as failed`);
    }

    // 2. Inspect active batches for inactivity retention eligibility
    const runtime = await getRuntimeSettings();
    const retentionDays = runtime.retentionDays || 5;

    const batches = await prisma.batch.findMany({
      where: { status: { not: 'deleted' } },
      include: {
        dateFolders: {
          include: {
            products: {
              include: {
                files: {
                  where: { uploadStatus: 'confirmed' },
                  select: { uploadedAt: true, deletedAt: true },
                },
              },
            },
          },
        },
      },
    });

    let eligibleCount = 0;
    for (const batch of batches) {
      const retention = evaluateBatchRetention(batch, retentionDays, now);

      if (retention.isEligibleForDeletion) {
        eligibleCount++;
        console.log(
          `[CRON] Batch "${batch.batchName}" (ID: ${batch.id}) has been inactive for ${retention.inactivityDays} days (threshold: ${retentionDays} days). Marked eligible for deletion. (NO automatic deletion will be performed).`
        );

        // Keep backupDueAt synchronized with retentionDueAt if changed
        if (!batch.backupDueAt || batch.backupDueAt.getTime() !== retention.retentionDueAt.getTime()) {
          await prisma.batch.update({
            where: { id: batch.id },
            data: { backupDueAt: retention.retentionDueAt },
          });
        }
      }
    }

    console.log(
      `[CRON] Retention check completed. Inspected ${batches.length} batches; ${eligibleCount} currently eligible for manual deletion.`
    );
  } catch (err) {
    console.error('[CRON] Retention check error:', err);
  } finally {
    if (lockAcquired) {
      try {
        await prisma.$queryRaw`SELECT pg_advisory_unlock(${RETENTION_ADVISORY_LOCK_ID})`;
      } catch (unlockErr) {
        console.error('[CRON] Error releasing retention advisory lock:', unlockErr);
      }
    }
  }
}

/**
 * Scheduled job: Check batch retention statuses and stale uploads.
 * Runs every hour.
 */
export function startRetentionJob() {
  cron.schedule('0 * * * *', async () => {
    await runRetentionCheck();
  });

  console.log('[CRON] Retention check job scheduled (hourly) with PostgreSQL distributed locking');
}
