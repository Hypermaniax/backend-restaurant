import { UnauthorizedException } from '@nestjs/common';
import {
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from '../../generated/prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderPaymentStateService } from '../orders/order-payment-state.service';
import type { OrderQueryService } from '../orders/order-query.service';
import type { OrderReceiptService } from '../orders/order-receipt.service';
import type { RealtimeService } from '../realtime/realtime.service';
import type { PaymentRecord, PaymentRepository } from './payment.repository';
import { XenditEventProcessorService } from './xendit-event-processor.service';
import { XenditWebhookService } from './xendit-webhook.service';

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
    findWebhookEvent: jest.fn(),
    createWebhookEvent: jest.fn(),
    updateWebhookEvent: jest.fn(),
    findByReference: jest.fn(),
    findByProviderPaymentId: jest.fn(),
    update: jest.fn(),
    expireOtherPending: jest.fn(),
  };
  const orders = {
    markPaidByQris: jest.fn(),
    setPaymentStatusFromProvider: jest.fn(),
    getKdsOrder: jest.fn(),
  };
  const realtime = {
    emitOrderPaid: jest.fn(),
    emitQueueUpdated: jest.fn(),
  };
  const config = {
    getOrThrow: jest.fn().mockReturnValue('webhook-token'),
    get: jest.fn().mockReturnValue(undefined),
  };
  const receipts = { sendForOrder: jest.fn() };
  const processor = new XenditEventProcessorService(
    prisma as unknown as PrismaService,
    payments as unknown as PaymentRepository,
    orders as unknown as OrderQueryService,
    orders as unknown as OrderPaymentStateService,
    realtime as unknown as RealtimeService,
    receipts as unknown as OrderReceiptService,
  );
  const service = new XenditWebhookService(
    payments as unknown as PaymentRepository,
    config as unknown as ConfigService,
    processor,
  );

  return { service, prisma, payments, orders, realtime, receipts, config };
}

describe('XenditWebhookService', () => {
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
