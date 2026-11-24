import {
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentStatus,
  UserRole,
} from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { RealtimeService } from '../realtime/realtime.service';
import type { TableSessionService } from '../tables/table-session.service';
import type { AuthUser } from '../security/types/auth-user';
import { OrderFulfillmentService } from './order-fulfillment.service';
import type { OrderRecord, OrderRepository } from './order.repository';

const actor: AuthUser = {
  userId: 'kitchen-1',
  outletId: 'outlet-1',
  role: UserRole.KITCHEN,
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
    queueNumber: 3,
    queueAssignedAt: new Date('2026-11-22T00:05:00.000Z'),
    status: OrderStatus.PAID,
    paymentStatus: PaymentStatus.PAID,
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
    paidAt: new Date('2026-11-22T00:05:00.000Z'),
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
    transition: jest.fn(),
    createStatusLog: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const realtime = {
    emitOrderStatusChanged: jest.fn(),
    emitQueueUpdated: jest.fn(),
  };
  const sessions = { closeIfIdle: jest.fn() };
  const service = new OrderFulfillmentService(
    prisma as unknown as PrismaService,
    orders as unknown as OrderRepository,
    audit as unknown as AuditService,
    realtime as unknown as RealtimeService,
    sessions as unknown as TableSessionService,
  );
  return { service, orders, audit, realtime, sessions };
}

describe('OrderFulfillmentService', () => {
  it('moves a KDS order forward and emits realtime events', async () => {
    const { service, orders, realtime } = buildService();
    orders.findById
      .mockResolvedValueOnce(orderRecord())
      .mockResolvedValueOnce(expectedPreparingOrder());
    orders.transition.mockResolvedValue(true);

    const result = await service.updateKdsStatus(
      'outlet-1',
      'order-1',
      actor,
      OrderStatus.PREPARING,
    );

    expect(result.status).toBe(OrderStatus.PREPARING);
    expect(orders.transition).toHaveBeenCalledWith(
      'outlet-1',
      'order-1',
      [OrderStatus.PAID],
      expect.objectContaining({ status: OrderStatus.PREPARING }),
      expect.anything(),
    );
    expect(orders.createStatusLog).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: OrderStatus.PAID,
        toStatus: OrderStatus.PREPARING,
        source: 'KITCHEN',
      }),
      expect.anything(),
    );
    expect(realtime.emitOrderStatusChanged).toHaveBeenCalledWith(
      'outlet-1',
      expect.objectContaining({
        fromStatus: OrderStatus.PAID,
        toStatus: OrderStatus.PREPARING,
      }),
    );
    expect(realtime.emitQueueUpdated).toHaveBeenCalledWith('outlet-1', {
      queue: {
        queueNumber: 3,
        orderType: OrderType.DINE_IN,
        tableCode: 'T01',
        status: OrderStatus.PREPARING,
      },
    });
  });

  it('auto-closes an idle table session after the last order is served', async () => {
    const { service, orders, sessions } = buildService();
    orders.findById
      .mockResolvedValueOnce(orderRecord({ status: OrderStatus.READY }))
      .mockResolvedValueOnce(
        orderRecord({
          status: OrderStatus.SERVED,
          servedAt: new Date('2026-11-22T00:20:00.000Z'),
        }),
      );
    orders.transition.mockResolvedValue(true);

    await service.updateKdsStatus(
      'outlet-1',
      'order-1',
      actor,
      OrderStatus.SERVED,
    );

    expect(sessions.closeIfIdle).toHaveBeenCalledWith('outlet-1', 'session-1');
  });
});

function expectedPreparingOrder(): OrderRecord {
  return orderRecord({
    status: OrderStatus.PREPARING,
    preparingAt: new Date('2026-11-22T00:10:00.000Z'),
  });
}
