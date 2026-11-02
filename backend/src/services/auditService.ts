import prisma from '../config/database';

export async function logAudit(
  userId: string,
  action: string,
  entityType: string,
  entityId?: string,
  details?: Record<string, any>
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId: entityId || null,
        details: details ?? undefined,
      },
    });
  } catch (err) {
    // Don't let audit logging failures break the main operation
    console.error('Audit log failed:', err);
  }
}
