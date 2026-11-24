import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RealtimeService } from '../realtime/realtime.service';
import { TableSessionService } from './table-session.service';
import type { TableSessionRepository } from './table-session.repository';
import type { TableRepository } from './table.repository';

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
    findById: jest.fn(),
    updateStatus: jest.fn(),
  };
  const sessions = {
    findOpenByTable: jest.fn(),
    findOpenById: jest.fn(),
    create: jest.fn(),
    close: jest.fn(),
    countBlockingOrders: jest.fn(),
  };
  const realtime = {
    emitTableUpdated: jest.fn(),
    emitSessionClosed: jest.fn(),
  };
  const service = new TableSessionService(
    prisma as unknown as PrismaService,
    tables as unknown as TableRepository,
    sessions as unknown as TableSessionRepository,
    realtime as unknown as RealtimeService,
  );

  return { service, prisma, tables, sessions, realtime };
}

describe('TableSessionService', () => {
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

  it('auto-closes an idle session and marks the table available', async () => {
    const { service, tables, sessions, realtime } = buildService();
    sessions.findOpenById.mockResolvedValue(openSession);
    sessions.countBlockingOrders.mockResolvedValue(0);
    sessions.close.mockResolvedValue({
      ...closedSession,
      closedByUserId: null,
    });

    const closed = await service.closeIfIdle('outlet-1', 'session-1');

    expect(closed).toBe(true);
    expect(tables.updateStatus).toHaveBeenCalledWith(
      'outlet-1',
      'table-1',
      'AVAILABLE',
      expect.anything(),
    );
    expect(realtime.emitSessionClosed).toHaveBeenCalledWith('outlet-1', {
      sessionId: 'session-1',
      tableId: 'table-1',
    });
  });

  it('keeps a session open when active orders remain', async () => {
    const { service, sessions } = buildService();
    sessions.findOpenById.mockResolvedValue(openSession);
    sessions.countBlockingOrders.mockResolvedValue(1);

    await expect(service.closeIfIdle('outlet-1', 'session-1')).resolves.toBe(
      false,
    );
    expect(sessions.close).not.toHaveBeenCalled();
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
});
