import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { OrdersService } from '../orders/orders.service';
import { DisplayQueueQueryDto } from './dto/kds.dto';

@ApiTags('public-display')
@Controller('public/display')
export class PublicDisplayController {
  constructor(private readonly orders: OrdersService) {}

  @Get('queue')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Antrian publik tanpa PII untuk layar /display',
  })
  queue(@Query() query: DisplayQueueQueryDto) {
    return this.orders.getDisplayQueue(query.outletId);
  }
}
