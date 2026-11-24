import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  OrderStatus,
  PaymentProvider,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../security/types/auth-user';
import { OrdersService } from '../orders/orders.service';
import type { PaymentOrderView } from '../orders/order.types';
import { RealtimeService } from '../realtime/realtime.service';
import { PaymentRepository, type PaymentRecord } from './payment.repository';
import type {
  PayQrisView,
  PaymentGateway,
  PublicPaymentStatusView,
  XenditWebhookPayload,
} from './payment.types';
import { PAYMENT_GATEWAY } from './xendit-payment.provider';

@Injectable()
export class PaymentsService {
  private readonly activeStarts = new Set<string>();
  private readonly activeSimulations = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentRepository,
    private readonly orders: OrdersService,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
  ) {}

  async payPublic(tableCode: string, orderId: string): Promise<PayQrisView> {
    const order = await this.orders.getPublicPaymentOrder(tableCode, orderId);
    return this.startQris(order);
  }

  async payCashier(
    outletId: string,
    orderId: string,
    actor: AuthUser,
  ): Promise<PayQrisView> {
    const order = await this.orders.getCashierPaymentOrder(outletId, orderId);
    return this.startQris(order, actor);
  }

  async simulatePublic(
    tableCode: string,
    orderId: string,
  ): Promise<{ status: 'PENDING' }> {
    this.assertSimulationEnabled();
    const order = await this.orders.getPublicPaymentOrder(tableCode, orderId);
    if (
      order.status !== OrderStatus.PENDING_PAYMENT &&
      order.status !== OrderStatus.AWAITING_CASH
    ) {
      throw new BadRequestException(
        'Order tidak bisa disimulasikan pada status ini',
      );
    }

    const lockKey = `${order.outletId}:${order.id}:simulate`;
    if (this.activeSimulations.has(lockKey)) {
      throw new ConflictException('Simulasi pembayaran sedang diproses');
    }

    this.activeSimulations.add(lockKey);
    try {
      const payment = await this.payments.findPendingQris(order.id);
      if (!payment || !payment.providerPaymentId) {
        throw new BadRequestException('QRIS aktif tidak ditemukan');
      }
      if (!payment.expiresAt || payment.expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('QRIS sudah kedaluwarsa');
      }
      if (payment.amount !== order.total) {
        throw new BadRequestException('Nominal QRIS tidak sesuai');
      }

      await this.gateway.simulateQris({
        paymentRequestId: payment.providerPaymentId,
        amount: payment.amount,
      });
      return { status: 'PENDING' };
    } finally {
      this.activeSimulations.delete(lockKey);
    }
  }

  async getPublicStatus(
    tableCode: string,
    orderId: string,
  ): Promise<PublicPaymentStatusView> {
    const order = await this.orders.getPublicPaymentOrder(tableCode, orderId);
    const paid = order.status === OrderStatus.PAID;
    const queueNumber = paid ? order.queueNumber : null;

    return {
      status:
        order.status === OrderStatus.CANCELLED
          ? 'CANCELLED'
          : order.status === OrderStatus.EXPIRED
            ? 'EXPIRED'
            : order.paymentStatus,
      queueNumber,
      queueDisplay:
        queueNumber === null
          ? null
          : `A-${String(queueNumber).padStart(3, '0')}`,
    };
  }

  async handleXenditWebhook(
    callbackToken: string | undefined,
    body: unknown,
  ): Promise<{ received: true }> {
    this.verifyCallbackToken(callbackToken);

    const payload = this.asRecord(body);
    const event = typeof payload?.event === 'string' ? payload.event : null;
    const data = this.asRecord(payload?.data) as
      XenditWebhookPayload['data'] | null;
    if (!event || !data) {
      throw new BadRequestException('Payload webhook tidak valid');
    }

    const externalReference = data.payment_id ?? data.payment_request_id;
    if (!externalReference) {
      throw new BadRequestException('ID pembayaran webhook tidak valid');
    }
    const externalId = `${event}:${externalReference}`;
    const referenceId =
      typeof data.reference_id === 'string' ? data.reference_id : null;

    let webhookEvent = await this.payments.findWebhookEvent(
      'XENDIT',
      externalId,
    );
    if (
      webhookEvent?.status === 'PROCESSED' ||
      webhookEvent?.status === 'FAILED'
    ) {
      return { received: true };
    }

    if (!webhookEvent) {
      try {
        webhookEvent = await this.payments.createWebhookEvent({
          provider: 'XENDIT',
          externalId,
          eventType: event,
          payload: this.toJson(payload),
        });
      } catch (error) {
        if (!this.isUniqueError(error)) {
          throw error;
        }
        webhookEvent = await this.payments.findWebhookEvent(
          'XENDIT',
          externalId,
        );
        if (!webhookEvent) {
          throw new InternalServerErrorException('Gagal menyimpan webhook');
        }
        if (
          webhookEvent.status === 'PROCESSED' ||
          webhookEvent.status === 'FAILED'
        ) {
          return { received: true };
        }
      }
    }

    try {
      const processed = await this.processEvent(
        event,
        data,
        referenceId,
        data.payment_request_id ?? null,
      );
      await this.payments.updateWebhookEvent(webhookEvent.id, {
        status: processed ? 'PROCESSED' : 'FAILED',
        processedAt: new Date(),
      });
      return { received: true };
    } catch {
      throw new InternalServerErrorException('Gagal memproses webhook Xendit');
    }
  }

  private async startQris(
    order: PaymentOrderView,
    actor?: AuthUser,
  ): Promise<PayQrisView> {
    this.assertPayable(order);
    const lockKey = `${order.outletId}:${order.id}`;
    if (this.activeStarts.has(lockKey)) {
      throw new ConflictException('Pembayaran sedang diproses');
    }

    this.activeStarts.add(lockKey);
    try {
      const now = new Date();
      const pending = await this.payments.findPendingQris(order.id);
      if (pending) {
        if (
          pending.qrString &&
          pending.expiresAt &&
          pending.expiresAt.getTime() > now.getTime()
        ) {
          return this.toQrisView(pending);
        }
        await this.payments.update(pending.id, {
          status: PaymentStatus.EXPIRED,
        });
      }

      await this.orders.startOnlinePayment(order, actor);

      const referenceId = `PAY-${randomUUID()}`;
      const qris = await this.gateway.createQris({
        referenceId,
        amount: order.total,
        expiresAt: order.expiresAt,
        orderId: order.id,
        orderNumber: order.orderNumber,
      });

      const payment = await this.payments.create({
        orderId: order.id,
        provider: PaymentProvider.XENDIT,
        method: PaymentMethod.QRIS,
        status: PaymentStatus.PENDING,
        amount: order.total,
        referenceId,
        providerPaymentId: qris.providerPaymentId,
        qrString: qris.qrString,
        expiresAt: qris.expiresAt,
        rawResponse: this.toJson(qris.raw),
      });

      return this.toQrisView(payment);
    } finally {
      this.activeStarts.delete(lockKey);
    }
  }

  private async processEvent(
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
      const queueNumber = await this.orders.markPaidByQris(
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
      const order = await this.orders
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
      await this.orders.setPaymentStatusFromProvider(
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
      await this.orders.setPaymentStatusFromProvider(
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

  private assertSimulationEnabled() {
    const isProduction =
      this.config.get<string>('XENDIT_IS_PRODUCTION') === 'true';
    const nodeEnv = this.config.get<string>('NODE_ENV');
    if (isProduction || nodeEnv === 'production') {
      throw new NotFoundException('Simulasi pembayaran tidak tersedia');
    }
  }

  private assertPayable(order: PaymentOrderView) {
    if (
      order.status !== OrderStatus.PENDING_PAYMENT &&
      order.status !== OrderStatus.AWAITING_CASH
    ) {
      throw new BadRequestException(
        'Order tidak bisa dibayar online pada status ini',
      );
    }
    if (order.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Order sudah kedaluwarsa');
    }
  }

  private verifyCallbackToken(token: string | undefined) {
    const expected = this.config.getOrThrow<string>('XENDIT_WEBHOOK_TOKEN');
    if (!token) {
      throw new UnauthorizedException('Webhook token tidak valid');
    }

    const actualBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Webhook token tidak valid');
    }
  }

  private toQrisView(payment: PaymentRecord): PayQrisView {
    if (!payment.qrString || !payment.expiresAt) {
      throw new InternalServerErrorException('Data QRIS tidak lengkap');
    }

    return {
      paymentId: payment.id,
      referenceId: payment.referenceId,
      status: payment.status,
      amount: payment.amount,
      qrString: payment.qrString,
      expiresAt: payment.expiresAt,
    };
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

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private isUniqueError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
