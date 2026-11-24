import type { OrderRecord } from './order.repository';
import type {
  OrderView,
  PaymentOrderView,
  PricingResult,
  PricingTotals,
} from './order.types';

export function toOrderPricing(pricing: PricingResult): PricingTotals {
  return {
    subtotal: pricing.subtotal,
    discountAmount: pricing.discountAmount,
    serviceAmount: pricing.serviceAmount,
    taxAmount: pricing.taxAmount,
    total: pricing.total,
    taxRateBp: pricing.taxRateBp,
    taxInclusive: pricing.taxInclusive,
    taxBaseIncludesService: pricing.taxBaseIncludesService,
    serviceRateBp: pricing.serviceRateBp,
  };
}

export function toOrderItems(pricing: PricingResult) {
  return pricing.items.map((item) => ({
    menuItemId: item.menuItemId,
    nameSnapshot: item.nameSnapshot,
    unitPrice: item.unitPrice,
    qty: item.qty,
    notes: item.notes,
    lineTotal: item.lineTotal,
    modifiers: {
      create: item.modifiers.map((modifier) => ({
        modifierOptionId: modifier.modifierOptionId,
        nameSnapshot: modifier.nameSnapshot,
        priceDelta: modifier.priceDelta,
        qty: modifier.qty,
      })),
    },
  }));
}

export function toPaymentOrder(order: OrderRecord): PaymentOrderView {
  return {
    id: order.id,
    outletId: order.outletId,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    queueNumber: order.queueNumber,
    total: order.total,
    businessDate: order.businessDate,
    expiresAt: order.expiresAt,
    tableId: order.tableId,
    tableCode: order.table?.code ?? null,
  };
}

export function toAuditOrder(order: OrderRecord) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    total: order.total,
    queueNumber: order.queueNumber,
  };
}

export function toView(order: OrderRecord): OrderView {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    source: order.source,
    status: order.status,
    paymentStatus: order.paymentStatus,
    table: order.table,
    sessionId: order.sessionId,
    queueNumber: order.queueNumber,
    queueDisplay:
      order.queueNumber === null
        ? null
        : `A-${String(order.queueNumber).padStart(3, '0')}`,
    customerName: order.customerName,
    notes: order.notes,
    currency: order.currency,
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    serviceAmount: order.serviceAmount,
    taxAmount: order.taxAmount,
    total: order.total,
    taxInclusive: order.taxInclusive,
    taxBaseIncludesService: order.taxBaseIncludesService,
    taxRateBp: order.taxRateBp,
    serviceRateBp: order.serviceRateBp,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
    preparingAt: order.preparingAt,
    readyAt: order.readyAt,
    servedAt: order.servedAt,
    cancelledAt: order.cancelledAt,
    cancelReason: order.cancelReason,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      nameSnapshot: item.nameSnapshot,
      unitPrice: item.unitPrice,
      qty: item.qty,
      notes: item.notes,
      lineTotal: item.lineTotal,
      modifiers: item.modifiers.map((modifier) => ({
        id: modifier.id,
        modifierOptionId: modifier.modifierOptionId,
        nameSnapshot: modifier.nameSnapshot,
        priceDelta: modifier.priceDelta,
        qty: modifier.qty,
      })),
    })),
    payments: order.payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      method: payment.method,
      status: payment.status,
      amount: payment.amount,
      paidAt: payment.paidAt,
    })),
  };
}
