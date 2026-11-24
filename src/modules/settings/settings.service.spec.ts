import type { ConfigService } from '@nestjs/config';
import {
  OrderType,
  type Settings,
  type TaxRule,
} from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';
import type { TaxRuleRepository } from './tax-rule.repository';

const settings: Settings = {
  id: 'settings-1',
  outletId: 'outlet-1',
  taxInclusive: false,
  taxBaseIncludesService: true,
  serviceRateBp: 500,
  requirePaymentBeforeKitchen: true,
  orderExpiryMinutes: 15,
  cashExpiryMinutes: 30,
  receiptFooter: 'Terima kasih',
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function buildService() {
  const prisma = {
    $transaction: jest.fn((callback: (tx: object) => unknown) =>
      Promise.resolve(callback({})),
    ),
  };
  const settingsRepo = {
    findByOutlet: jest.fn(),
    update: jest.fn(),
  };
  const taxRules = {
    findAllByOutlet: jest.fn(),
    findByOutletAndType: jest.fn(),
    upsert: jest.fn(),
  };
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    getOrThrow: jest.fn().mockReturnValue('http://localhost:5173/'),
  };
  const service = new SettingsService(
    prisma as unknown as PrismaService,
    settingsRepo as unknown as SettingsRepository,
    taxRules as unknown as TaxRuleRepository,
    audit as unknown as AuditService,
    config as unknown as ConfigService,
  );

  return { service, settingsRepo, taxRules, audit };
}

describe('SettingsService', () => {
  it('updates settings and writes an audit log', async () => {
    const { service, settingsRepo, audit } = buildService();
    const after = { ...settings, serviceRateBp: 1000 };
    settingsRepo.findByOutlet.mockResolvedValue(settings);
    settingsRepo.update.mockResolvedValue(after);

    const result = await service.updateSettings(settings.outletId, 'admin-1', {
      serviceRateBp: 1000,
    });

    expect(settingsRepo.update).toHaveBeenCalledWith(
      settings.outletId,
      { serviceRateBp: 1000 },
      expect.anything(),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SETTINGS_UPDATED',
        actorUserId: 'admin-1',
        before: expect.objectContaining({
          serviceRateBp: 500,
        }) as unknown,
        after: expect.objectContaining({
          serviceRateBp: 1000,
        }) as unknown,
      }),
      expect.anything(),
    );
    expect(result).toMatchObject({
      serviceRateBp: 1000,
      qrBaseUrl: 'http://localhost:5173',
    });
  });

  it('creates an audit entry when a tax rule is first set', async () => {
    const { service, taxRules, audit } = buildService();
    const rule: TaxRule = {
      id: 'tax-1',
      outletId: settings.outletId,
      orderType: OrderType.TAKEAWAY,
      isEnabled: true,
      rateBp: 1000,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    taxRules.findByOutletAndType.mockResolvedValue(null);
    taxRules.upsert.mockResolvedValue(rule);

    const result = await service.updateTaxRule(
      settings.outletId,
      OrderType.TAKEAWAY,
      'admin-1',
      { isEnabled: true, rateBp: 1000 },
    );

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TAX_RULE_CREATED',
        entityType: 'tax_rule',
        before: undefined,
        after: expect.objectContaining({ rateBp: 1000 }) as unknown,
      }),
      expect.anything(),
    );
    expect(result).toMatchObject({
      orderType: OrderType.TAKEAWAY,
      rateBp: 1000,
    });
  });
});
