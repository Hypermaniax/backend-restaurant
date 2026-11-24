import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MESSAGES, withMessage } from '../../common/response';
import { CreatePublicOrderDto, PublicOrderQuoteDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('public-orders')
@Controller('public/orders')
export class PublicOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('quote')
  @HttpCode(200)
  @ApiOperation({ summary: 'Hitung ulang total order customer QR' })
  quote(@Body() dto: PublicOrderQuoteDto) {
    return this.orders.quotePublic(dto);
  }

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Kunci opsional untuk mencegah double order',
  })
  @ApiOperation({
    summary: 'Buat order customer QR dengan pembayaran tunai',
  })
  async create(
    @Body() dto: CreatePublicOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const order = await this.orders.createPublicOrder(dto, idempotencyKey);
    return withMessage(order, MESSAGES.orders.created);
  }
}
