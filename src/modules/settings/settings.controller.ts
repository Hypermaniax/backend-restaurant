import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderType, UserRole } from '../../generated/prisma/client';
import { MESSAGES, withMessage } from '../../common/response';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { Roles } from '../security/decorators/roles.decorator';
import { JwtAuthGuard } from '../security/guards/jwt-auth.guard';
import { RolesGuard } from '../security/guards/roles.guard';
import type { AuthUser } from '../security/types/auth-user';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateTaxRuleDto } from './dto/update-tax-rule.dto';
import { SettingsService } from './settings.service';

@ApiTags('admin-settings')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Ambil settings outlet' })
  getSettings(@CurrentUser() user: AuthUser) {
    return this.settings.getSettings(user.outletId);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Ubah settings pajak, service, dan struk' })
  async updateSettings(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateSettingsDto,
  ) {
    const settings = await this.settings.updateSettings(
      user.outletId,
      user.userId,
      dto,
    );
    return withMessage(settings, MESSAGES.settings.updated);
  }

  @Get('tax-rules')
  @ApiOperation({ summary: 'Daftar aturan pajak per tipe order' })
  getTaxRules(@CurrentUser() user: AuthUser) {
    return this.settings.getTaxRules(user.outletId);
  }

  @Patch('tax-rules/:orderType')
  @ApiOperation({ summary: 'Ubah aturan pajak DINE_IN/TAKEAWAY' })
  async updateTaxRule(
    @CurrentUser() user: AuthUser,
    @Param('orderType', new ParseEnumPipe(OrderType))
    orderType: OrderType,
    @Body() dto: UpdateTaxRuleDto,
  ) {
    const taxRule = await this.settings.updateTaxRule(
      user.outletId,
      orderType,
      user.userId,
      dto,
    );
    return withMessage(taxRule, MESSAGES.settings.taxRuleUpdated);
  }
}
