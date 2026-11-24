import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  OrderStatusSource,
  Prisma,
  UserRole,
} from '../../generated/prisma/client';

export function normalizeIdempotencyKey(
  key: string | undefined,
): string | null {
  if (key === undefined) {
    return null;
  }
  const normalized = key.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length > 64) {
    throw new BadRequestException('Idempotency key maksimal 64 karakter');
  }
  return normalized;
}

export function resolveBusinessDate(now: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((item) => item.type === type)?.value);

  return new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
}

export function formatOrderNumber(
  businessDate: Date,
  sequence: number,
): string {
  const date = businessDate.toISOString().slice(0, 10).replaceAll('-', '');
  return `${date}-${String(sequence).padStart(4, '0')}`;
}

export function createPaymentReference(): string {
  return `PAY-${randomUUID()}`;
}

export function resolveStatusSource(role: UserRole): OrderStatusSource {
  return role === UserRole.ADMIN
    ? OrderStatusSource.ADMIN
    : OrderStatusSource.CASHIER;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
