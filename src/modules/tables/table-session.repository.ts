import { Injectable } from '@nestjs/common';
import {
  type Prisma,
  TableSessionStatus,
  OrderStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const BLOCKING_ORDER_STATUSES = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.AWAITING_CASH,
  OrderStatus.PAID,
  OrderStatus.PREPARING,
  OrderStatus.READY,
] as const;

@Injectable()
export class TableSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOpenByTable(tableId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.tableSession.findFirst({
      where: { tableId, status: TableSessionStatus.OPEN },
      orderBy: { openedAt: 'desc' },
    });
  }

  async findOpenById(sessionId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.tableSession.findFirst({
      where: { id: sessionId, status: TableSessionStatus.OPEN },
    });
  }

  async create(
    data: Prisma.TableSessionUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.tableSession.create({ data });
  }

  async close(
    sessionId: string,
    closedByUserId: string | null,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.tableSession.update({
      where: { id: sessionId },
      data: {
        status: TableSessionStatus.CLOSED,
        closedAt: new Date(),
        closedByUserId,
      },
    });
  }

  async countBlockingOrders(
    sessionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.order.count({
      where: {
        sessionId,
        status: { in: [...BLOCKING_ORDER_STATUSES] },
      },
    });
  }
}
