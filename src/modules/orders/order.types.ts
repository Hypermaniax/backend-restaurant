import type {
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from '../../generated/prisma/client';

export interface OrderItemInput {
  menuItemId: string;
  qty: number;
  modifierOptionIds?: string[];
  notes?: string | null;
}

export interface PricedModifier {
  modifierOptionId: string;
  nameSnapshot: string;
  priceDelta: number;
  qty: number;
}

export interface PricedItem {
  menuItemId: string;
  nameSnapshot: string;
  unitPrice: number;
  qty: number;
  notes: string | null;
  lineTotal: number;
  modifiers: PricedModifier[];
}

export interface PricingTotals {
  subtotal: number;
  discountAmount: number;
  serviceAmount: number;
  taxAmount: number;
  total: number;
  taxInclusive: boolean;
  taxBaseIncludesService: boolean;
  taxRateBp: number;
  serviceRateBp: number;
}

export interface PricingResult extends PricingTotals {
  items: PricedItem[];
}

export interface OrderItemView {
  id: string;
  menuItemId: string | null;
  nameSnapshot: string;
  unitPrice: number;
  qty: number;
  notes: string | null;
  lineTotal: number;
  modifiers: Array<{
    id: string;
    modifierOptionId: string | null;
    nameSnapshot: string;
    priceDelta: number;
    qty: number;
  }>;
}

export interface OrderPaymentView {
  id: string;
  provider: PaymentProvider;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  paidAt: Date | null;
}

export interface OrderView extends PricingTotals {
  id: string;
  orderNumber: string;
  orderType: OrderType;
  source: OrderSource;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  table: {
    id: string;
    code: string;
    name: string;
  } | null;
  sessionId: string | null;
  queueNumber: number | null;
  queueDisplay: string | null;
  customerName: string | null;
  notes: string | null;
  currency: string;
  expiresAt: Date;
  paidAt: Date | null;
  preparingAt: Date | null;
  readyAt: Date | null;
  servedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  items: OrderItemView[];
  payments: OrderPaymentView[];
}

export interface PaymentOrderView {
  id: string;
  outletId: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  queueNumber: number | null;
  total: number;
  businessDate: Date;
  expiresAt: Date;
  tableId: string | null;
  tableCode: string | null;
}

export interface KdsOrderItemView {
  id: string;
  nameSnapshot: string;
  qty: number;
  notes: string | null;
  modifiers: Array<{
    nameSnapshot: string;
    qty: number;
  }>;
}

export interface KdsOrderView {
  id: string;
  orderNumber: string;
  orderType: OrderType;
  source: OrderSource;
  status: OrderStatus;
  queueNumber: number | null;
  queueDisplay: string | null;
  tableCode: string | null;
  tableName: string | null;
  customerName: string | null;
  notes: string | null;
  createdAt: Date;
  paidAt: Date | null;
  preparingAt: Date | null;
  readyAt: Date | null;
  servedAt: Date | null;
  items: KdsOrderItemView[];
}

export interface DisplayQueueItem {
  queueNumber: number;
  orderType: OrderType;
  tableCode: string | null;
  status: OrderStatus;
}

export interface DisplayQueueView {
  preparing: DisplayQueueItem[];
  ready: DisplayQueueItem[];
}

export interface OrderDashboardView {
  businessDate: Date;
  revenueToday: number;
  openTables: number;
  pendingPayments: number;
  kdsQueue: number;
}
