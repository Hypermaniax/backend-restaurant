import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { Roles } from '../security/decorators/roles.decorator';
import { JwtAuthGuard } from '../security/guards/jwt-auth.guard';
import { RolesGuard } from '../security/guards/roles.guard';
import { MESSAGES, withMessage } from '../../common/response';
import type { AuthUser } from '../security/types/auth-user';
import { OpenTableSessionDto } from './dto/table.dto';
import { TableSessionService } from './table-session.service';
import { TablesService } from './tables.service';

@ApiTags('cashier-tables')
@ApiBearerAuth()
@Controller('cashier/tables')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CASHIER, UserRole.ADMIN)
export class CashierTablesController {
  constructor(
    private readonly tables: TablesService,
    private readonly sessions: TableSessionService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Daftar meja untuk filter order kasir' })
  list(@CurrentUser() user: AuthUser) {
    return this.tables.listAll(user.outletId, false);
  }

  @Post(':id/sessions/open')
  @ApiOperation({ summary: 'Buka sesi meja dine-in' })
  async openSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OpenTableSessionDto,
  ) {
    const session = await this.sessions.openSession(user.outletId, id, dto);
    return withMessage(session, MESSAGES.tables.sessionOpened);
  }

  @Post(':id/sessions/close')
  @ApiOperation({ summary: 'Tutup sesi meja jika tidak ada order aktif' })
  async closeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const session = await this.sessions.closeSession(
      user.outletId,
      id,
      user.userId,
    );
    return withMessage(session, MESSAGES.tables.sessionClosed);
  }
}
