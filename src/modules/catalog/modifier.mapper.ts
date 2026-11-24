import type { ModifierOption } from '../../generated/prisma/client';
import type {
  ModifierGroupView,
  ModifierGroupWithOptions,
  ModifierOptionView,
} from './catalog.types';

export function toModifierOptionView(
  option: ModifierOption,
): ModifierOptionView {
  return {
    id: option.id,
    groupId: option.groupId,
    name: option.name,
    priceDelta: option.priceDelta,
    isDefault: option.isDefault,
    isActive: option.isActive,
    sortOrder: option.sortOrder,
  };
}

export function toModifierGroupView(
  group: ModifierGroupWithOptions,
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
      .map((option) => toModifierOptionView(option)),
  };
}
