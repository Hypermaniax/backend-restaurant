import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from '../../generated/prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrdersService } from '../orders/orders.service';
import type { RealtimeService } from '../realtime/realtime.service';
import type { PaymentOrderView } from '../orders/order.types';
import type { PaymentRecord, PaymentRepository } from './payment.repository';
import { PaymentsService } from './payments.service';
import type { PaymentGateway } from './payment.types';

const order: PaymentOrderView = {
  id: 'order-1',
  outletId: 'outlet-1',
  orderNumber: '20261122-0001',
  status: OrderStatus.AWAITING_CASH,
  paymentStatus: PaymentStatus.PENDING,
  queueNumber: null,
  total: 11550,
  businessDate: new Date('2026-11-22T00:00:00.000Z'),
  expiresAt: new Date(Date.now() + 30 * 60_000),
  tableId: 'table-1',
  tableCode: 'T01',
};

function paymentRecord(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: 'payment-1',
    orderId: 'order-1',
    provider: PaymentProvider.XENDIT,
    method: PaymentMethod.QRIS,
    status: PaymentStatus.PENDING,
    amount: 11550,
    referenceId: 'PAY-1',
    providerPaymentId: 'pr-1',
    qrString: 'QRIS-1',
    expiresAt: new Date(Date.now() + 30 * 60_000),
    paidAt: null,
    rawResponse: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    order: {
      id: 'order-1',
      outletId: 'outlet-1',
      orderNumber: '20261122-0001',
      businessDate: new Date('2026-11-22T00:00:00.000Z'),
      total: 11550,
      status: OrderStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.PENDING,
      tableId: 'table-1',
    },
    ...overrides,
  };
}

function buildService() {
  const prisma = {
    $transaction: jest.fn((callback: (tx: object) => unknown) =>
      Promise.resolve(callback({})),
    ),
  };
  const payments = {
    findPendingQris: jest.fn(),
    findByReference: jest.fn(),
    findByProviderPaymentId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    expireOtherPending: jest.fn(),
    findWebhookEvent: jest.fn(),
    createWebhookEvent: jest.fn(),
    updateWebhookEvent: jest.fn(),
  };
  const orders = {
    getPublicPaymentOrder: jest.fn(),
    getCashierPaymentOrder: jest.fn(),
    startOnlinePayment: jest.fn(),
    markPaidByQris: jest.fn(),
    getKdsOrder: jest.fn(),
    setPaymentStatusFromProvider: jest.fn(),
  };
  const config = {
    get: jest.fn().mockReturnValue(undefined),
    getOrThrow: jest.fn().mockReturnValue('webhook-token'),
  };
  const realtime = {
    emitOrderPaid: jest.fn(),
    emitQueueUpdated: jest.fn(),
  };
  const createQris = jest.fn();
  const simulateQris = jest.fn();
  const gateway: PaymentGateway = { createQris, simulateQris };

  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    payments as unknown as PaymentRepository,
    orders as unknown as OrdersService,
    realtime as unknown as RealtimeService,
    config as unknown as ConfigService,
    gateway,
  );

  return {
    service,
    prisma,
    payments,
    orders,
    config,
    realtime,
    createQris,
    simulateQris,
  };
}

