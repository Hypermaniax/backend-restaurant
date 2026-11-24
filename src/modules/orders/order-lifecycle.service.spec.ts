import { BadRequestException } from '@nestjs/common';
import {
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  UserRole,
} from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { RealtimeService } from '../realtime/realtime.service';
import type { TableSessionService } from '../tables/table-session.service';
import type { OrderReceiptService } from './order-receipt.service';
import type { AuthUser } from '../security/types/auth-user';
import { OrderLifecycleService } from './order-lifecycle.service';
import type { OrderRecord, OrderRepository } from './order.repository';

const actor: AuthUser = {
  userId: 'cashier-1',
  outletId: 'outlet-1',
  role: UserRole.CASHIER,
};

function orderRecord(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'order-1',
    outletId: 'outlet-1',
    orderType: OrderType.DINE_IN,
    source: OrderSource.CUSTOMER_QR,
    createdByUserId: null,
    tableId: 'table-1',
    sessionId: 'session-1',
    orderNumber: '20261122-0001',
    idempotencyKey: null,
    businessDate: new Date('2026-11-22T00:00:00.000Z'),
    queueNumber: null,
    queueAssignedAt: null,
    status: OrderStatus.AWAITING_CASH,
    paymentStatus: PaymentStatus.PENDING,
    subtotal: 10000,
    taxAmount: 1050,
    serviceAmount: 500,
    discountAmount: 0,
    total: 11550,
    currency: 'IDR',
    customerName: null,
    notes: null,
    taxRateBp: 1000,
    taxInclusive: false,
    taxBaseIncludesService: true,
    serviceRateBp: 500,
    expiresAt: new Date('2026-11-22T01:00:00.000Z'),
    paidAt: null,
    preparingAt: null,
    readyAt: null,
    servedAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancelReason: null,
    createdAt: new Date('2026-11-22T00:30:00.000Z'),
    updatedAt: new Date('2026-11-22T00:30:00.000Z'),
    table: { id: 'table-1', code: 'T01', name: 'Meja 01' },
    items: [],
    payments: [],
    ...overrides,
  };
}

function buildService() {
  const prisma = {
    $transaction: jest.fn((callback: (tx: object) => unknown) =>
      Promise.resolve(callback({})),
    ),
  };
  const orders = {
    findById: jest.fn(),
    nextCounter: jest.fn(),
    transition: jest.fn(),
    createPayment: jest.fn(),
    expirePendingPayments: jest.fn(),
    createStatusLog: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const realtime = {
    emitOrderPaid: jest.fn(),
    emitQueueUpdated: jest.fn(),
    emitOrderCancelled: jest.fn(),
  };
  const sessions = { closeIfIdle: jest.fn() };
  const receipts = { sendForOrder: jest.fn() };
  const service = new OrderLifecycleService(
    prisma as unknown as PrismaService,
    orders as unknown as OrderRepository,
    audit as unknown as AuditService,
    realtime as unknown as RealtimeService,
    sessions as unknown as TableSessionService,
    receipts as unknown as OrderReceiptService,
  );
  return { service, prisma, orders, audit, realtime, sessions, receipts };
}

describe('OrderLifecycleService', () => {
  it('confirms cash payment and assigns a queue number', async () => {
    const { service, orders, audit, realtime } = buildService();
    orders.findById.mockResolvedValueOnce(orderRecord()).mockResolvedValueOnce(
      orderRecord({
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.PAID,
        queueNumber: 7,
        paidAt: new Date(),
      }),
    );
    orders.nextCounter.mockResolvedValue(7);
    orders.transition.mockResolvedValue(true);

    const result = await service.confirmPayment('outlet-1', 'order-1', actor, {
      paymentMethod: PaymentMethod.CASH,
    });

    expect(orders.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        method: PaymentMethod.CASH,
        status: PaymentStatus.PAID,
        amount: 11550,
      }),
      expect.anything(),
    );
    expect(orders.transition).toHaveBeenCalledWith(
      'outlet-1',
      'order-1',
      [OrderStatus.AWAITING_CASH, OrderStatus.PENDING_PAYMENT],
      expect.objectContaining({
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.PAID,
        queueNumber: 7,
      }),
      expect.anything(),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ORDER_PAYMENT_CONFIRMED' }),
      expect.anything(),
    );
    expect(realtime.emitOrderPaid).toHaveBeenCalled();
    expect(realtime.emitQueueUpdated).toHaveBeenCalled();
    expect(result.status).toBe(OrderStatus.PAID);
  });

  it('auto-closes an idle table session after cancelling the last order', async () => {
    const { service, orders, sessions } = buildService();
    orders.findById.mockResolvedValueOnce(orderRecord()).mockResolvedValueOnce(
      orderRecord({
        status: OrderStatus.CANCELLED,
        cancelReason: 'Customer membatalkan',
      }),
    );
    orders.transition.mockResolvedValue(true);

    await service.cancelOrder('outlet-1', 'order-1', actor, {
      reason: 'Customer membatalkan',
    });

    expect(sessions.closeIfIdle).toHaveBeenCalledWith('outlet-1', 'session-1');
  });

  it('rejects cancelling a paid order', async () => {
    const { service, orders } = buildService();
    orders.findById.mockResolvedValue(
      orderRecord({
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.PAID,
      }),
    );

    await expect(
      service.cancelOrder('outlet-1', 'order-1', actor, {
        reason: 'Customer membatalkan',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
