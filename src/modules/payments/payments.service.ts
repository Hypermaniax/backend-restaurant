import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  OrderStatus,
  PaymentProvider,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '../../generated/prisma/client';
import type { AuthUser } from '../security/types/auth-user';
import { OrderPaymentStateService } from '../orders/order-payment-state.service';
import { OrderQueryService } from '../orders/order-query.service';
import type { PaymentOrderView } from '../orders/order.types';
import { PaymentRepository, type PaymentRecord } from './payment.repository';
import type {
  PayQrisView,
  PaymentGateway,
  PublicPaymentStatusView,
} from './payment.types';
import { PAYMENT_GATEWAY } from './xendit-payment.provider';

@Injectable()
export class PaymentsService {
  private readonly activeStarts = new Set<string>();
  private readonly activeSimulations = new Set<string>();

  constructor(
    private readonly payments: PaymentRepository,
    private readonly orderQuery: OrderQueryService,
    private readonly paymentState: OrderPaymentStateService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
  ) {}

  async payPublic(tableCode: string, orderId: string): Promise<PayQrisView> {
    const order = await this.orderQuery.getPublicPaymentOrder(
      tableCode,
      orderId,
    );
    return this.startQris(order);
  }

  async payCashier(
    outletId: string,
    orderId: string,
    actor: AuthUser,
  ): Promise<PayQrisView> {
    const order = await this.orderQuery.getCashierPaymentOrder(
      outletId,
      orderId,
    );
    return this.startQris(order, actor);
  }

  async simulatePublic(
    tableCode: string,
    orderId: string,
  ): Promise<{ status: 'PENDING' }> {
    this.assertSimulationEnabled();
    const order = await this.orderQuery.getPublicPaymentOrder(
      tableCode,
      orderId,
    );
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
    const order = await this.orderQuery.getPublicPaymentOrder(
      tableCode,
      orderId,
    );
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

      await this.paymentState.startOnlinePayment(order, actor);

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

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
