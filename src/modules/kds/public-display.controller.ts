import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { OrderQueryService } from '../orders/order-query.service';
import { DisplayQueueQueryDto } from './dto/kds.dto';

@ApiTags('public-display')
@Controller('public/display')
export class PublicDisplayController {
  constructor(private readonly query: OrderQueryService) {}

  @Get('queue')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Antrian publik tanpa PII untuk layar /display',
  })
  queue(@Query() query: DisplayQueueQueryDto) {
    return this.query.getDisplayQueue(query.outletId);
  }
}
