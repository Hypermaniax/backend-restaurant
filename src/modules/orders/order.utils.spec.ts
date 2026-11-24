import { BadRequestException } from '@nestjs/common';
import {
  OrderStatusSource,
  Prisma,
  UserRole,
} from '../../generated/prisma/client';
import {
  createPaymentReference,
  formatOrderNumber,
  isUniqueConstraintError,
  normalizeIdempotencyKey,
  resolveBusinessDate,
  resolveStatusSource,
} from './order.utils';

describe('order utils', () => {
  describe('normalizeIdempotencyKey', () => {
    it('mengembalikan null untuk key kosong', () => {
      expect(normalizeIdempotencyKey(undefined)).toBeNull();
      expect(normalizeIdempotencyKey('   ')).toBeNull();
    });

    it('memangkas spasi di sekitar key', () => {
      expect(normalizeIdempotencyKey('  order-123  ')).toBe('order-123');
    });

    it('menolak key lebih dari 64 karakter', () => {
      expect(() => normalizeIdempotencyKey('a'.repeat(65))).toThrow(
        BadRequestException,
      );
    });
  });

  describe('resolveBusinessDate', () => {
    it('memakai tanggal lokal outlet, bukan UTC', () => {
      const now = new Date('2026-11-22T17:00:00.000Z');

      expect(resolveBusinessDate(now, 'Asia/Jakarta').toISOString()).toBe(
        '2026-11-23T00:00:00.000Z',
      );
    });
  });

  describe('formatOrderNumber', () => {
    it('memformat tanggal dan urutan menjadi nomor order', () => {
      expect(formatOrderNumber(new Date('2026-11-22T00:00:00.000Z'), 7)).toBe(
        '20261122-0007',
      );
    });
  });

  describe('createPaymentReference', () => {
    it('membuat referensi pembayaran unik', () => {
      const first = createPaymentReference();
      const second = createPaymentReference();

      expect(first).toMatch(/^PAY-/);
      expect(first).not.toBe(second);
    });
  });

  describe('resolveStatusSource', () => {
    it('membedakan sumber status admin dan kasir', () => {
      expect(resolveStatusSource(UserRole.ADMIN)).toBe(OrderStatusSource.ADMIN);
      expect(resolveStatusSource(UserRole.CASHIER)).toBe(
        OrderStatusSource.CASHIER,
      );
    });
  });

  describe('isUniqueConstraintError', () => {
    it('mengenali error unik Prisma P2002', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Duplikat', {
        code: 'P2002',
        clientVersion: 'test',
      });

      expect(isUniqueConstraintError(error)).toBe(true);
      expect(isUniqueConstraintError(new Error('lain'))).toBe(false);
    });
  });
});
