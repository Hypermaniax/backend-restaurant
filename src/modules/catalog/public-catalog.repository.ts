import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const PUBLIC_MENU_INCLUDE = {
  menuItems: {
    where: { isActive: true },
    include: {
      modifierGroups: {
        include: {
          group: {
            include: {
              options: true,
            },
          },
        },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  },
} satisfies Prisma.CategoryInclude;

export type PublicCategoryRecord = Prisma.CategoryGetPayload<{
  include: typeof PUBLIC_MENU_INCLUDE;
}>;

@Injectable()
export class PublicCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMenu(outletId: string): Promise<PublicCategoryRecord[]> {
    return this.prisma.category.findMany({
      where: { outletId, isActive: true },
      include: PUBLIC_MENU_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }
}
