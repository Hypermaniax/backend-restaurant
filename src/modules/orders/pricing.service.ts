import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderType, SelectionType } from '../../generated/prisma/client';
import { SettingsService } from '../settings/settings.service';
import type {
  OrderItemInput,
  PricedItem,
  PricedModifier,
  PricingResult,
  PricingTotals,
} from './order.types';
import { OrderRepository, type OrderMenuRecord } from './order.repository';

@Injectable()
export class PricingService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly settings: SettingsService,
  ) {}

  async price(
    outletId: string,
    orderType: OrderType,
    items: OrderItemInput[],
  ): Promise<PricingResult> {
    const menuItemIds = [...new Set(items.map((item) => item.menuItemId))];
    const menuItems = await this.orders.findMenuItemsForOrder(
      outletId,
      menuItemIds,
    );
    const menuById = new Map(menuItems.map((item) => [item.id, item]));

    if (menuItems.length !== menuItemIds.length) {
      throw new BadRequestException(
        'Ada menu yang tidak ditemukan atau bukan milik outlet ini',
      );
    }

    const pricedItems = items.map((item) =>
      this.priceItem(menuById.get(item.menuItemId)!, item),
    );
    const subtotal = pricedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const settings = await this.settings.getSettings(outletId);
    const taxRules = await this.settings.getTaxRules(outletId);
    const taxRule = taxRules.find((rule) => rule.orderType === orderType);
    const taxRateBp = taxRule?.isEnabled ? taxRule.rateBp : 0;
    const discountAmount = 0;
    const net = subtotal - discountAmount;
    const serviceAmount =
      orderType === OrderType.DINE_IN
        ? Math.round((net * settings.serviceRateBp) / 10000)
        : 0;
    const taxBase = net + (settings.taxBaseIncludesService ? serviceAmount : 0);

    let taxAmount = 0;
    let total = net + serviceAmount;

    if (taxRateBp > 0) {
      if (settings.taxInclusive) {
        taxAmount = Math.round((taxBase * taxRateBp) / (10000 + taxRateBp));
      } else {
        taxAmount = Math.round((taxBase * taxRateBp) / 10000);
        total += taxAmount;
      }
    }

    return {
      items: pricedItems,
      subtotal,
      discountAmount,
      serviceAmount,
      taxAmount,
      total,
      taxInclusive: settings.taxInclusive,
      taxBaseIncludesService: settings.taxBaseIncludesService,
      taxRateBp,
      serviceRateBp: settings.serviceRateBp,
    };
  }

  async quote(
    outletId: string,
    orderType: OrderType,
    items: OrderItemInput[],
  ): Promise<PricingTotals> {
    const pricing = await this.price(outletId, orderType, items);
    return {
      subtotal: pricing.subtotal,
      discountAmount: pricing.discountAmount,
      serviceAmount: pricing.serviceAmount,
      taxAmount: pricing.taxAmount,
      total: pricing.total,
      taxInclusive: pricing.taxInclusive,
      taxBaseIncludesService: pricing.taxBaseIncludesService,
      taxRateBp: pricing.taxRateBp,
      serviceRateBp: pricing.serviceRateBp,
    };
  }

  private priceItem(
    menuItem: OrderMenuRecord,
    input: OrderItemInput,
  ): PricedItem {
    if (
      !menuItem.isActive ||
      !menuItem.isAvailable ||
      !menuItem.category.isActive
    ) {
      throw new BadRequestException(`Menu ${menuItem.name} tidak tersedia`);
    }

    const groups = menuItem.modifierGroups
      .map((link) => link.group)
      .filter((group) => group.isActive);
    const options = new Map(
      groups.flatMap((group) =>
        group.options
          .filter((option) => option.isActive)
          .map((option) => [option.id, { option, group }] as const),
      ),
    );

    const selectedIds = input.modifierOptionIds ?? [];
    const modifiers: PricedModifier[] = selectedIds.map((optionId) => {
      const selected = options.get(optionId);
      if (!selected) {
        throw new BadRequestException(
          `Modifier untuk ${menuItem.name} tidak valid atau nonaktif`,
        );
      }
      return {
        modifierOptionId: selected.option.id,
        nameSnapshot: selected.option.name,
        priceDelta: selected.option.priceDelta,
        qty: 1,
      };
    });

    const selectedCount = new Map<string, number>();
    for (const optionId of selectedIds) {
      const groupId = options.get(optionId)!.group.id;
      selectedCount.set(groupId, (selectedCount.get(groupId) ?? 0) + 1);
    }

    for (const group of groups) {
      const count = selectedCount.get(group.id) ?? 0;
      const min = group.isRequired
        ? Math.max(1, group.minSelect)
        : group.minSelect;
      if (count < min) {
        throw new BadRequestException(
          `Pilih minimal ${min} opsi untuk ${group.name}`,
        );
      }

      const max =
        group.selectionType === SelectionType.SINGLE ? 1 : group.maxSelect;
      if (max !== null && count > max) {
        throw new BadRequestException(
          `Pilih maksimal ${max} opsi untuk ${group.name}`,
        );
      }
    }

    const modifierTotal = modifiers.reduce(
      (sum, modifier) => sum + modifier.priceDelta,
      0,
    );
    const unitPrice = menuItem.price;

    return {
      menuItemId: menuItem.id,
      nameSnapshot: menuItem.name,
      unitPrice,
      qty: input.qty,
      notes: input.notes ?? null,
      lineTotal: (unitPrice + modifierTotal) * input.qty,
      modifiers,
    };
  }
}