describe('PaymentsService', () => {
  it('creates a QRIS payment and switches the order to PENDING_PAYMENT', async () => {
    const { service, payments, orders, createQris } = buildService();
    orders.getPublicPaymentOrder.mockResolvedValue(order);
    payments.findPendingQris.mockResolvedValue(null);
    createQris.mockResolvedValue({
      providerPaymentId: 'pr-1',
      qrString: 'QRIS-1',
      expiresAt: order.expiresAt,
      raw: { payment_request_id: 'pr-1' },
    });
    payments.create.mockResolvedValue(paymentRecord());

    const result = await service.payPublic('T01', 'order-1');

    expect(orders.startOnlinePayment).toHaveBeenCalledWith(order, undefined);
    expect(createQris).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 11550,
        orderId: 'order-1',
        orderNumber: '20261122-0001',
      }),
    );
    expect(payments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: PaymentProvider.XENDIT,
        method: PaymentMethod.QRIS,
        status: PaymentStatus.PENDING,
        amount: 11550,
        providerPaymentId: 'pr-1',
        qrString: 'QRIS-1',
      }),
    );
    expect(result).toMatchObject({
      paymentId: 'payment-1',
      status: PaymentStatus.PENDING,
      qrString: 'QRIS-1',
    });
  });

  it('reuses an active QRIS payment', async () => {
    const { service, payments, orders, createQris } = buildService();
    orders.getPublicPaymentOrder.mockResolvedValue(order);
    payments.findPendingQris.mockResolvedValue(paymentRecord());

    const result = await service.payPublic('T01', 'order-1');

    expect(result.paymentId).toBe('payment-1');
    expect(createQris).not.toHaveBeenCalled();
    expect(payments.create).not.toHaveBeenCalled();
  });

  it('sends a test-mode QRIS simulation without settling locally', async () => {
    const { service, payments, orders, simulateQris } = buildService();
    orders.getPublicPaymentOrder.mockResolvedValue(order);
    payments.findPendingQris.mockResolvedValue(paymentRecord());
    simulateQris.mockResolvedValue(undefined);

    const result = await service.simulatePublic('T01', 'order-1');

    expect(simulateQris).toHaveBeenCalledWith({
      paymentRequestId: 'pr-1',
      amount: 11550,
    });
    expect(payments.update).not.toHaveBeenCalled();
    expect(orders.markPaidByQris).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'PENDING' });
  });

  it('rejects payment simulation in production mode', async () => {
    const { service, config, orders, simulateQris } = buildService();
    config.get.mockImplementation((key: string) =>
      key === 'XENDIT_IS_PRODUCTION' ? 'true' : undefined,
    );

    await expect(
      service.simulatePublic('T01', 'order-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(orders.getPublicPaymentOrder).not.toHaveBeenCalled();
    expect(simulateQris).not.toHaveBeenCalled();
  });

  it('rejects payment simulation without an active QRIS', async () => {
    const { service, payments, orders, simulateQris } = buildService();
    orders.getPublicPaymentOrder.mockResolvedValue(order);
    payments.findPendingQris.mockResolvedValue(null);

    await expect(service.simulatePublic('T01', 'order-1')).rejects.toThrow(
      'QRIS aktif tidak ditemukan',
    );
    expect(simulateQris).not.toHaveBeenCalled();
  });

  it('rejects a webhook with the wrong callback token', async () => {
    const { service } = buildService();

    await expect(
      service.handleXenditWebhook('wrong', {
        event: 'payment.capture',
        data: { payment_id: 'py-1' },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not mark the order paid when the webhook amount differs', async () => {
    const { service, payments, orders } = buildService();
    payments.findWebhookEvent.mockResolvedValue(null);
    payments.createWebhookEvent.mockResolvedValue({ id: 'wh-1' });
    payments.findByReference.mockResolvedValue(paymentRecord());

    const result = await service.handleXenditWebhook('webhook-token', {
      event: 'payment.capture',
      data: {
        payment_id: 'py-1',
        reference_id: 'PAY-1',
        request_amount: 10000,
        currency: 'IDR',
      },
    });

    expect(result).toEqual({ received: true });
    expect(orders.markPaidByQris).not.toHaveBeenCalled();
    expect(orders.setPaymentStatusFromProvider).toHaveBeenCalledWith(
      'outlet-1',
      'order-1',
      PaymentStatus.FAILED,
      expect.anything(),
    );
    expect(payments.updateWebhookEvent).toHaveBeenCalledWith(
      'wh-1',
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it('maps payment failure and expiry webhooks without releasing the order', async () => {
    const { service, payments, orders } = buildService();
    payments.findWebhookEvent.mockResolvedValue(null);
    payments.createWebhookEvent
      .mockResolvedValueOnce({ id: 'wh-1' })
      .mockResolvedValueOnce({ id: 'wh-2' });
    payments.findByReference.mockResolvedValue(paymentRecord());

    await service.handleXenditWebhook('webhook-token', {
      event: 'payment.failure',
      data: {
        payment_id: 'py-1',
        reference_id: 'PAY-1',
        request_amount: 11550,
        status: 'FAILED',
      },
    });
    await service.handleXenditWebhook('webhook-token', {
      event: 'payment_request.expiry',
      data: {
        payment_request_id: 'pr-1',
        reference_id: 'PAY-1',
      },
    });

    expect(payments.update).toHaveBeenCalledWith(
      'payment-1',
      expect.objectContaining({ status: PaymentStatus.FAILED }),
      expect.anything(),
    );
    expect(payments.update).toHaveBeenCalledWith(
      'payment-1',
      expect.objectContaining({ status: PaymentStatus.EXPIRED }),
      expect.anything(),
    );
    expect(orders.setPaymentStatusFromProvider).toHaveBeenCalledWith(
      'outlet-1',
      'order-1',
      PaymentStatus.FAILED,
      expect.anything(),
    );
    expect(orders.setPaymentStatusFromProvider).toHaveBeenCalledWith(
      'outlet-1',
      'order-1',
      PaymentStatus.EXPIRED,
      expect.anything(),
    );
    expect(orders.markPaidByQris).not.toHaveBeenCalled();
  });

  it('marks the order paid and assigns a queue on a valid capture', async () => {
    const { service, payments, orders, realtime } = buildService();
    payments.findWebhookEvent.mockResolvedValue(null);
    payments.createWebhookEvent.mockResolvedValue({ id: 'wh-1' });
    payments.findByReference.mockResolvedValue(paymentRecord());
    orders.markPaidByQris.mockResolvedValue(8);
    const kdsOrder = {
      id: 'order-1',
      queueNumber: 8,
      orderType: OrderType.DINE_IN,
      tableCode: 'T01',
      status: OrderStatus.PAID,
    };
    orders.getKdsOrder.mockResolvedValue(kdsOrder);

    const result = await service.handleXenditWebhook('webhook-token', {
      event: 'payment.capture',
      data: {
        payment_id: 'py-1',
        reference_id: 'PAY-1',
        request_amount: 11550,
        currency: 'IDR',
        captures: [{ capture_timestamp: '2026-11-22T00:05:00.000Z' }],
      },
    });

    expect(result).toEqual({ received: true });
    expect(orders.markPaidByQris).toHaveBeenCalledWith(
      'outlet-1',
      'order-1',
      new Date('2026-11-22T00:05:00.000Z'),
      expect.anything(),
    );
    expect(payments.update).toHaveBeenCalledWith(
      'payment-1',
      expect.objectContaining({
        status: PaymentStatus.PAID,
        providerPaymentId: 'py-1',
      }),
      expect.anything(),
    );
    expect(payments.expireOtherPending).toHaveBeenCalledWith(
      'order-1',
      'payment-1',
      PaymentStatus.EXPIRED,
      expect.anything(),
    );
    expect(payments.updateWebhookEvent).toHaveBeenCalledWith(
      'wh-1',
      expect.objectContaining({ status: 'PROCESSED' }),
    );
    expect(realtime.emitOrderPaid).toHaveBeenCalledWith('outlet-1', {
      order: kdsOrder,
    });
    expect(realtime.emitQueueUpdated).toHaveBeenCalled();
  });
});
