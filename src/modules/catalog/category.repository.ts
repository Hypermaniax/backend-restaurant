import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import {
  resolvePagination,
  type PaginationQueryDto,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CategoryRepository {
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
      const items = await this.prisma.category.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      return { items, total: items.length };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: page.skip,
        take: page.pageSize,
      }),
      this.prisma.category.count({ where }),
    ]);

    return { items, total };
  }

  async findById(
    outletId: string,
    categoryId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.category.findFirst({
      where: { id: categoryId, outletId },
    });
  }

  async findActiveById(outletId: string, categoryId: string) {
    return this.prisma.category.findFirst({
      where: { id: categoryId, outletId, isActive: true },
    });
  }

  async create(data: Prisma.CategoryUncheckedCreateInput) {
    return this.prisma.category.create({ data });
  }

  async update(
    outletId: string,
    categoryId: string,
    data: Prisma.CategoryUpdateInput,
  ) {
    await this.prisma.category.updateMany({
      where: { id: categoryId, outletId },
      data,
    });

    return this.prisma.category.findFirst({
      where: { id: categoryId, outletId },
    });
  }
}
