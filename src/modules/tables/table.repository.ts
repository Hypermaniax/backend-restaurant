import { Injectable } from '@nestjs/common';
import type { Prisma, TableStatus } from '../../generated/prisma/client';
import {
  resolvePagination,
  type PaginationQueryDto,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';

const OPEN_SESSION_INCLUDE = {
  sessions: {
    where: { status: 'OPEN' as const },
    orderBy: { openedAt: 'desc' as const },
    take: 1,
  },
} as const;

@Injectable()
export class TableRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByOutlet(
    outletId: string,
    includeInactive: boolean,
    pagination?: PaginationQueryDto,
  ) {
    const page = resolvePagination(pagination);
    const where = {
      outletId,
      ...(includeInactive ? {} : { isActive: true }),
    };

    if (page.all) {
      const items = await this.prisma.diningTable.findMany({
        where,
        include: OPEN_SESSION_INCLUDE,
        orderBy: [{ code: 'asc' }],
      });
      return { items, total: items.length };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.diningTable.findMany({
        where,
        include: OPEN_SESSION_INCLUDE,
        orderBy: [{ code: 'asc' }],
        skip: page.skip,
        take: page.pageSize,
      }),
      this.prisma.diningTable.count({ where }),
    ]);

    return { items, total };
  }

  async listActiveByOutlet(outletId: string) {
    return this.prisma.diningTable.findMany({
      where: { outletId, isActive: true },
      orderBy: [{ code: 'asc' }],
    });
  }

  async findById(
    outletId: string,
    tableId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.diningTable.findFirst({
      where: { id: tableId, outletId },
      include: OPEN_SESSION_INCLUDE,
    });
  }

  async findActiveByCode(code: string) {
    return this.prisma.diningTable.findFirst({
      where: { code, isActive: true },
      include: {
        outlet: { select: { id: true, name: true, slug: true } },
        sessions: {
          where: { status: 'OPEN' },
          orderBy: { openedAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async create(data: Prisma.DiningTableUncheckedCreateInput) {
    return this.prisma.diningTable.create({ data });
  }

  async update(
    outletId: string,
    tableId: string,
    data: Prisma.DiningTableUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    await client.diningTable.updateMany({
      where: { id: tableId, outletId },
      data,
    });
  }

  async updateStatus(
    outletId: string,
    tableId: string,
    status: TableStatus,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    await client.diningTable.updateMany({
      where: { id: tableId, outletId },
      data: { status },
    });
  }
}
