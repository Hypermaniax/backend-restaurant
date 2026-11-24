import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { UserRole } from '../../generated/prisma/client';
import { MESSAGES, withMessage } from '../../common/response';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { Roles } from '../security/decorators/roles.decorator';
import { JwtAuthGuard } from '../security/guards/jwt-auth.guard';
import { RolesGuard } from '../security/guards/roles.guard';
import type { AuthUser } from '../security/types/auth-user';
import {
  CreateTableDto,
  TableListQueryDto,
  UpdateTableDto,
} from './dto/table.dto';
import { TablesService } from './tables.service';

@ApiTags('admin-tables')
@ApiBearerAuth()
@Controller('admin/tables')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminTablesController {
  constructor(private readonly tables: TablesService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar meja' })
  list(@CurrentUser() user: AuthUser, @Query() query: TableListQueryDto) {
    return this.tables.list(user.outletId, query);
  }

  @Get('qr.pdf')
  @ApiOperation({ summary: 'PDF semua kartu QR meja aktif' })
  @ApiProduces('application/pdf')
  @Header('Content-Type', 'application/pdf')
  @Header(
    'Content-Disposition',
    'attachment; filename="kartu-qr-meja-rembuk.pdf"',
  )
  async downloadAllQr(
    @CurrentUser() user: AuthUser,
    @Res() response: Response,
  ): Promise<void> {
    const pdf = await this.tables.qrPdf(user.outletId);
    response.end(pdf);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail meja' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tables.get(user.outletId, id);
  }

  @Get(':id/qr.png')
  @ApiOperation({ summary: 'Download QR meja sebagai PNG' })
  @ApiProduces('image/png')
  @Header('Content-Type', 'image/png')
  async downloadQr(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const { buffer, code } = await this.tables.qrPng(user.outletId, id);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="qr-meja-${code}.png"`,
    );
    response.end(buffer);
  }

  @Post()
  @ApiOperation({ summary: 'Buat meja' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateTableDto) {
    const table = await this.tables.create(user.outletId, dto);
    return withMessage(table, MESSAGES.tables.created);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Ubah meja atau aktifkan kembali' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableDto,
  ) {
    const table = await this.tables.update(user.outletId, id, dto);
    return withMessage(table, MESSAGES.tables.updated);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Nonaktifkan meja (soft delete)' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const table = await this.tables.softDelete(user.outletId, id);
    return withMessage(table, MESSAGES.tables.deactivated);
  }
}
