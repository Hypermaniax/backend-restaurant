import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { AuditLogRepository } from './audit-log.repository';

export interface AuditEntry {
  outletId: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class AuditService {
  constructor(private readonly logs: AuditLogRepository) {}

  async record(entry: AuditEntry, tx?: Prisma.TransactionClient) {
    return this.logs.create(
      {
        outletId: entry.outletId,
        actorUserId: entry.actorUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: this.toJson(entry.before),
        after: this.toJson(entry.after),
      },
      tx,
    );
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }

    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
