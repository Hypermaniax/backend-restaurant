import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { RealtimeService } from '../realtime/realtime.service';
import type { CategoryRepository } from './category.repository';
import type { MenuImageService } from './menu-image.service';
import type { MenuItemRepository } from './menu-item.repository';
import { MenuItemsService } from './menu-items.service';
import type { ModifierRepository } from './modifier.repository';

const menuItem = {
  id: 'item-1',
  outletId: 'outlet-1',
  categoryId: 'category-1',
  name: 'Nasi Goreng Rembuk',
  description: 'Enak',
  price: 28000,
  imageUrl: null,
  isAvailable: true,
  isActive: true,
  sortOrder: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  category: { name: 'Makanan' },
  modifierGroups: [],
};

function buildService() {
  const prisma = {
    $transaction: jest.fn((callback: (tx: object) => unknown) =>
      Promise.resolve(callback({})),
    ),
  };
  const menuItems = {
    listByOutlet: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    replaceModifierGroups: jest.fn(),
  };
  const categories = {
    findActiveById: jest.fn(),
  };
  const modifiers = {
    findGroupsByIds: jest.fn(),
  };
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const images = {
    store: jest.fn(),
  };
  const realtime = {
    emitMenuUpdated: jest.fn(),
  };

  const service = new MenuItemsService(
    prisma as unknown as PrismaService,
    menuItems as unknown as MenuItemRepository,
    categories as unknown as CategoryRepository,
    modifiers as unknown as ModifierRepository,
    audit as unknown as AuditService,
    images as unknown as MenuImageService,
    realtime as unknown as RealtimeService,
  );

  return {
    service,
    menuItems,
    categories,
    modifiers,
    audit,
    images,
    realtime,
  };
}

describe('MenuItemsService', () => {
  it('returns menu items with pagination metadata', async () => {
    const { service, menuItems } = buildService();
    menuItems.listByOutlet.mockResolvedValue({
      items: [menuItem],
      total: 41,
    });

    const result = await service.list('outlet-1', {
      page: 2,
      pageSize: 20,
      includeInactive: true,
    });

    expect(menuItems.listByOutlet).toHaveBeenCalledWith(
      'outlet-1',
      {
        includeInactive: true,
        categoryId: undefined,
        isAvailable: undefined,
      },
      { page: 2, pageSize: 20, includeInactive: true },
    );
    expect(result.items).toHaveLength(1);
    expect(result.meta).toEqual({
      page: 2,
      pageSize: 20,
      total: 41,
      totalPages: 3,
    });
  });

  it('updates availability and writes an audit log', async () => {
    const { service, menuItems, audit } = buildService();
    menuItems.findById
      .mockResolvedValueOnce(menuItem)
      .mockResolvedValueOnce({ ...menuItem, isAvailable: false });

    const result = await service.updateAvailability(
      'outlet-1',
      'item-1',
      false,
      'cashier-1',
    );

    expect(menuItems.update).toHaveBeenCalledWith(
      'outlet-1',
      'item-1',
      { isAvailable: false },
      expect.anything(),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MENU_ITEM_AVAILABILITY_UPDATED',
        actorUserId: 'cashier-1',
        before: { isAvailable: true },
        after: { isAvailable: false },
      }),
      expect.anything(),
    );
    expect(result.isAvailable).toBe(false);
  });

  it('uses soft delete instead of deleting the menu item', async () => {
    const { service, menuItems } = buildService();
    menuItems.findById.mockResolvedValue({ ...menuItem, isActive: false });

    const result = await service.softDelete('outlet-1', 'item-1');

    expect(menuItems.update).toHaveBeenCalledWith('outlet-1', 'item-1', {
      isActive: false,
    });
    expect(result.isActive).toBe(false);
  });

  it('rejects assigning an inactive modifier group', async () => {
    const { service, menuItems, modifiers } = buildService();
    menuItems.findById.mockResolvedValue(menuItem);
    modifiers.findGroupsByIds.mockResolvedValue([
      { id: 'group-1', isActive: false },
    ]);

    await expect(
      service.update(
        'outlet-1',
        'item-1',
        { modifierGroupIds: ['group-1'] },
        'admin-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects creating an item in an inactive category', async () => {
    const { service, categories } = buildService();
    categories.findActiveById.mockResolvedValue(null);

    await expect(
      service.create('outlet-1', {
        categoryId: 'category-1',
        name: 'Menu Baru',
        price: 10000,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
