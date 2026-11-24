import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByOutlet(outletId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.settings.findUnique({ where: { outletId } });
  }

  async update(
    outletId: string,
    data: Prisma.SettingsUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.settings.update({ where: { outletId }, data });
  }
}
