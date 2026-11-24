import {
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentStatus,
} from '../../generated/prisma/client';
import type { TablesService } from '../tables/tables.service';
import { OrderQueryService } from './order-query.service';
import type { OrderRecord, OrderRepository } from './order.repository';

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
  const orders = {
    findOutlet: jest.fn(),
    findFirstOutlet: jest.fn(),
    listCashierOrders: jest.fn(),
    listDisplayOrders: jest.fn(),
  };
  const tables = {
    resolvePublicTable: jest.fn(),
  };
  const service = new OrderQueryService(
    orders as unknown as OrderRepository,
    tables as unknown as TablesService,
  );

  return { service, orders, tables };
}

describe('OrderQueryService', () => {
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
});
