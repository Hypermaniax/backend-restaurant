import { Injectable } from '@nestjs/common';
import { OrderType } from '../../generated/prisma/client';
import { TablesService } from '../tables/tables.service';
import type {
  CashierOrderQuoteDto,
  PublicOrderQuoteDto,
} from './dto/order.dto';
import type { PricingTotals } from './order.types';
import { PricingService } from './pricing.service';

@Injectable()
export class OrderQuoteService {
  constructor(
    private readonly pricing: PricingService,
    private readonly tables: TablesService,
  ) {}

  async quotePublic(dto: PublicOrderQuoteDto): Promise<PricingTotals> {
    const table = await this.tables.resolvePublicTable(dto.tableCode);
    return this.pricing.quote(table.outlet.id, OrderType.DINE_IN, dto.items);
  }

  async quoteCashier(
    outletId: string,
    dto: CashierOrderQuoteDto,
  ): Promise<PricingTotals> {
    return this.pricing.quote(outletId, dto.orderType, dto.items);
  }
}
