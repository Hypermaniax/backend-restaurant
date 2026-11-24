import {
  Controller,
  HttpCode,
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
import { PaymentsService } from './payments.service';

@ApiTags('cashier-payments')
@ApiBearerAuth()
@Controller('cashier/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CASHIER, UserRole.ADMIN)
export class CashierPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':id/pay-qris')
  @HttpCode(200)
  @ApiOperation({ summary: 'Buat atau ambil QRIS Xendit untuk order kasir' })
  async payQris(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const payment = await this.payments.payCashier(user.outletId, id, user);
    return withMessage(payment, MESSAGES.payments.qrisReady);
  }
}
