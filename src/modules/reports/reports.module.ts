import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { ReportRepository } from './report.repository';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [SecurityModule],
  controllers: [ReportsController],
  providers: [ReportRepository, ReportsService],
})
export class ReportsModule {}
