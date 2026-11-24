import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import {
  resolvePagination,
  type PaginationQueryDto,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';

const MENU_ITEM_INCLUDE = {
  category: { select: { name: true } },
  modifierGroups: {
    include: {
      group: {
        include: {
          options: true,
        },
      },
    },
  },
} as const;

@Injectable()
export class MenuItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByOutlet(
    outletId: string,
    options: {
      includeInactive: boolean;
      categoryId?: string;
      isAvailable?: boolean;
    },
    pagination?: PaginationQueryDto,
  ) {
    const page = resolvePagination(pagination);
    const where = {
      outletId,
      ...(options.includeInactive ? {} : { isActive: true }),
      ...(options.categoryId ? { categoryId: options.categoryId } : {}),
      ...(options.isAvailable === undefined
        ? {}
        : { isAvailable: options.isAvailable }),
    };
    const orderBy = [
      { category: { sortOrder: 'asc' as const } },
      { sortOrder: 'asc' as const },
      { name: 'asc' as const },
    ];

    if (page.all) {
      const items = await this.prisma.menuItem.findMany({
        where,
        include: MENU_ITEM_INCLUDE,
        orderBy,
      });
      return { items, total: items.length };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.menuItem.findMany({
        where,
        include: MENU_ITEM_INCLUDE,
        orderBy,
        skip: page.skip,
        take: page.pageSize,
      }),
      this.prisma.menuItem.count({ where }),
    ]);

    return { items, total };
  }

  async findById(
    outletId: string,
    menuItemId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.menuItem.findFirst({
      where: { id: menuItemId, outletId },
      include: MENU_ITEM_INCLUDE,
    });
  }

  async create(data: Prisma.MenuItemUncheckedCreateInput) {
    return this.prisma.menuItem.create({ data });
  }

  async update(
    outletId: string,
    menuItemId: string,
    data: Prisma.MenuItemUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.menuItem.updateMany({
      where: { id: menuItemId, outletId },
      data,
    });
  }

  async replaceModifierGroups(
    menuItemId: string,
    groupIds: string[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    await client.menuItemModifierGroup.deleteMany({ where: { menuItemId } });

    if (groupIds.length > 0) {
      await client.menuItemModifierGroup.createMany({
        data: groupIds.map((groupId) => ({ menuItemId, groupId })),
      });
    }
  }
}
