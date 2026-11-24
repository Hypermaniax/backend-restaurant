import {
  Body,
  Controller,
  Get,
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
import { OrderQueryService } from '../orders/order-query.service';
import { OrderFulfillmentService } from '../orders/order-fulfillment.service';
import { UpdateKdsStatusDto } from './dto/kds.dto';

@ApiTags('kds')
@ApiBearerAuth()
@Controller('kds/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.KITCHEN, UserRole.ADMIN)
export class KdsController {
  constructor(
    private readonly fulfillment: OrderFulfillmentService,
    private readonly query: OrderQueryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Antrian KDS order lunas yang belum selesai' })
  list(@CurrentUser() user: AuthUser) {
    return this.query.listKds(user.outletId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Ubah status order dari KDS' })
  async updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKdsStatusDto,
  ) {
    const order = await this.fulfillment.updateKdsStatus(
      user.outletId,
      id,
      user,
      dto.status,
    );
    return withMessage(order, MESSAGES.kds.statusUpdated);
  }
}
