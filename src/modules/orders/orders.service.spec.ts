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
import type { SettingsService } from '../settings/settings.service';
import type { TablesService } from '../tables/tables.service';
import type { RealtimeService } from '../realtime/realtime.service';
import type { AuthUser } from '../security/types/auth-user';
import type { OrderRecord, OrderRepository } from './order.repository';
import type { PricingResult } from './order.types';
import { OrdersService } from './orders.service';
import type { PricingService } from './pricing.service';

const actor: AuthUser = {
  userId: 'cashier-1',
  outletId: 'outlet-1',
  role: UserRole.CASHIER,
};

const pricing: PricingResult = {
  items: [
    {
      menuItemId: 'item-1',
      nameSnapshot: 'Nasi Goreng',
      unitPrice: 10000,
      qty: 1,
      notes: null,
      lineTotal: 10000,
      modifiers: [],
    },
  ],
  subtotal: 10000,
  discountAmount: 0,
  serviceAmount: 500,
  taxAmount: 1050,
  total: 11550,
  taxInclusive: false,
  taxBaseIncludesService: true,
  taxRateBp: 1000,
  serviceRateBp: 500,
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
    findOutlet: jest.fn(),
    findMenuItemsForOrder: jest.fn(),
    findByIdempotencyKey: jest.fn(),
    findById: jest.fn(),
    findFirstOutlet: jest.fn(),
    createOrder: jest.fn(),
    createPayment: jest.fn(),
    expirePendingPayments: jest.fn(),
    createStatusLog: jest.fn(),
    transition: jest.fn(),
    listCashierOrders: jest.fn(),
    listKdsOrders: jest.fn(),
    listDisplayOrders: jest.fn(),
    nextCounter: jest.fn(),
    sumRevenue: jest.fn(),
    countOpenTables: jest.fn(),
    countPendingPayments: jest.fn(),
    countKdsQueue: jest.fn(),
    findStaleOrders: jest.fn(),
  };
  const pricingService = {
    price: jest.fn(),
    quote: jest.fn(),
  };
  const settings = {
    getSettings: jest.fn(),
    getTaxRules: jest.fn(),
  };
  const tables = {
    resolvePublicTable: jest.fn(),
    ensureSessionForOrder: jest.fn(),
    requireSessionForOrder: jest.fn(),
  };
  const audit = {
    record: jest.fn(),
  };
  const realtime = {
    emitOrderCreated: jest.fn(),
    emitOrderPaid: jest.fn(),
    emitOrderStatusChanged: jest.fn(),
    emitOrderCancelled: jest.fn(),
    emitQueueUpdated: jest.fn(),
  };

  const service = new OrdersService(
    prisma as unknown as PrismaService,
    orders as unknown as OrderRepository,
    pricingService as unknown as PricingService,
    settings as unknown as SettingsService,
    tables as unknown as TablesService,
    audit as unknown as AuditService,
    realtime as unknown as RealtimeService,
  );

  return {
    service,
    prisma,
    orders,
    pricingService,
    settings,
    tables,
    audit,
    realtime,
  };
}

