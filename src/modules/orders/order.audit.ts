import type { Prisma } from '../../generated/prisma/client';
import type { AuditService } from '../audit/audit.service';

export async function recordQueueAssigned(
  audit: AuditService,
  outletId: string,
  orderId: string,
  queueNumber: number | null,
  actorUserId: string | undefined,
  tx: Prisma.TransactionClient,
): Promise<void> {
  if (queueNumber === null) {
    return;
  }
  await audit.record(
    {
      outletId,
      actorUserId,
      action: 'QUEUE_ASSIGNED',
      entityType: 'order',
      entityId: orderId,
      after: {
        queueNumber,
        queueDisplay: `A-${String(queueNumber).padStart(3, '0')}`,
      },
    },
    tx,
  );
}
