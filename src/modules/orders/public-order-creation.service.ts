import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CounterType,
  OrderSource,
  OrderStatus,
  OrderStatusSource,
  OrderType,
  PaymentStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { TableSessionService } from '../tables/table-session.service';
import { TablesService } from '../tables/tables.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { CreatePublicOrderDto } from './dto/order.dto';
import { toOrderItems, toOrderPricing, toView } from './order.mapper';
import { OrderRepository } from './order.repository';
import { toKdsOrderView } from './order.presenter';
import type { OrderView } from './order.types';
import { PricingService } from './pricing.service';
import {
  formatOrderNumber,
  isUniqueConstraintError,
  normalizeIdempotencyKey,
  resolveBusinessDate,
} from './order.utils';

@Injectable()
export class PublicOrderCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderRepository,
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
    private readonly tables: TablesService,
    private readonly sessions: TableSessionService,
    private readonly realtime: RealtimeService,
  ) {}

  async createPublicOrder(
    dto: CreatePublicOrderDto,
    idempotencyKey?: string,
  ): Promise<OrderView> {
    const table = await this.tables.resolvePublicTable(dto.tableCode);
    const outletId = table.outlet.id;
    const key = normalizeIdempotencyKey(idempotencyKey);

    if (key) {
      const existing = await this.orders.findByIdempotencyKey(outletId, key);
      if (existing) {
        return toView(existing);
      }
    }

    const pricing = await this.pricing.price(
      outletId,
      OrderType.DINE_IN,
      dto.items,
    );
    const outlet = await this.orders.findOutlet(outletId);
    if (!outlet) {
      throw new NotFoundException('Outlet tidak ditemukan');
    }
    const settings = await this.settings.getSettings(outletId);
    const now = new Date();
    const businessDate = resolveBusinessDate(now, outlet.timezone);

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const session = await this.sessions.ensureSessionForOrder(
          outletId,
          table.id,
          tx,
        );
        const sequence = await this.orders.nextCounter(
          outletId,
          businessDate,
          CounterType.ORDER,
          tx,
        );

        return this.orders.createOrder(
          {
            ...toOrderPricing(pricing),
            outletId,
            orderType: OrderType.DINE_IN,
            source: OrderSource.CUSTOMER_QR,
            createdByUserId: null,
            tableId: table.id,
            sessionId: session.id,
            orderNumber: formatOrderNumber(businessDate, sequence),
            idempotencyKey: key,
            businessDate,
            queueNumber: null,
            queueAssignedAt: null,
            status: OrderStatus.AWAITING_CASH,
            paymentStatus: PaymentStatus.PENDING,
            currency: 'IDR',
            customerName: dto.customerName ?? null,
            notes: dto.notes ?? null,
            expiresAt: new Date(
              now.getTime() + settings.cashExpiryMinutes * 60_000,
            ),
            paidAt: null,
            items: {
              create: toOrderItems(pricing),
            },
            statusLogs: {
              create: {
                fromStatus: null,
                toStatus: OrderStatus.AWAITING_CASH,
                source: OrderStatusSource.CUSTOMER,
                note: 'Order customer QR',
              },
            },
          },
          tx,
        );
      });

      const view = toView(order);
      this.realtime.emitOrderCreated(order.outletId, {
        order: toKdsOrderView(order),
      });
      return view;
    } catch (error) {
      if (key && isUniqueConstraintError(error)) {
        const existing = await this.orders.findByIdempotencyKey(outletId, key);
        if (existing) {
          return toView(existing);
        }
      }
      throw error;
    }
  }
}
