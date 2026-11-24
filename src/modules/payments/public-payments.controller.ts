import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MESSAGES, withMessage } from '../../common/response';
import { PublicOrderPaymentDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('public-payments')
@Controller('public/orders')
export class PublicPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':orderId/pay-online')
  @HttpCode(200)
  @ApiOperation({ summary: 'Buat atau ambil QRIS Xendit untuk order customer' })
  async payOnline(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: PublicOrderPaymentDto,
  ) {
    const payment = await this.payments.payPublic(dto.tableCode, orderId);
    return withMessage(payment, MESSAGES.payments.qrisReady);
  }

  @Post(':orderId/simulate-payment')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Simulasi pembayaran QRIS Xendit untuk test mode',
  })
  async simulatePayment(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: PublicOrderPaymentDto,
  ) {
    const result = await this.payments.simulatePublic(dto.tableCode, orderId);
    return withMessage(result, MESSAGES.payments.simulationSent);
  }

  @Get(':orderId/payment-status')
  @ApiOperation({
    summary: 'Polling status pembayaran customer tanpa detail order',
  })
  status(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Query() query: PublicOrderPaymentDto,
  ) {
    return this.payments.getPublicStatus(query.tableCode, orderId);
  }
}
