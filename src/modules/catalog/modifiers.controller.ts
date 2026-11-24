import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { MESSAGES, withMessage } from '../../common/response';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { Roles } from '../security/decorators/roles.decorator';
import { JwtAuthGuard } from '../security/guards/jwt-auth.guard';
import { RolesGuard } from '../security/guards/roles.guard';
import type { AuthUser } from '../security/types/auth-user';
import {
  CreateModifierGroupDto,
  CreateModifierOptionDto,
  UpdateModifierGroupDto,
  UpdateModifierOptionDto,
} from './dto/modifier.dto';
import { CatalogListQueryDto } from './dto/catalog-list-query.dto';
import { ModifiersService } from './modifiers.service';

@ApiTags('admin-modifiers')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ModifiersController {
  constructor(private readonly modifiers: ModifiersService) {}

  @Get('modifier-groups')
  @ApiOperation({ summary: 'Daftar grup modifier dan opsinya' })
  listGroups(
    @CurrentUser() user: AuthUser,
    @Query() query: CatalogListQueryDto,
  ) {
    return this.modifiers.listGroups(user.outletId, query);
  }

  @Post('modifier-groups')
  @ApiOperation({ summary: 'Buat grup modifier' })
  async createGroup(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateModifierGroupDto,
  ) {
    const group = await this.modifiers.createGroup(user.outletId, dto);
    return withMessage(group, MESSAGES.catalog.modifierGroupCreated);
  }

  @Patch('modifier-groups/:id')
  @ApiOperation({ summary: 'Ubah grup modifier atau aktifkan kembali' })
  async updateGroup(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateModifierGroupDto,
  ) {
    const group = await this.modifiers.updateGroup(user.outletId, id, dto);
    return withMessage(group, MESSAGES.catalog.modifierGroupUpdated);
  }

  @Delete('modifier-groups/:id')
  @ApiOperation({ summary: 'Nonaktifkan grup modifier (soft delete)' })
  async removeGroup(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const group = await this.modifiers.softDeleteGroup(user.outletId, id);
    return withMessage(group, MESSAGES.catalog.modifierGroupDeactivated);
  }

  @Post('modifier-groups/:id/options')
  @ApiOperation({ summary: 'Tambah opsi modifier' })
  async createOption(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateModifierOptionDto,
  ) {
    const option = await this.modifiers.createOption(user.outletId, id, dto);
    return withMessage(option, MESSAGES.catalog.modifierOptionCreated);
  }

  @Patch('modifier-options/:id')
  @ApiOperation({ summary: 'Ubah opsi modifier atau aktifkan kembali' })
  async updateOption(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateModifierOptionDto,
  ) {
    const option = await this.modifiers.updateOption(user.outletId, id, dto);
    return withMessage(option, MESSAGES.catalog.modifierOptionUpdated);
  }

  @Delete('modifier-options/:id')
  @ApiOperation({ summary: 'Nonaktifkan opsi modifier (soft delete)' })
  async removeOption(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const option = await this.modifiers.softDeleteOption(user.outletId, id);
    return withMessage(option, MESSAGES.catalog.modifierOptionDeactivated);
  }
}
