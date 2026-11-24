import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { Roles } from '../security/decorators/roles.decorator';
import { JwtAuthGuard } from '../security/guards/jwt-auth.guard';
import { RolesGuard } from '../security/guards/roles.guard';
import type { AuthUser } from '../security/types/auth-user';
import { SettingsService } from './settings.service';

@ApiTags('cashier-settings')
@ApiBearerAuth()
@Controller('cashier/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CASHIER, UserRole.ADMIN)
export class CashierSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('receipt')
  @ApiOperation({ summary: 'Info outlet dan footer untuk struk kasir' })
  receipt(@CurrentUser() user: AuthUser) {
    return this.settings.getReceiptSettings(user.outletId);
  }
}
