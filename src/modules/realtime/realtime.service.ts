import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import type {
  OrderRealtimePayload,
  OrderStatusRealtimePayload,
  QueueRealtimePayload,
} from './realtime.types';

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  emitOrderCreated(outletId: string, payload: OrderRealtimePayload) {
    this.gateway.emitToRoom(
      this.cashierRoom(outletId),
      'order.created',
      payload,
    );
  }

  emitOrderPaid(outletId: string, payload: OrderRealtimePayload) {
    const event = 'order.paid';
    this.gateway.emitToRoom(this.kdsRoom(outletId), event, payload);
    this.gateway.emitToRoom(this.cashierRoom(outletId), event, payload);
  }

  emitOrderStatusChanged(
    outletId: string,
    payload: OrderStatusRealtimePayload,
  ) {
    const event = 'order.status_changed';
    this.gateway.emitToRoom(this.kdsRoom(outletId), event, payload);
    this.gateway.emitToRoom(this.cashierRoom(outletId), event, payload);
  }

  emitOrderCancelled(outletId: string, payload: OrderRealtimePayload) {
    const event = 'order.cancelled';
    this.gateway.emitToRoom(this.kdsRoom(outletId), event, payload);
    this.gateway.emitToRoom(this.cashierRoom(outletId), event, payload);
  }

  emitSessionClosed(
    outletId: string,
    payload: { sessionId: string; tableId: string },
  ) {
    this.gateway.emitToRoom(
      this.cashierRoom(outletId),
      'session.closed',
      payload,
    );
  }

  emitTableUpdated(
    outletId: string,
    payload: { tableId: string; status: string },
  ) {
    this.gateway.emitToRoom(
      this.cashierRoom(outletId),
      'table.updated',
      payload,
    );
  }

  emitMenuUpdated(
    outletId: string,
    payload: { menuItemId: string; isAvailable: boolean },
  ) {
    this.gateway.emitToRoom(
      this.cashierRoom(outletId),
      'menu.updated',
      payload,
    );
  }

  emitQueueUpdated(outletId: string, payload: QueueRealtimePayload) {
    this.gateway.emitToRoom(
      this.displayRoom(outletId),
      'queue.updated',
      payload,
    );
  }

  private kdsRoom(outletId: string): string {
    return `outlet:${outletId}:kds`;
  }

  private cashierRoom(outletId: string): string {
    return `outlet:${outletId}:cashier`;
  }

  private displayRoom(outletId: string): string {
    return `outlet:${outletId}:display`;
  }
}
