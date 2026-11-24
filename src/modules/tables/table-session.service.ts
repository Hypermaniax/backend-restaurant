import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TableSessionStatus,
  TableStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { OpenTableSessionDto } from './dto/table.dto';
import { RealtimeService } from '../realtime/realtime.service';
import { toSessionView } from './table.mapper';
import { TableSessionRepository } from './table-session.repository';
import { TableRepository } from './table.repository';
import type { TableSessionView, TableWithOpenSession } from './table.types';

@Injectable()
export class TableSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tables: TableRepository,
    private readonly sessions: TableSessionRepository,
    private readonly realtime: RealtimeService,
  ) {}

  async openSession(
    outletId: string,
    tableId: string,
    dto: OpenTableSessionDto,
  ): Promise<TableSessionView> {
    const session = await this.prisma.$transaction(async (tx) => {
      const table = await this.requireTable(outletId, tableId, tx);
      if (!table.isActive) {
        throw new BadRequestException('Meja nonaktif');
      }

      const existing = await this.sessions.findOpenByTable(tableId, tx);
      if (existing) {
        throw new ConflictException('Meja masih memiliki sesi terbuka');
      }

      const session = await this.sessions.create(
        {
          tableId,
          status: TableSessionStatus.OPEN,
          guestCount: dto.guestCount ?? null,
        },
        tx,
      );

      await this.tables.updateStatus(
        outletId,
        tableId,
        TableStatus.OCCUPIED,
        tx,
      );

      return toSessionView(session);
    });

    this.realtime.emitTableUpdated(outletId, {
      tableId,
      status: TableStatus.OCCUPIED,
    });
    return session;
  }

  async ensureSessionForOrder(
    outletId: string,
    tableId: string,
    tx: Prisma.TransactionClient,
  ): Promise<TableSessionView> {
    const table = await this.tables.findById(outletId, tableId, tx);
    if (!table || !table.isActive) {
      throw new BadRequestException('Meja tidak ditemukan atau nonaktif');
    }

    const existing = await this.sessions.findOpenByTable(tableId, tx);
    if (existing) {
      return toSessionView(existing);
    }

    const session = await this.sessions.create(
      {
        tableId,
        status: TableSessionStatus.OPEN,
        guestCount: null,
      },
      tx,
    );
    await this.tables.updateStatus(outletId, tableId, TableStatus.OCCUPIED, tx);
    return toSessionView(session);
  }

  async requireSessionForOrder(
    outletId: string,
    tableId: string,
    tx: Prisma.TransactionClient,
  ): Promise<TableSessionView> {
    const table = await this.tables.findById(outletId, tableId, tx);
    if (!table || !table.isActive) {
      throw new BadRequestException('Meja tidak ditemukan atau nonaktif');
    }

    const open = await this.sessions.findOpenByTable(tableId, tx);
    if (!open) {
      throw new BadRequestException('Buka sesi meja terlebih dahulu');
    }
    return toSessionView(open);
  }

  async closeSession(
    outletId: string,
    tableId: string,
    actorUserId: string,
  ): Promise<TableSessionView> {
    const session = await this.prisma.$transaction(async (tx) => {
      await this.requireTable(outletId, tableId, tx);
      const open = await this.sessions.findOpenByTable(tableId, tx);
      if (!open) {
        throw new NotFoundException('Sesi meja terbuka tidak ditemukan');
      }

      const blocking = await this.sessions.countBlockingOrders(open.id, tx);
      if (blocking > 0) {
        throw new BadRequestException(
          'Masih ada order aktif yang belum selesai',
        );
      }

      const closed = await this.sessions.close(open.id, actorUserId, tx);
      await this.tables.updateStatus(
        outletId,
        tableId,
        TableStatus.AVAILABLE,
        tx,
      );

      return toSessionView(closed);
    });

    this.realtime.emitSessionClosed(outletId, {
      sessionId: session.id,
      tableId,
    });
    this.realtime.emitTableUpdated(outletId, {
      tableId,
      status: TableStatus.AVAILABLE,
    });
    return session;
  }

  private async requireTable(
    outletId: string,
    tableId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TableWithOpenSession> {
    const table = await this.tables.findById(outletId, tableId, tx);
    if (!table) {
      throw new NotFoundException('Meja tidak ditemukan');
    }
    return table;
  }
}
