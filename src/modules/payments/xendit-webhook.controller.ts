import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class XenditWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('xendit')
  @HttpCode(200)
  @ApiHeader({
    name: 'x-callback-token',
    required: true,
    description: 'Token verifikasi webhook Xendit',
  })
  @ApiOperation({ summary: 'Terima webhook pembayaran Xendit' })
  xendit(
    @Headers('x-callback-token') token: string | undefined,
    @Body() body: unknown,
  ) {
    return this.payments.handleXenditWebhook(token, body);
  }
}
