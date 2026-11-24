import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { Roles } from '../security/decorators/roles.decorator';
import { JwtAuthGuard } from '../security/guards/jwt-auth.guard';
import { RolesGuard } from '../security/guards/roles.guard';
import type { AuthUser } from '../security/types/auth-user';
import { OrdersService } from './orders.service';

@ApiTags('cashier-orders')
@ApiBearerAuth()
@Controller('cashier')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CASHIER, UserRole.ADMIN)
export class CashierDashboardController {
  constructor(private readonly orders: OrdersService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Ringkasan operasional kasir hari ini' })
  dashboard(@CurrentUser() user: AuthUser) {
    return this.orders.dashboard(user.outletId);
  }
}
