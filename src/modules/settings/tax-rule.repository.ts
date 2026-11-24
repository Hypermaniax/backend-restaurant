import { Injectable } from '@nestjs/common';
import type { OrderType, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface TaxRuleInput {
  isEnabled: boolean;
  rateBp: number;
}

@Injectable()
export class TaxRuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByOutlet(outletId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.taxRule.findMany({
      where: { outletId },
      orderBy: { orderType: 'asc' },
    });
  }

  async findByOutletAndType(
    outletId: string,
    orderType: OrderType,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.taxRule.findUnique({
      where: { outletId_orderType: { outletId, orderType } },
    });
  }

  async upsert(
    outletId: string,
    orderType: OrderType,
    data: TaxRuleInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.taxRule.upsert({
      where: { outletId_orderType: { outletId, orderType } },
      create: {
        outletId,
        orderType,
        isEnabled: data.isEnabled,
        rateBp: data.rateBp,
      },
      update: {
        isEnabled: data.isEnabled,
        rateBp: data.rateBp,
      },
    });
  }
}
