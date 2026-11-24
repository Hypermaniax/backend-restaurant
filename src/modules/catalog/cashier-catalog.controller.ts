import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { Roles } from '../security/decorators/roles.decorator';
import { JwtAuthGuard } from '../security/guards/jwt-auth.guard';
import { RolesGuard } from '../security/guards/roles.guard';
import type { AuthUser } from '../security/types/auth-user';
import { PublicCatalogService } from './public-catalog.service';

@ApiTags('cashier-catalog')
@ApiBearerAuth()
@Controller('cashier/menu')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CASHIER, UserRole.ADMIN)
export class CashierCatalogController {
  constructor(private readonly catalog: PublicCatalogService) {}

  @Get()
  @ApiOperation({ summary: 'Menu aktif untuk POS kasir' })
  getMenu(@CurrentUser() user: AuthUser) {
    return this.catalog.getMenuForCashier(user.outletId);
  }
}
