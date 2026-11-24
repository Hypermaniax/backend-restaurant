import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { Roles } from '../security/decorators/roles.decorator';
import { JwtAuthGuard } from '../security/guards/jwt-auth.guard';
import { RolesGuard } from '../security/guards/roles.guard';
import { MESSAGES, withMessage } from '../../common/response';
import type { AuthUser } from '../security/types/auth-user';
import {
  CancelOrderDto,
  CashierOrderQuoteDto,
  ConfirmOrderPaymentDto,
  CreateCashierOrderDto,
  OrderListQueryDto,
} from './dto/order.dto';
import { CashierOrderCreationService } from './cashier-order-creation.service';
import { OrderQuoteService } from './order-quote.service';
import { OrderQueryService } from './order-query.service';
import { OrderLifecycleService } from './order-lifecycle.service';

@ApiTags('cashier-orders')
@ApiBearerAuth()
@Controller('cashier/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CASHIER, UserRole.ADMIN)
export class CashierOrdersController {
  constructor(
    private readonly lifecycle: OrderLifecycleService,
    private readonly quoteService: OrderQuoteService,
    private readonly creation: CashierOrderCreationService,
    private readonly query: OrderQueryService,
  ) {}

  @Post('quote')
  @HttpCode(200)
  @ApiOperation({ summary: 'Hitung ulang total order kasir' })
  quote(@CurrentUser() user: AuthUser, @Body() dto: CashierOrderQuoteDto) {
    return this.quoteService.quoteCashier(user.outletId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Daftar order kasir dengan filter' })
  list(@CurrentUser() user: AuthUser, @Query() query: OrderListQueryDto) {
    return this.query.listCashier(user.outletId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail order kasir' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.query.getCashierOrder(user.outletId, id);
  }

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Kunci opsional untuk mencegah double order',
  })
  @ApiOperation({
    summary: 'Buat order kasir tunai/EDC/QRIS',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCashierOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const order = await this.creation.createCashierOrder(
      user.outletId,
      user,
      dto,
      idempotencyKey,
    );
    return withMessage(order, MESSAGES.orders.created);
  }

  @Post(':id/confirm-payment')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Konfirmasi pembayaran tunai/EDC order customer',
  })
  async confirmPayment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmOrderPaymentDto,
  ) {
    const order = await this.lifecycle.confirmPayment(
      user.outletId,
      id,
      user,
      dto,
    );
    return withMessage(order, MESSAGES.orders.paymentConfirmed);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Batalkan order yang belum dibayar' })
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    const order = await this.lifecycle.cancelOrder(
      user.outletId,
      id,
      user,
      dto,
    );
    return withMessage(order, MESSAGES.orders.cancelled);
  }
}
