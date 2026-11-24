import { Module } from '@nestjs/common';
import { AuditLogRepository } from './audit-log.repository';
import { AuditService } from './audit.service';

@Module({
  providers: [AuditLogRepository, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
