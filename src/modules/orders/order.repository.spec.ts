import { CounterType, type Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { OrderRepository } from './order.repository';

function buildRepository() {
  const counters = new Map<string, number>();
  const prisma = {
    dailyCounter: {
      upsert: jest.fn((args: Prisma.DailyCounterUpsertArgs) => {
        const key = JSON.stringify(args.where);
        const existing = counters.get(key);
        const lastNumber = existing === undefined ? 1 : existing + 1;
        counters.set(key, lastNumber);
        return Promise.resolve({ ...args.create, lastNumber });
      }),
    },
  };

  return {
    repository: new OrderRepository(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('OrderRepository queue counter', () => {
  it('increments per day and resets for the next business date', async () => {
    const { repository } = buildRepository();
    const dayOne = new Date('2026-11-22T00:00:00.000Z');
    const dayTwo = new Date('2026-11-23T00:00:00.000Z');

    await expect(
      repository.nextCounter('outlet-1', dayOne, CounterType.QUEUE),
    ).resolves.toBe(1);
    await expect(
      repository.nextCounter('outlet-1', dayOne, CounterType.QUEUE),
    ).resolves.toBe(2);
    await expect(
      repository.nextCounter('outlet-1', dayTwo, CounterType.QUEUE),
    ).resolves.toBe(1);
  });

  it('keeps order and queue counters independent', async () => {
    const { repository } = buildRepository();
    const day = new Date('2026-11-22T00:00:00.000Z');

    await expect(
      repository.nextCounter('outlet-1', day, CounterType.ORDER),
    ).resolves.toBe(1);
    await expect(
      repository.nextCounter('outlet-1', day, CounterType.QUEUE),
    ).resolves.toBe(1);
  });
});
