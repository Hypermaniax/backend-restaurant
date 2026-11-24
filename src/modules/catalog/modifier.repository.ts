import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import {
  resolvePagination,
  type PaginationQueryDto,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ModifierRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listGroupsByOutlet(
    outletId: string,
    includeInactive: boolean,
    pagination?: PaginationQueryDto,
  ) {
    const page = resolvePagination(pagination);
    const where = {
      outletId,
      ...(includeInactive ? {} : { isActive: true }),
    };
    const include = {
      options: {
        orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }],
      },
    };
    const orderBy = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

    if (page.all) {
      const items = await this.prisma.modifierGroup.findMany({
        where,
        include,
        orderBy,
      });
      return { items, total: items.length };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.modifierGroup.findMany({
        where,
        include,
        orderBy,
        skip: page.skip,
        take: page.pageSize,
      }),
      this.prisma.modifierGroup.count({ where }),
    ]);

    return { items, total };
  }

  async findGroupById(
    outletId: string,
    groupId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.modifierGroup.findFirst({
      where: { id: groupId, outletId },
      include: {
        options: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
      },
    });
  }

  async findGroupsByIds(outletId: string, groupIds: string[]) {
    if (groupIds.length === 0) {
      return [];
    }

    return this.prisma.modifierGroup.findMany({
      where: { outletId, id: { in: groupIds } },
    });
  }

  async createGroup(data: Prisma.ModifierGroupUncheckedCreateInput) {
    return this.prisma.modifierGroup.create({ data });
  }

  async updateGroup(
    outletId: string,
    groupId: string,
    data: Prisma.ModifierGroupUpdateInput,
  ) {
    await this.prisma.modifierGroup.updateMany({
      where: { id: groupId, outletId },
      data,
    });

    return this.findGroupById(outletId, groupId);
  }

  async createOption(data: Prisma.ModifierOptionUncheckedCreateInput) {
    return this.prisma.modifierOption.create({ data });
  }

  async findOptionByOutlet(outletId: string, optionId: string) {
    return this.prisma.modifierOption.findFirst({
      where: {
        id: optionId,
        group: { outletId },
      },
      include: { group: { select: { id: true, outletId: true } } },
    });
  }

  async updateOption(
    outletId: string,
    optionId: string,
    data: Prisma.ModifierOptionUpdateInput,
  ) {
    const current = await this.findOptionByOutlet(outletId, optionId);
    if (!current) {
      return null;
    }

    return this.prisma.modifierOption.update({
      where: { id: optionId },
      data,
    });
  }
}
