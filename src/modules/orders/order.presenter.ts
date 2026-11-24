import type { OrderRecord } from './order.repository';
import type { DisplayQueueItem, KdsOrderView } from './order.types';

export function toKdsOrderView(order: OrderRecord): KdsOrderView {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    source: order.source,
    status: order.status,
    queueNumber: order.queueNumber,
    queueDisplay:
      order.queueNumber === null
        ? null
        : `A-${String(order.queueNumber).padStart(3, '0')}`,
    tableCode: order.table?.code ?? null,
    tableName: order.table?.name ?? null,
    customerName: order.customerName,
    notes: order.notes,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    preparingAt: order.preparingAt,
    readyAt: order.readyAt,
    servedAt: order.servedAt,
    items: order.items.map((item) => ({
      id: item.id,
      nameSnapshot: item.nameSnapshot,
      qty: item.qty,
      notes: item.notes,
      modifiers: item.modifiers.map((modifier) => ({
        nameSnapshot: modifier.nameSnapshot,
        qty: modifier.qty,
      })),
    })),
  };
}

export function toDisplayQueueItem(
  order: OrderRecord,
): DisplayQueueItem | null {
  if (order.queueNumber === null) {
    return null;
  }
  return {
    queueNumber: order.queueNumber,
    orderType: order.orderType,
    tableCode: order.table?.code ?? null,
    status: order.status,
  };
}
