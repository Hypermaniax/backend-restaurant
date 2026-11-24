import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { Roles } from '../security/decorators/roles.decorator';
import { JwtAuthGuard } from '../security/guards/jwt-auth.guard';
import { RolesGuard } from '../security/guards/roles.guard';
import type { AuthUser } from '../security/types/auth-user';
import {
  ExportReportQueryDto,
  ItemReportQueryDto,
  ReportDateQueryDto,
} from './dto/report-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('admin-reports')
@ApiBearerAuth()
@Controller('admin/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('daily')
  @ApiOperation({ summary: 'Laporan omzet harian dan per tipe order' })
  daily(@CurrentUser() user: AuthUser, @Query() query: ReportDateQueryDto) {
    return this.reports.daily(user.outletId, query.date);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Laporan pembayaran per metode dan tipe order' })
  payments(@CurrentUser() user: AuthUser, @Query() query: ReportDateQueryDto) {
    return this.reports.payments(user.outletId, query.date);
  }

  @Get('items')
  @ApiOperation({ summary: 'Laporan item terlaris' })
  items(@CurrentUser() user: AuthUser, @Query() query: ItemReportQueryDto) {
    return this.reports.items(user.outletId, query.limit, query.date);
  }

  @Get('tax')
  @ApiOperation({ summary: 'Laporan pajak terkumpul per tipe order' })
  tax(@CurrentUser() user: AuthUser, @Query() query: ReportDateQueryDto) {
    return this.reports.tax(user.outletId, query.date);
  }

  @Get('cancellations')
  @ApiOperation({ summary: 'Laporan order unpaid yang dibatalkan' })
  cancellations(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportDateQueryDto,
  ) {
    return this.reports.cancellations(user.outletId, query.date);
  }

  @Get('export')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Export laporan sebagai CSV' })
  async export(
    @CurrentUser() user: AuthUser,
    @Query() query: ExportReportQueryDto,
    @Res() response: Response,
  ) {
    const file = await this.reports.exportCsv(
      user.outletId,
      query.type,
      query.date,
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    response.send(file.content);
  }
}
