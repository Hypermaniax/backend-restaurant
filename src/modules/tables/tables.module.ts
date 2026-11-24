import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { AdminTablesController } from './admin-tables.controller';
import { CashierTablesController } from './cashier-tables.controller';
import { PublicTablesController } from './public-tables.controller';
import { TableQrService } from './table-qr.service';
import { TableRepository } from './table.repository';
import { TableSessionRepository } from './table-session.repository';
import { TableSessionService } from './table-session.service';
import { TablesService } from './tables.service';

@Module({
  imports: [SecurityModule],
  controllers: [
    AdminTablesController,
    CashierTablesController,
    PublicTablesController,
  ],
  providers: [
    TableRepository,
    TableSessionRepository,
    TableQrService,
    TableSessionService,
    TablesService,
  ],
  exports: [TablesService, TableSessionService],
})
export class TablesModule {}
