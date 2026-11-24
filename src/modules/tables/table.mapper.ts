import type { TableSession } from '../../generated/prisma/client';
import type { TableSessionView } from './table.types';

export function toSessionView(
  session: Pick<
    TableSession,
    | 'id'
    | 'tableId'
    | 'status'
    | 'guestCount'
    | 'openedAt'
    | 'closedAt'
    | 'closedByUserId'
  >,
): TableSessionView {
  return {
    id: session.id,
    tableId: session.tableId,
    status: session.status,
    guestCount: session.guestCount,
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    closedByUserId: session.closedByUserId,
  };
}
