import type { PrismaService } from '../../prisma/prisma.service';
import { TableSessionRepository } from './table-session.repository';

describe('TableSessionRepository', () => {
  it('counts only active order statuses as blocking', async () => {
    const count = jest.fn().mockResolvedValue(2);
    const prisma = {
      order: { count },
    };
    const repository = new TableSessionRepository(
      prisma as unknown as PrismaService,
    );

    await expect(repository.countBlockingOrders('session-1')).resolves.toBe(2);
    expect(count).toHaveBeenCalledWith({
      where: {
        sessionId: 'session-1',
        status: {
          in: [
            'PENDING_PAYMENT',
            'AWAITING_CASH',
            'PAID',
            'PREPARING',
            'READY',
          ],
        },
      },
    });
  });
});
