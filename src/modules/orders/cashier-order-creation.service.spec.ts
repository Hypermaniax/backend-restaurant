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
import type { TableSessionService } from '../tables/table-session.service';
import type { OrderReceiptService } from './order-receipt.service';
import type { RealtimeService } from '../realtime/realtime.service';
import type { AuthUser } from '../security/types/auth-user';
import type { OrderRecord, OrderRepository } from './order.repository';
import type { PricingResult } from './order.types';
import { CashierOrderCreationService } from './cashier-order-creation.service';
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
  const sessions = {
    ensureSessionForOrder: jest.fn(),
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

  const receipts = { sendForOrder: jest.fn() };
  const service = new CashierOrderCreationService(
    prisma as unknown as PrismaService,
    orders as unknown as OrderRepository,
    pricingService as unknown as PricingService,
    settings as unknown as SettingsService,
    sessions as unknown as TableSessionService,
    audit as unknown as AuditService,
    realtime as unknown as RealtimeService,
    receipts as unknown as OrderReceiptService,
  );

  return {
    service,
    prisma,
    orders,
    pricingService,
    settings,
    sessions,
    audit,
    realtime,
    receipts,
  };
}

describe('CashierOrderCreationService', () => {
  it('creates a paid takeaway cashier order with a queue number', async () => {
    const { service, orders, pricingService, settings, sessions } =
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
    expect(sessions.ensureSessionForOrder).not.toHaveBeenCalled();
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
});
