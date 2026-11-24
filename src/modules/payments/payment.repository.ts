import { Injectable } from '@nestjs/common';
import { type PaymentStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const PAYMENT_ORDER_INCLUDE = {
  order: {
    select: {
      id: true,
      outletId: true,
      orderNumber: true,
      businessDate: true,
      total: true,
      status: true,
      paymentStatus: true,
      tableId: true,
    },
  },
} satisfies Prisma.PaymentInclude;

export type PaymentRecord = Prisma.PaymentGetPayload<{
  include: typeof PAYMENT_ORDER_INCLUDE;
}>;

@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPendingQris(
    orderId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PaymentRecord | null> {
    const client = tx ?? this.prisma;
    return client.payment.findFirst({
      where: {
        orderId,
        provider: 'XENDIT',
        method: 'QRIS',
        status: 'PENDING',
      },
      include: PAYMENT_ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByReference(
    referenceId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PaymentRecord | null> {
    const client = tx ?? this.prisma;
    return client.payment.findUnique({
      where: { referenceId },
      include: PAYMENT_ORDER_INCLUDE,
    });
  }

  async findByProviderPaymentId(
    providerPaymentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PaymentRecord | null> {
    const client = tx ?? this.prisma;
    return client.payment.findFirst({
      where: { providerPaymentId },
      include: PAYMENT_ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    data: Prisma.PaymentUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<PaymentRecord> {
    const client = tx ?? this.prisma;
    return client.payment.create({ data, include: PAYMENT_ORDER_INCLUDE });
  }

  async update(
    paymentId: string,
    data: Prisma.PaymentUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<PaymentRecord> {
    const client = tx ?? this.prisma;
    return client.payment.update({
      where: { id: paymentId },
      data,
      include: PAYMENT_ORDER_INCLUDE,
    });
  }

  async expireOtherPending(
    orderId: string,
    exceptPaymentId: string,
    status: PaymentStatus,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.payment.updateMany({
      where: {
        orderId,
        id: { not: exceptPaymentId },
        status: 'PENDING',
        method: 'QRIS',
      },
      data: { status },
    });
  }

  async findWebhookEvent(
    provider: string,
    externalId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.webhookEvent.findUnique({
      where: { provider_externalId: { provider, externalId } },
    });
  }

  async createWebhookEvent(
    data: Prisma.WebhookEventUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.webhookEvent.create({ data });
  }

  async updateWebhookEvent(
    eventId: string,
    data: Prisma.WebhookEventUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.webhookEvent.update({ where: { id: eventId }, data });
  }
}
