import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { UpdateMenuAvailabilityDto } from './dto/menu-item.dto';
import { MenuItemsService } from './menu-items.service';

@ApiTags('cashier-catalog')
@ApiBearerAuth()
@Controller('cashier/menu-items')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CASHIER, UserRole.ADMIN)
export class CashierMenuController {
  constructor(private readonly menuItems: MenuItemsService) {}

  @Patch(':id/availability')
  @ApiOperation({ summary: 'Toggle ketersediaan menu (kasir/admin)' })
  async updateAvailability(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuAvailabilityDto,
  ) {
    const item = await this.menuItems.updateAvailability(
      user.outletId,
      id,
      dto.isAvailable,
      user.userId,
    );
    return withMessage(item, MESSAGES.catalog.menuAvailabilityUpdated);
  }
}
