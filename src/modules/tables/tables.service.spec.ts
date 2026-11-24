import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TableQrService } from './table-qr.service';
import type { TableRepository } from './table.repository';
import { TablesService } from './tables.service';
import type { RealtimeService } from '../realtime/realtime.service';

const table = {
  id: 'table-1',
  outletId: 'outlet-1',
  code: 'T01',
  name: 'Meja 01',
  zone: 'Indoor',
  status: 'AVAILABLE' as const,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  sessions: [],
};

const openSession = {
  id: 'session-1',
  tableId: 'table-1',
  status: 'OPEN' as const,
  guestCount: 2,
  openedAt: new Date('2026-01-01T00:00:00.000Z'),
  closedAt: null,
  closedByUserId: null,
};

function buildService() {
  const tables = {
    listByOutlet: jest.fn(),
    listActiveByOutlet: jest.fn(),
    findById: jest.fn(),
    findActiveByCode: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
  };
  const qr = {
    buildTableUrl: jest.fn(),
    createPng: jest.fn(),
    createPdf: jest.fn(),
  };
  const realtime = {
    emitTableUpdated: jest.fn(),
    emitSessionClosed: jest.fn(),
  };

  const service = new TablesService(
    tables as unknown as TableRepository,
    qr as unknown as TableQrService,
    realtime as unknown as RealtimeService,
  );

  return { service, tables, qr, realtime };
}

describe('TablesService', () => {
  it('returns tables with pagination metadata', async () => {
    const { service, tables } = buildService();
    tables.listByOutlet.mockResolvedValue({ items: [table], total: 21 });

    const result = await service.list('outlet-1', {
      page: 2,
      pageSize: 20,
    });

    expect(tables.listByOutlet).toHaveBeenCalledWith('outlet-1', false, {
      page: 2,
      pageSize: 20,
    });
    expect(result.items).toHaveLength(1);
    expect(result.meta).toEqual({
      page: 2,
      pageSize: 20,
      total: 21,
      totalPages: 2,
    });
  });

  it('rejects deactivating a table with an open session', async () => {
    const { service, tables } = buildService();
    tables.findById.mockResolvedValue({ ...table, sessions: [openSession] });

    await expect(service.softDelete('outlet-1', 'table-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(tables.update).not.toHaveBeenCalled();
  });

  it('normalizes a public table code before lookup', async () => {
    const { service, tables } = buildService();
    tables.findActiveByCode.mockResolvedValue({
      ...table,
      outlet: { id: 'outlet-1', name: 'Rembuk', slug: 'rembuk' },
      sessions: [],
    });

    const result = await service.resolvePublicTable('t01');

    expect(tables.findActiveByCode).toHaveBeenCalledWith('T01');
    expect(result.code).toBe('T01');
    expect(result.session).toBeNull();
  });

  it('rejects a missing or inactive public table code', async () => {
    const { service, tables } = buildService();
    tables.findActiveByCode.mockResolvedValue(null);

    await expect(service.resolvePublicTable('T99')).rejects.toThrow(
      NotFoundException,
    );
  });
});
