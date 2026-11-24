import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SecurityModule } from '../security/security.module';
import { CashierSettingsController } from './cashier-settings.controller';
import { SettingsController } from './settings.controller';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';
import { TaxRuleRepository } from './tax-rule.repository';

@Module({
  imports: [SecurityModule, AuditModule],
  controllers: [SettingsController, CashierSettingsController],
  providers: [SettingsRepository, TaxRuleRepository, SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
