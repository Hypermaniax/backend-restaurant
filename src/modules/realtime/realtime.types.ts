import type { DisplayQueueItem, KdsOrderView } from '../orders/order.types';

export interface OrderRealtimePayload {
  order: KdsOrderView;
}

export interface OrderStatusRealtimePayload {
  order: KdsOrderView;
  fromStatus: string;
  toStatus: string;
}

export interface QueueRealtimePayload {
  queue: DisplayQueueItem;
}
