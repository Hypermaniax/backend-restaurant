import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  createPageResult,
  resolvePagination,
  type PageResult,
} from '../../common/pagination/pagination.dto';
import { Prisma, TableStatus } from '../../generated/prisma/client';
import type {
  CreateTableDto,
  TableListQueryDto,
  UpdateTableDto,
} from './dto/table.dto';
import { RealtimeService } from '../realtime/realtime.service';
import { TableQrService } from './table-qr.service';
import { toSessionView } from './table.mapper';
import { TableRepository } from './table.repository';
import type {
  PublicTableView,
  TableView,
  TableWithOpenSession,
} from './table.types';

@Injectable()
export class TablesService {
  constructor(
    private readonly tables: TableRepository,
    private readonly qr: TableQrService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(
    outletId: string,
    query: TableListQueryDto,
  ): Promise<PageResult<TableView>> {
    const pagination = resolvePagination(query);
    const { items, total } = await this.tables.listByOutlet(
      outletId,
      query.includeInactive ?? false,
      query,
    );
    return createPageResult(
      items.map((table) => this.toView(table)),
      total,
      pagination,
    );
  }

  async listAll(
    outletId: string,
    includeInactive = false,
  ): Promise<TableView[]> {
    const { items } = await this.tables.listByOutlet(
      outletId,
      includeInactive,
      {
        all: true,
      },
    );
    return items.map((table) => this.toView(table));
  }

  async create(outletId: string, dto: CreateTableDto): Promise<TableView> {
    try {
      const table = await this.tables.create({
        outletId,
        code: this.normalizeCode(dto.code),
        name: dto.name,
        zone: dto.zone ?? null,
        status: TableStatus.AVAILABLE,
        isActive: dto.isActive ?? true,
      });
      const view = this.toView({ ...table, sessions: [] });
      this.realtime.emitTableUpdated(outletId, {
        tableId: view.id,
        status: view.status,
      });
      return view;
    } catch (error) {
      this.rethrowCodeConflict(error);
      throw error;
    }
  }

  async update(
    outletId: string,
    tableId: string,
    dto: UpdateTableDto,
  ): Promise<TableView> {
    const current = await this.requireTable(outletId, tableId);
    const code =
      dto.code === undefined ? undefined : this.normalizeCode(dto.code);

    if (dto.isActive === false && current.sessions.length > 0) {
      throw new BadRequestException(
        'Tutup sesi meja sebelum menonaktifkan meja',
      );
    }

    try {
      await this.tables.update(outletId, tableId, {
        ...(code === undefined ? {} : { code }),
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.zone === undefined ? {} : { zone: dto.zone }),
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        ...(dto.isActive === false ? { status: TableStatus.AVAILABLE } : {}),
      });
    } catch (error) {
      this.rethrowCodeConflict(error);
      throw error;
    }

    const view = await this.get(outletId, tableId);
    this.realtime.emitTableUpdated(outletId, {
      tableId: view.id,
      status: view.status,
    });
    return view;
  }

  async get(outletId: string, tableId: string): Promise<TableView> {
    return this.toView(await this.requireTable(outletId, tableId));
  }

  async softDelete(outletId: string, tableId: string): Promise<TableView> {
    return this.update(outletId, tableId, { isActive: false });
  }

  async resolvePublicTable(code: string): Promise<PublicTableView> {
    const table = await this.tables.findActiveByCode(this.normalizeCode(code));
    if (!table) {
      throw new NotFoundException('Meja tidak ditemukan atau nonaktif');
    }

    return {
      id: table.id,
      code: table.code,
      name: table.name,
      zone: table.zone,
      status: table.status,
      outlet: table.outlet,
      session: table.sessions[0] ? toSessionView(table.sessions[0]) : null,
    };
  }

  async qrPng(
    outletId: string,
    tableId: string,
  ): Promise<{ buffer: Buffer; code: string }> {
    const table = await this.requireTable(outletId, tableId);
    if (!table.isActive) {
      throw new BadRequestException('Meja nonaktif');
    }
    return {
      buffer: await this.qr.createPng(table.code),
      code: table.code,
    };
  }

  async qrPdf(outletId: string): Promise<Buffer> {
    const tables = await this.tables.listActiveByOutlet(outletId);
    if (tables.length === 0) {
      throw new BadRequestException('Belum ada meja aktif');
    }

    return this.qr.createPdf(
      tables.map((table) => ({
        code: table.code,
        name: table.name,
      })),
    );
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

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private rethrowCodeConflict(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Kode meja sudah digunakan');
    }
  }

  private toView(table: TableWithOpenSession): TableView {
    return {
      id: table.id,
      outletId: table.outletId,
      code: table.code,
      name: table.name,
      zone: table.zone,
      status: table.status,
      isActive: table.isActive,
      openSession: table.sessions[0] ? toSessionView(table.sessions[0]) : null,
      createdAt: table.createdAt,
      updatedAt: table.updatedAt,
    };
  }
}
