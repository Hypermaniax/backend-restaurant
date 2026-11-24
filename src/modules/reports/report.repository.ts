import { Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const REPORT_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  orderType: true,
  subtotal: true,
  taxAmount: true,
  serviceAmount: true,
  discountAmount: true,
  total: true,
  createdAt: true,
  paidAt: true,
  items: {
    select: {
      menuItemId: true,
      nameSnapshot: true,
      qty: true,
      lineTotal: true,
    },
  },
  payments: {
    where: { status: PaymentStatus.PAID },
    select: {
      method: true,
      amount: true,
      paidAt: true,
    },
  },
} satisfies Prisma.OrderSelect;

const CANCELLED_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  orderType: true,
  total: true,
  cancelReason: true,
  cancelledAt: true,
  cancelledByUserId: true,
} satisfies Prisma.OrderSelect;

export type ReportOrderRecord = Prisma.OrderGetPayload<{
  select: typeof REPORT_ORDER_SELECT;
}>;
export type ReportCancelledOrderRecord = Prisma.OrderGetPayload<{
  select: typeof CANCELLED_ORDER_SELECT;
}>;

@Injectable()
export class ReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOutlet(outletId: string) {
    return this.prisma.outlet.findUnique({
      where: { id: outletId },
      select: { id: true, timezone: true },
    });
  }

  async findPaidOrders(
    outletId: string,
    businessDate: Date,
  ): Promise<ReportOrderRecord[]> {
    return this.prisma.order.findMany({
      where: {
        outletId,
        businessDate,
        paymentStatus: PaymentStatus.PAID,
      },
      select: REPORT_ORDER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findCancelledOrders(
    outletId: string,
    businessDate: Date,
  ): Promise<ReportCancelledOrderRecord[]> {
    return this.prisma.order.findMany({
      where: {
        outletId,
        businessDate,
        status: 'CANCELLED',
      },
      select: CANCELLED_ORDER_SELECT,
      orderBy: { cancelledAt: 'asc' },
    });
  }
}
