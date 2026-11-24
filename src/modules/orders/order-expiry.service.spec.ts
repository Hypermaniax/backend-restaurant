import { OrderStatus, PaymentStatus } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { OrderExpiryService } from './order-expiry.service';
import type { OrderRepository } from './order.repository';

function buildService() {
  const prisma = {
    $transaction: jest.fn((callback: (tx: object) => unknown) =>
      Promise.resolve(callback({})),
    ),
  };
  const orders = {
    findStaleOrders: jest.fn(),
    transition: jest.fn(),
    expirePendingPayments: jest.fn(),
    createStatusLog: jest.fn(),
  };
  const service = new OrderExpiryService(
    prisma as unknown as PrismaService,
    orders as unknown as OrderRepository,
  );

  return { service, orders };
}

describe('OrderExpiryService', () => {
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
    expect(orders.expirePendingPayments).toHaveBeenCalledWith(
      'order-1',
      PaymentStatus.EXPIRED,
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
