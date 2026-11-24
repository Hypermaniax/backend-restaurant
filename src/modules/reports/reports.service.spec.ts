import { BadRequestException } from '@nestjs/common';
import { OrderType, PaymentMethod } from '../../generated/prisma/client';
import type {
  ReportCancelledOrderRecord,
  ReportOrderRecord,
  ReportRepository,
} from './report.repository';
import { ReportsService } from './reports.service';

function reportOrder(
  overrides: Partial<ReportOrderRecord> = {},
): ReportOrderRecord {
  return {
    id: 'order-1',
    orderNumber: '20261122-0001',
    orderType: OrderType.DINE_IN,
    subtotal: 10000,
    taxAmount: 1050,
    serviceAmount: 500,
    discountAmount: 0,
    total: 11550,
    createdAt: new Date('2026-11-22T01:00:00.000Z'),
    paidAt: new Date('2026-11-22T01:01:00.000Z'),
    items: [
      {
        menuItemId: 'item-1',
        nameSnapshot: 'Nasi Goreng',
        qty: 1,
        lineTotal: 10000,
      },
    ],
    payments: [
      {
        method: PaymentMethod.CASH,
        amount: 11550,
        paidAt: new Date('2026-11-22T01:01:00.000Z'),
      },
    ],
    ...overrides,
  };
}

function cancelledOrder(
  overrides: Partial<ReportCancelledOrderRecord> = {},
): ReportCancelledOrderRecord {
  return {
    id: 'cancelled-1',
    orderNumber: '20261122-0002',
    orderType: OrderType.TAKEAWAY,
    total: 10000,
    cancelReason: 'Customer membatalkan',
    cancelledAt: new Date('2026-11-22T02:00:00.000Z'),
    cancelledByUserId: 'user-1',
    ...overrides,
  };
}

function buildService() {
  const reports = {
    findOutlet: jest.fn().mockResolvedValue({
      id: 'outlet-1',
      timezone: 'Asia/Jakarta',
    }),
    findPaidOrders: jest.fn(),
    findCancelledOrders: jest.fn(),
  };
  const service = new ReportsService(reports as unknown as ReportRepository);
  return { service, reports };
}

describe('ReportsService', () => {
  it('aggregates daily revenue per order type', async () => {
    const { service, reports } = buildService();
    reports.findPaidOrders.mockResolvedValue([
      reportOrder(),
      reportOrder({
        id: 'order-2',
        orderNumber: '20261122-0003',
        orderType: OrderType.TAKEAWAY,
        subtotal: 20000,
        taxAmount: 0,
        serviceAmount: 0,
        total: 20000,
        payments: [{ method: PaymentMethod.EDC, amount: 20000, paidAt: null }],
      }),
    ]);

    const result = await service.daily('outlet-1', '2026-11-22');

    expect(result).toMatchObject({
      date: '2026-11-22',
      orderCount: 2,
      subtotal: 30000,
      tax: 1050,
      service: 500,
      revenue: 31550,
    });
    expect(result.orderTypes).toEqual([
      {
        orderType: OrderType.DINE_IN,
        orderCount: 1,
        subtotal: 10000,
        tax: 1050,
        service: 500,
        discount: 0,
        revenue: 11550,
      },
      {
        orderType: OrderType.TAKEAWAY,
        orderCount: 1,
        subtotal: 20000,
        tax: 0,
        service: 0,
        discount: 0,
        revenue: 20000,
      },
    ]);
  });

  it('groups paid payments by method and order type', async () => {
    const { service, reports } = buildService();
    reports.findPaidOrders.mockResolvedValue([
      reportOrder(),
      reportOrder({
        id: 'order-2',
        orderNumber: '20261122-0003',
        orderType: OrderType.TAKEAWAY,
        payments: [{ method: PaymentMethod.QRIS, amount: 10000, paidAt: null }],
      }),
    ]);

    const result = await service.payments('outlet-1', '2026-11-22');

    expect(result.totalAmount).toBe(21550);
    expect(result.rows).toEqual([
      {
        orderType: OrderType.DINE_IN,
        paymentMethod: PaymentMethod.CASH,
        orderCount: 1,
        amount: 11550,
      },
      {
        orderType: OrderType.TAKEAWAY,
        paymentMethod: PaymentMethod.QRIS,
        orderCount: 1,
        amount: 10000,
      },
    ]);
  });

  it('aggregates top items and applies the limit', async () => {
    const { service, reports } = buildService();
    reports.findPaidOrders.mockResolvedValue([
      reportOrder({
        items: [
          {
            menuItemId: 'item-1',
            nameSnapshot: 'Nasi Goreng',
            qty: 2,
            lineTotal: 20000,
          },
          {
            menuItemId: 'item-2',
            nameSnapshot: 'Es Teh',
            qty: 5,
            lineTotal: 25000,
          },
        ],
      }),
      reportOrder({
        id: 'order-2',
        items: [
          {
            menuItemId: 'item-1',
            nameSnapshot: 'Nasi Goreng',
            qty: 1,
            lineTotal: 10000,
          },
        ],
      }),
    ]);

    const result = await service.items('outlet-1', 1, '2026-11-22');

    expect(result).toMatchObject({
      totalQty: 8,
      totalRevenue: 55000,
      rows: [
        {
          menuItemId: 'item-2',
          name: 'Es Teh',
          qty: 5,
          revenue: 25000,
        },
      ],
    });
  });

  it('reports tax and unpaid cancellations', async () => {
    const { service, reports } = buildService();
    reports.findPaidOrders.mockResolvedValue([reportOrder()]);
    reports.findCancelledOrders.mockResolvedValue([cancelledOrder()]);

    await expect(service.tax('outlet-1', '2026-11-22')).resolves.toMatchObject({
      totalTax: 1050,
      rows: [
        {
          orderType: OrderType.DINE_IN,
          orderCount: 1,
          taxAmount: 1050,
        },
        { orderType: OrderType.TAKEAWAY, orderCount: 0, taxAmount: 0 },
      ],
    });
    await expect(
      service.cancellations('outlet-1', '2026-11-22'),
    ).resolves.toMatchObject({
      count: 1,
      totalAmount: 10000,
      rows: [
        {
          orderNumber: '20261122-0002',
          orderType: OrderType.TAKEAWAY,
          reason: 'Customer membatalkan',
        },
      ],
    });
  });

  it('rejects an invalid calendar date', async () => {
    const { service } = buildService();

    await expect(service.daily('outlet-1', '2026-02-31')).rejects.toThrow(
      BadRequestException,
    );
  });
});