describe('OrdersService', () => {
  it('returns cashier orders with pagination metadata', async () => {
    const { service, orders } = buildService();
    orders.listCashierOrders.mockResolvedValue({
      items: [orderRecord()],
      total: 7,
    });

    const result = await service.listCashier('outlet-1', {
      page: 2,
      pageSize: 5,
    });

    expect(orders.listCashierOrders).toHaveBeenCalledWith('outlet-1', {
      page: 2,
      pageSize: 5,
    });
    expect(result.items).toHaveLength(1);
    expect(result.meta).toEqual({
      page: 2,
      pageSize: 5,
      total: 7,
      totalPages: 2,
    });
  });

  it('creates a customer order as AWAITING_CASH without a queue number', async () => {
    const { service, orders, pricingService, settings, tables } =
      buildService();
    tables.resolvePublicTable.mockResolvedValue({
      id: 'table-1',
      outlet: { id: 'outlet-1' },
    });
    orders.findByIdempotencyKey.mockResolvedValue(null);
    pricingService.price.mockResolvedValue(pricing);
    orders.findOutlet.mockResolvedValue({
      id: 'outlet-1',
      timezone: 'Asia/Jakarta',
    });
    settings.getSettings.mockResolvedValue({
      cashExpiryMinutes: 30,
      orderExpiryMinutes: 15,
    });
    tables.ensureSessionForOrder.mockResolvedValue({ id: 'session-1' });
    orders.nextCounter.mockResolvedValue(3);
    orders.createOrder.mockResolvedValue(
      orderRecord({
        idempotencyKey: 'idem-1',
        sessionId: 'session-1',
        orderNumber: '20261122-0003',
      }),
    );

    const result = await service.createPublicOrder(
      {
        tableCode: 'T01',
        items: [{ menuItemId: 'item-1', qty: 1 }],
      },
      'idem-1',
    );

    expect(orders.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderType: OrderType.DINE_IN,
        source: OrderSource.CUSTOMER_QR,
        status: OrderStatus.AWAITING_CASH,
        paymentStatus: PaymentStatus.PENDING,
        queueNumber: null,
        queueAssignedAt: null,
        sessionId: 'session-1',
        idempotencyKey: 'idem-1',
        orderNumber: expect.stringMatching(/^\d{8}-0003$/) as unknown,
      }),
      expect.anything(),
    );
    expect(result.status).toBe(OrderStatus.AWAITING_CASH);
    expect(result.queueNumber).toBeNull();
    expect(tables.ensureSessionForOrder).toHaveBeenCalledWith(
      'outlet-1',
      'table-1',
      expect.anything(),
    );
  });

  it('confirms cash payment and assigns a queue number', async () => {
    const { service, orders, audit } = buildService();
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
        queueNumber: 7,
      }),
      expect.anything(),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ORDER_PAYMENT_CONFIRMED' }),
      expect.anything(),
    );
    expect(result.status).toBe(OrderStatus.PAID);
    expect(result.queueDisplay).toBe('A-007');
  });

  it('rejects cancelling a paid order', async () => {
    const { service, orders, prisma } = buildService();
    orders.findById.mockResolvedValue(
      orderRecord({
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.PAID,
        queueNumber: 1,
      }),
    );

    await expect(
      service.cancelOrder('outlet-1', 'order-1', actor, {
        reason: 'Batal',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates a paid takeaway cashier order with a queue number', async () => {
    const { service, orders, pricingService, settings, tables } =
      buildService();
    orders.findByIdempotencyKey.mockResolvedValue(null);
    pricingService.price.mockResolvedValue({
      ...pricing,
      serviceAmount: 0,
      taxAmount: 0,
      total: 10000,
    });
    orders.findOutlet.mockResolvedValue({
      id: 'outlet-1',
      timezone: 'Asia/Jakarta',
    });
    settings.getSettings.mockResolvedValue({
      cashExpiryMinutes: 30,
      orderExpiryMinutes: 15,
    });
    orders.nextCounter.mockResolvedValueOnce(4).mockResolvedValueOnce(9);
    orders.createOrder.mockResolvedValue(
      orderRecord({
        orderType: OrderType.TAKEAWAY,
        source: OrderSource.CASHIER,
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.PAID,
        queueNumber: 9,
        tableId: null,
        sessionId: null,
        createdByUserId: 'cashier-1',
      }),
    );
    orders.findById.mockResolvedValue(
      orderRecord({
        orderType: OrderType.TAKEAWAY,
        source: OrderSource.CASHIER,
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.PAID,
        queueNumber: 9,
        tableId: null,
        sessionId: null,
      }),
    );

    const result = await service.createCashierOrder(
      'outlet-1',
      actor,
      {
        orderType: OrderType.TAKEAWAY,
        paymentMethod: PaymentMethod.CASH,
        items: [{ menuItemId: 'item-1', qty: 1 }],
      },
      'cashier-idem-1',
    );

    expect(orders.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderType: OrderType.TAKEAWAY,
        source: OrderSource.CASHIER,
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.PAID,
        queueNumber: 9,
        tableId: null,
        sessionId: null,
      }),
      expect.anything(),
    );
    expect(tables.requireSessionForOrder).not.toHaveBeenCalled();
    expect(orders.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'CASHIER',
        method: PaymentMethod.CASH,
        status: PaymentStatus.PAID,
      }),
      expect.anything(),
    );
    expect(result.queueNumber).toBe(9);
  });

  it('creates an unpaid cashier QRIS order without a queue', async () => {
    const { service, orders, pricingService, settings } = buildService();
    orders.findByIdempotencyKey.mockResolvedValue(null);
    pricingService.price.mockResolvedValue({
      ...pricing,
      serviceAmount: 0,
      taxAmount: 0,
      total: 10000,
    });
    orders.findOutlet.mockResolvedValue({
      id: 'outlet-1',
      timezone: 'Asia/Jakarta',
    });
    settings.getSettings.mockResolvedValue({
      cashExpiryMinutes: 30,
      orderExpiryMinutes: 15,
    });
    orders.nextCounter.mockResolvedValue(5);
    orders.createOrder.mockResolvedValue(
      orderRecord({
        orderType: OrderType.TAKEAWAY,
        source: OrderSource.CASHIER,
        status: OrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.PENDING,
        queueNumber: null,
        tableId: null,
        sessionId: null,
      }),
    );
    orders.findById.mockResolvedValue(
      orderRecord({
        orderType: OrderType.TAKEAWAY,
        source: OrderSource.CASHIER,
        status: OrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.PENDING,
        queueNumber: null,
        tableId: null,
        sessionId: null,
      }),
    );

    const result = await service.createCashierOrder('outlet-1', actor, {
      orderType: OrderType.TAKEAWAY,
      paymentMethod: PaymentMethod.QRIS,
      items: [{ menuItemId: 'item-1', qty: 1 }],
    });

    expect(orders.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        status: OrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.PENDING,
        queueNumber: null,
        paidAt: null,
      }),
      expect.anything(),
    );
    expect(orders.nextCounter).toHaveBeenCalledTimes(1);
    expect(orders.createPayment).not.toHaveBeenCalled();
    expect(result.status).toBe(OrderStatus.PENDING_PAYMENT);
  });

  it('marks a QRIS order paid with a system status log', async () => {
    const { service, orders, audit } = buildService();
    orders.findById.mockResolvedValue(
      orderRecord({ status: OrderStatus.PENDING_PAYMENT }),
    );
    orders.nextCounter.mockResolvedValue(10);
    orders.transition.mockResolvedValue(true);

    const queueNumber = await service.markPaidByQris(
      'outlet-1',
      'order-1',
      new Date('2026-11-22T00:05:00.000Z'),
      {},
    );

    expect(queueNumber).toBe(10);
    expect(orders.transition).toHaveBeenCalledWith(
      'outlet-1',
      'order-1',
      [OrderStatus.PENDING_PAYMENT, OrderStatus.AWAITING_CASH],
      expect.objectContaining({
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.PAID,
        queueNumber: 10,
      }),
      expect.anything(),
    );
    expect(orders.createStatusLog).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: OrderStatus.PENDING_PAYMENT,
        toStatus: OrderStatus.PAID,
        source: 'SYSTEM',
      }),
      expect.anything(),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ORDER_PAID' }),
      expect.anything(),
    );
  });

  it('moves a KDS order forward and emits realtime events', async () => {
    const { service, orders, realtime } = buildService();
    orders.findById
      .mockResolvedValueOnce(
        orderRecord({
          status: OrderStatus.PAID,
          paymentStatus: PaymentStatus.PAID,
          queueNumber: 3,
        }),
      )
      .mockResolvedValueOnce(
        orderRecord({
          status: OrderStatus.PREPARING,
          paymentStatus: PaymentStatus.PAID,
          queueNumber: 3,
        }),
      );
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

  it('returns a PII-free display queue', async () => {
    const { service, orders } = buildService();
    orders.findFirstOutlet.mockResolvedValue({
      id: 'outlet-1',
      timezone: 'Asia/Jakarta',
    });
    orders.listDisplayOrders.mockResolvedValue([
      orderRecord({
        status: OrderStatus.PREPARING,
        paymentStatus: PaymentStatus.PAID,
        queueNumber: 1,
      }),
      orderRecord({
        status: OrderStatus.READY,
        paymentStatus: PaymentStatus.PAID,
        queueNumber: 2,
      }),
    ]);

    const result = await service.getDisplayQueue();

    expect(result.preparing).toEqual([
      {
        queueNumber: 1,
        orderType: OrderType.DINE_IN,
        tableCode: 'T01',
        status: OrderStatus.PREPARING,
      },
    ]);
    expect(result.ready).toEqual([
      {
        queueNumber: 2,
        orderType: OrderType.DINE_IN,
        tableCode: 'T01',
        status: OrderStatus.READY,
      },
    ]);
  });

  it('expires stale unpaid orders with a system status log', async () => {
    const { service, orders } = buildService();
    orders.findStaleOrders.mockResolvedValue([
      {
        id: 'order-1',
        outletId: 'outlet-1',
        status: OrderStatus.AWAITING_CASH,
      },
    ]);
    orders.transition.mockResolvedValue(true);

    const expired = await service.expireStaleOrders(new Date());

    expect(expired).toBe(1);
    expect(orders.transition).toHaveBeenCalledWith(
      'outlet-1',
      'order-1',
      [OrderStatus.AWAITING_CASH],
      {
        status: OrderStatus.EXPIRED,
        paymentStatus: PaymentStatus.EXPIRED,
      },
      expect.anything(),
    );
    expect(orders.createStatusLog).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: OrderStatus.AWAITING_CASH,
        toStatus: OrderStatus.EXPIRED,
        source: 'SYSTEM',
      }),
      expect.anything(),
    );
  });
});
