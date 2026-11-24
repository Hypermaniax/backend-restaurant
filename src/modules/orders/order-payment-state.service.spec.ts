import {
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { OrderPaymentStateService } from './order-payment-state.service';
import type { OrderRepository } from './order.repository';

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
    createStatusLog: jest.fn(),
  };
  const audit = {
    record: jest.fn(),
  };
  const service = new OrderPaymentStateService(
    prisma as unknown as PrismaService,
    orders as unknown as OrderRepository,
    audit as unknown as AuditService,
  );

  return { service, prisma, orders, audit };
}

describe('OrderPaymentStateService', () => {
  it('marks a QRIS order paid with a system status log', async () => {
    const { service, orders, audit } = buildService();
    orders.findById.mockResolvedValue({
      id: 'order-1',
      outletId: 'outlet-1',
      orderNumber: '20261122-0001',
      businessDate: new Date('2026-11-22T00:00:00.000Z'),
      status: OrderStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.PENDING,
      queueNumber: null,
      total: 11550,
    });
    orders.nextCounter.mockResolvedValue(10);
    orders.transition.mockResolvedValue(true);

    const queueNumber = await service.markPaidByQris(
      'outlet-1',
      'order-1',
      new Date('2026-11-22T00:05:00.000Z'),
      {} as Prisma.TransactionClient,
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
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'QUEUE_ASSIGNED' }),
      expect.anything(),
    );
  });
});
