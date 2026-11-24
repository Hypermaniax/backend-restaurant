import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TableQrService } from './table-qr.service';
import type { TableSessionRepository } from './table-session.repository';
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

const closedSession = {
  ...openSession,
  status: 'CLOSED' as const,
  closedAt: new Date('2026-01-01T01:00:00.000Z'),
  closedByUserId: 'cashier-1',
};

function buildService() {
  const prisma = {
    $transaction: jest.fn((callback: (tx: object) => unknown) =>
      Promise.resolve(callback({})),
    ),
  };
  const tables = {
    listByOutlet: jest.fn(),
    listActiveByOutlet: jest.fn(),
    findById: jest.fn(),
    findActiveByCode: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
  };
  const sessions = {
    findOpenByTable: jest.fn(),
    create: jest.fn(),
    close: jest.fn(),
    countBlockingOrders: jest.fn(),
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
    prisma as unknown as PrismaService,
    tables as unknown as TableRepository,
    sessions as unknown as TableSessionRepository,
    qr as unknown as TableQrService,
    realtime as unknown as RealtimeService,
  );

  return { service, tables, sessions, qr, realtime };
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

  it('opens a session and marks the table occupied', async () => {
    const { service, tables, sessions } = buildService();
    tables.findById.mockResolvedValue(table);
    sessions.findOpenByTable.mockResolvedValue(null);
    sessions.create.mockResolvedValue(openSession);

    const result = await service.openSession('outlet-1', 'table-1', {
      guestCount: 2,
    });

    expect(result.id).toBe('session-1');
    expect(tables.updateStatus).toHaveBeenCalledWith(
      'outlet-1',
      'table-1',
      'OCCUPIED',
      expect.anything(),
    );
  });

  it('rejects closing a session with active orders', async () => {
    const { service, tables, sessions } = buildService();
    tables.findById.mockResolvedValue({ ...table, sessions: [openSession] });
    sessions.findOpenByTable.mockResolvedValue(openSession);
    sessions.countBlockingOrders.mockResolvedValue(1);

    await expect(
      service.closeSession('outlet-1', 'table-1', 'cashier-1'),
    ).rejects.toThrow(BadRequestException);
    expect(sessions.close).not.toHaveBeenCalled();
    expect(tables.updateStatus).not.toHaveBeenCalled();
  });

  it('closes a session and marks the table available', async () => {
    const { service, tables, sessions } = buildService();
    tables.findById.mockResolvedValue({ ...table, sessions: [openSession] });
    sessions.findOpenByTable.mockResolvedValue(openSession);
    sessions.countBlockingOrders.mockResolvedValue(0);
    sessions.close.mockResolvedValue(closedSession);

    const result = await service.closeSession(
      'outlet-1',
      'table-1',
      'cashier-1',
    );

    expect(result.status).toBe('CLOSED');
    expect(tables.updateStatus).toHaveBeenCalledWith(
      'outlet-1',
      'table-1',
      'AVAILABLE',
      expect.anything(),
    );
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
