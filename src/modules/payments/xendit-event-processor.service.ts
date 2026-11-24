import { Injectable } from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderPaymentStateService } from '../orders/order-payment-state.service';
import { OrderQueryService } from '../orders/order-query.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PaymentRepository, type PaymentRecord } from './payment.repository';
import type { XenditWebhookPayload } from './payment.types';

@Injectable()
export class XenditEventProcessorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentRepository,
    private readonly orderQuery: OrderQueryService,
    private readonly paymentState: OrderPaymentStateService,
    private readonly realtime: RealtimeService,
  ) {}

  async processEvent(
    event: string,
    data: NonNullable<XenditWebhookPayload['data']>,
    referenceId: string | null,
    paymentRequestId: string | null,
  ): Promise<boolean> {
    const payment = await this.findWebhookPayment(
      referenceId,
      paymentRequestId,
    );
    if (!payment) {
      return false;
    }

    if (event === 'payment.capture') {
      return this.handleCapture(payment, data);
    }
    if (event === 'payment.failure') {
      return this.handleFailedPayment(payment, data, PaymentStatus.FAILED);
    }
    if (event === 'payment.expiry' || event === 'payment_request.expiry') {
      return this.handleFailedPayment(payment, data, PaymentStatus.EXPIRED);
    }

    return true;
  }

  private async handleCapture(
    payment: PaymentRecord,
    data: NonNullable<XenditWebhookPayload['data']>,
  ): Promise<boolean> {
    const amount = Number(data.request_amount);
    const validAmount =
      Number.isInteger(amount) &&
      amount === payment.amount &&
      amount === payment.order.total;
    const validCurrency =
      data.currency === undefined || data.currency === 'IDR';

    if (!validAmount || !validCurrency) {
      await this.rejectCapture(payment, data);
      return false;
    }

    if (payment.status === PaymentStatus.PAID) {
      return true;
    }

    if (payment.order.status === OrderStatus.PAID) {
      await this.rejectCapture(payment, data);
      return false;
    }

    const paidAt = this.captureTime(data) ?? new Date();

    const paid = await this.prisma.$transaction(async (tx) => {
      const queueNumber = await this.paymentState.markPaidByQris(
        payment.order.outletId,
        payment.order.id,
        paidAt,
        tx,
      );

      if (queueNumber === null) {
        await this.payments.update(
          payment.id,
          {
            status: PaymentStatus.FAILED,
            rawResponse: this.toJson(data),
          },
          tx,
        );
        return false;
      }

      await this.payments.update(
        payment.id,
        {
          status: PaymentStatus.PAID,
          paidAt,
          providerPaymentId: data.payment_id ?? payment.providerPaymentId,
          rawResponse: this.toJson(data),
        },
        tx,
      );
      await this.payments.expireOtherPending(
        payment.order.id,
        payment.id,
        PaymentStatus.EXPIRED,
        tx,
      );
      return true;
    });

    if (paid) {
      const order = await this.orderQuery
        .getKdsOrder(payment.order.outletId, payment.order.id)
        .catch(() => null);
      if (order) {
        this.realtime.emitOrderPaid(payment.order.outletId, { order });
        if (order.queueNumber !== null) {
          this.realtime.emitQueueUpdated(payment.order.outletId, {
            queue: {
              queueNumber: order.queueNumber,
              orderType: order.orderType,
              tableCode: order.tableCode,
              status: order.status,
            },
          });
        }
      }
    }

    return paid;
  }

  private async handleFailedPayment(
    payment: PaymentRecord,
    data: NonNullable<XenditWebhookPayload['data']>,
    status: PaymentStatus,
  ): Promise<boolean> {
    if (payment.status === PaymentStatus.PAID) {
      return true;
    }

    await this.prisma.$transaction(async (tx) => {
      await this.paymentState.setPaymentStatusFromProvider(
        payment.order.outletId,
        payment.order.id,
        status,
        tx,
      );
      await this.payments.update(
        payment.id,
        {
          status,
          rawResponse: this.toJson(data),
        },
        tx,
      );
    });

    return true;
  }

  private async rejectCapture(
    payment: PaymentRecord,
    data: NonNullable<XenditWebhookPayload['data']>,
  ) {
    if (payment.status === PaymentStatus.PAID) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await this.paymentState.setPaymentStatusFromProvider(
        payment.order.outletId,
        payment.order.id,
        PaymentStatus.FAILED,
        tx,
      );
      await this.payments.update(
        payment.id,
        {
          status: PaymentStatus.FAILED,
          rawResponse: this.toJson(data),
        },
        tx,
      );
    });
  }

  private async findWebhookPayment(
    referenceId: string | null,
    paymentRequestId: string | null,
  ): Promise<PaymentRecord | null> {
    if (referenceId) {
      const payment = await this.payments.findByReference(referenceId);
      if (payment) {
        return payment;
      }
    }
    if (paymentRequestId) {
      return this.payments.findByProviderPaymentId(paymentRequestId);
    }
    return null;
  }

  private captureTime(
    data: NonNullable<XenditWebhookPayload['data']>,
  ): Date | null {
    const value = data.captures?.[0]?.capture_timestamp;
    if (typeof value !== 'string') {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
