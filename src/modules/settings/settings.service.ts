import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  OrderType,
  Prisma,
  Settings,
  TaxRule,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UpdateSettingsDto } from './dto/update-settings.dto';
import type { UpdateTaxRuleDto } from './dto/update-tax-rule.dto';
import { SettingsRepository } from './settings.repository';
import type {
  ReceiptSettingsView,
  SettingsView,
  TaxRuleView,
} from './settings.types';
import { TaxRuleRepository } from './tax-rule.repository';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsRepository,
    private readonly taxRules: TaxRuleRepository,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async getSettings(outletId: string): Promise<SettingsView> {
    const settings = await this.settings.findByOutlet(outletId);

    if (!settings) {
      throw new NotFoundException('Settings outlet belum dikonfigurasi');
    }

    return this.toSettingsView(settings);
  }

  async getReceiptSettings(outletId: string): Promise<ReceiptSettingsView> {
    const [outlet, settings] = await Promise.all([
      this.prisma.outlet.findUnique({
        where: { id: outletId },
        select: { name: true },
      }),
      this.settings.findByOutlet(outletId),
    ]);
    if (!outlet || !settings) {
      throw new NotFoundException('Outlet atau settings tidak ditemukan');
    }

    return {
      outletName: outlet.name,
      taxInclusive: settings.taxInclusive,
      receiptFooter: settings.receiptFooter,
    };
  }

  async updateSettings(
    outletId: string,
    actorUserId: string,
    dto: UpdateSettingsDto,
  ): Promise<SettingsView> {
    const before = await this.settings.findByOutlet(outletId);

    if (!before) {
      throw new NotFoundException('Settings outlet belum dikonfigurasi');
    }

    const data: Prisma.SettingsUpdateInput = {};
    if (dto.taxInclusive !== undefined) {
      data.taxInclusive = dto.taxInclusive;
    }
    if (dto.taxBaseIncludesService !== undefined) {
      data.taxBaseIncludesService = dto.taxBaseIncludesService;
    }
    if (dto.serviceRateBp !== undefined) {
      data.serviceRateBp = dto.serviceRateBp;
    }
    if (dto.requirePaymentBeforeKitchen !== undefined) {
      data.requirePaymentBeforeKitchen = dto.requirePaymentBeforeKitchen;
    }
    if (dto.orderExpiryMinutes !== undefined) {
      data.orderExpiryMinutes = dto.orderExpiryMinutes;
    }
    if (dto.cashExpiryMinutes !== undefined) {
      data.cashExpiryMinutes = dto.cashExpiryMinutes;
    }
    if (dto.receiptFooter !== undefined) {
      data.receiptFooter = dto.receiptFooter;
    }

    if (Object.keys(data).length === 0) {
      return this.toSettingsView(before);
    }

    const after = await this.prisma.$transaction(async (tx) => {
      const updated = await this.settings.update(outletId, data, tx);

      await this.audit.record(
        {
          outletId,
          actorUserId,
          action: 'SETTINGS_UPDATED',
          entityType: 'settings',
          entityId: updated.id,
          before: this.toAuditSettings(before),
          after: this.toAuditSettings(updated),
        },
        tx,
      );

      return updated;
    });

    return this.toSettingsView(after);
  }

  async getTaxRules(outletId: string): Promise<TaxRuleView[]> {
    const rules = await this.taxRules.findAllByOutlet(outletId);
    return rules.map((rule) => this.toTaxRuleView(rule));
  }

  async updateTaxRule(
    outletId: string,
    orderType: OrderType,
    actorUserId: string,
    dto: UpdateTaxRuleDto,
  ): Promise<TaxRuleView> {
    const after = await this.prisma.$transaction(async (tx) => {
      const before = await this.taxRules.findByOutletAndType(
        outletId,
        orderType,
        tx,
      );

      const updated = await this.taxRules.upsert(outletId, orderType, dto, tx);

      await this.audit.record(
        {
          outletId,
          actorUserId,
          action: before ? 'TAX_RULE_UPDATED' : 'TAX_RULE_CREATED',
          entityType: 'tax_rule',
          entityId: updated.id,
          before: before ? this.toAuditTaxRule(before) : undefined,
          after: this.toAuditTaxRule(updated),
        },
        tx,
      );

      return updated;
    });

    return this.toTaxRuleView(after);
  }

  private toSettingsView(settings: Settings): SettingsView {
    return {
      outletId: settings.outletId,
      taxInclusive: settings.taxInclusive,
      taxBaseIncludesService: settings.taxBaseIncludesService,
      serviceRateBp: settings.serviceRateBp,
      requirePaymentBeforeKitchen: settings.requirePaymentBeforeKitchen,
      orderExpiryMinutes: settings.orderExpiryMinutes,
      cashExpiryMinutes: settings.cashExpiryMinutes,
      receiptFooter: settings.receiptFooter,
      updatedAt: settings.updatedAt,
      qrBaseUrl: this.qrBaseUrl(),
    };
  }

  private toTaxRuleView(rule: TaxRule): TaxRuleView {
    return {
      id: rule.id,
      outletId: rule.outletId,
      orderType: rule.orderType,
      isEnabled: rule.isEnabled,
      rateBp: rule.rateBp,
      updatedAt: rule.updatedAt,
    };
  }

  private toAuditSettings(settings: Settings) {
    return {
      taxInclusive: settings.taxInclusive,
      taxBaseIncludesService: settings.taxBaseIncludesService,
      serviceRateBp: settings.serviceRateBp,
      requirePaymentBeforeKitchen: settings.requirePaymentBeforeKitchen,
      orderExpiryMinutes: settings.orderExpiryMinutes,
      cashExpiryMinutes: settings.cashExpiryMinutes,
      receiptFooter: settings.receiptFooter,
    };
  }

  private toAuditTaxRule(rule: TaxRule) {
    return {
      orderType: rule.orderType,
      isEnabled: rule.isEnabled,
      rateBp: rule.rateBp,
    };
  }

  private qrBaseUrl(): string {
    return this.config.getOrThrow<string>('QR_BASE_URL').replace(/\/+$/, '');
  }
}
