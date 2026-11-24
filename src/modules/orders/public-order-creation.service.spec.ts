import {
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentStatus,
} from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SettingsService } from '../settings/settings.service';
import type { TableSessionService } from '../tables/table-session.service';
import type { TablesService } from '../tables/tables.service';
import type { RealtimeService } from '../realtime/realtime.service';
import type { OrderRecord, OrderRepository } from './order.repository';
import type { PricingResult } from './order.types';
import { PublicOrderCreationService } from './public-order-creation.service';
import type { PricingService } from './pricing.service';

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
  };
  const sessions = {
    ensureSessionForOrder: jest.fn(),
  };
  const realtime = {
    emitOrderCreated: jest.fn(),
    emitOrderPaid: jest.fn(),
    emitOrderStatusChanged: jest.fn(),
    emitOrderCancelled: jest.fn(),
    emitQueueUpdated: jest.fn(),
  };

  const service = new PublicOrderCreationService(
    prisma as unknown as PrismaService,
    orders as unknown as OrderRepository,
    pricingService as unknown as PricingService,
    settings as unknown as SettingsService,
    tables as unknown as TablesService,
    sessions as unknown as TableSessionService,
    realtime as unknown as RealtimeService,
  );

  return {
    service,
    prisma,
    orders,
    pricingService,
    settings,
    tables,
    sessions,
    realtime,
  };
}

describe('PublicOrderCreationService', () => {
  it('creates a customer order as AWAITING_CASH without a queue number', async () => {
    const { service, orders, pricingService, settings, tables, sessions } =
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
    sessions.ensureSessionForOrder.mockResolvedValue({ id: 'session-1' });
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
    expect(sessions.ensureSessionForOrder).toHaveBeenCalledWith(
      'outlet-1',
      'table-1',
      expect.anything(),
    );
  });
});
