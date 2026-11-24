import { BadRequestException } from '@nestjs/common';
import { OrderType, SelectionType } from '../../generated/prisma/client';
import type { OrderRepository } from './order.repository';
import { PricingService } from './pricing.service';
import type { SettingsService } from '../settings/settings.service';

const menuItem = {
  id: 'item-1',
  name: 'Nasi Goreng',
  price: 10000,
  isActive: true,
  isAvailable: true,
  category: { isActive: true },
  modifierGroups: [
    {
      group: {
        id: 'group-1',
        name: 'Level Pedas',
        selectionType: SelectionType.SINGLE,
        minSelect: 1,
        maxSelect: 1,
        isRequired: true,
        isActive: true,
        options: [
          {
            id: 'option-1',
            name: 'Pedas',
            priceDelta: 5000,
            isActive: true,
          },
        ],
      },
    },
  ],
};

const plainItem = {
  id: 'item-2',
  name: 'Air Mineral',
  price: 5000,
  isActive: true,
  isAvailable: true,
  category: { isActive: true },
  modifierGroups: [],
};

function buildService() {
  const orders = {
    findMenuItemsForOrder: jest.fn(),
  };
  const settings = {
    getSettings: jest.fn(),
    getTaxRules: jest.fn(),
  };
  const service = new PricingService(
    orders as unknown as OrderRepository,
    settings as unknown as SettingsService,
  );
  return { service, orders, settings };
}

function useSettings(
  settings: ReturnType<typeof buildService>['settings'],
  overrides: {
    taxInclusive?: boolean;
    taxBaseIncludesService?: boolean;
    serviceRateBp?: number;
  } = {},
) {
  settings.getSettings.mockResolvedValue({
    taxInclusive: false,
    taxBaseIncludesService: true,
    serviceRateBp: 500,
    ...overrides,
  });
  settings.getTaxRules.mockResolvedValue([
    { orderType: OrderType.DINE_IN, isEnabled: true, rateBp: 1000 },
    { orderType: OrderType.TAKEAWAY, isEnabled: false, rateBp: 1000 },
  ]);
}

describe('PricingService', () => {
  it('prices dine-in exclusive tax with service in tax base', async () => {
    const { service, orders, settings } = buildService();
    orders.findMenuItemsForOrder.mockResolvedValue([menuItem]);
    useSettings(settings);

    const result = await service.price('outlet-1', OrderType.DINE_IN, [
      {
        menuItemId: 'item-1',
        qty: 1,
        modifierOptionIds: ['option-1'],
      },
    ]);

    expect(result).toMatchObject({
      subtotal: 15000,
      serviceAmount: 750,
      taxAmount: 1575,
      total: 17325,
      taxRateBp: 1000,
      taxInclusive: false,
      taxBaseIncludesService: true,
      serviceRateBp: 500,
    });
    expect(result.items[0]).toMatchObject({
      unitPrice: 10000,
      lineTotal: 15000,
      modifiers: [{ priceDelta: 5000, qty: 1 }],
    });
  });

  it('sets takeaway service to zero and uses takeaway tax rule', async () => {
    const { service, orders, settings } = buildService();
    orders.findMenuItemsForOrder.mockResolvedValue([menuItem]);
    useSettings(settings);

    const result = await service.price('outlet-1', OrderType.TAKEAWAY, [
      {
        menuItemId: 'item-1',
        qty: 1,
        modifierOptionIds: ['option-1'],
      },
    ]);

    expect(result).toMatchObject({
      subtotal: 15000,
      serviceAmount: 0,
      taxAmount: 0,
      total: 15000,
      taxRateBp: 0,
    });
  });

  it('extracts inclusive tax from the total', async () => {
    const { service, orders, settings } = buildService();
    orders.findMenuItemsForOrder.mockResolvedValue([plainItem]);
    useSettings(settings, { taxInclusive: true });

    const result = await service.price('outlet-1', OrderType.DINE_IN, [
      { menuItemId: 'item-2', qty: 1 },
    ]);

    expect(result).toMatchObject({
      subtotal: 5000,
      serviceAmount: 250,
      taxAmount: 477,
      total: 5250,
      taxInclusive: true,
    });
  });

  it('rejects a missing required modifier', async () => {
    const { service, orders, settings } = buildService();
    orders.findMenuItemsForOrder.mockResolvedValue([menuItem]);
    useSettings(settings);

    await expect(
      service.price('outlet-1', OrderType.DINE_IN, [
        { menuItemId: 'item-1', qty: 1 },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an unavailable menu item', async () => {
    const { service, orders, settings } = buildService();
    orders.findMenuItemsForOrder.mockResolvedValue([
      { ...plainItem, isAvailable: false },
    ]);
    useSettings(settings);

    await expect(
      service.price('outlet-1', OrderType.DINE_IN, [
        { menuItemId: 'item-2', qty: 1 },
      ]),
    ).rejects.toThrow(BadRequestException);
  });
});
