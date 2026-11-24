import type { ModifierGroup } from '../../generated/prisma/client';
import type {
  MenuItemView,
  MenuItemWithRelations,
  ModifierGroupView,
} from './catalog.types';

function toModifierGroupView(
  group: ModifierGroup & {
    options: Array<{
      id: string;
      groupId: string;
      name: string;
      priceDelta: number;
      isDefault: boolean;
      isActive: boolean;
      sortOrder: number;
    }>;
  },
): ModifierGroupView {
  return {
    id: group.id,
    outletId: group.outletId,
    name: group.name,
    selectionType: group.selectionType,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    isRequired: group.isRequired,
    isActive: group.isActive,
    sortOrder: group.sortOrder,
    options: group.options
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((option) => ({
        id: option.id,
        groupId: option.groupId,
        name: option.name,
        priceDelta: option.priceDelta,
        isDefault: option.isDefault,
        isActive: option.isActive,
        sortOrder: option.sortOrder,
      })),
  };
}

export function toMenuItemView(item: MenuItemWithRelations): MenuItemView {
  return {
    id: item.id,
    outletId: item.outletId,
    categoryId: item.categoryId,
    categoryName: item.category.name,
    name: item.name,
    description: item.description,
    price: item.price,
    imageUrl: item.imageUrl,
    isAvailable: item.isAvailable,
    isActive: item.isActive,
    sortOrder: item.sortOrder,
    modifierGroups: item.modifierGroups
      .map((link) => toModifierGroupView(link.group))
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
