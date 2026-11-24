import type {
  MenuItem,
  ModifierGroup,
  ModifierOption,
  SelectionType,
} from '../../generated/prisma/client';

export interface CategoryView {
  id: string;
  outletId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ModifierOptionView {
  id: string;
  groupId: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface ModifierGroupView {
  id: string;
  outletId: string;
  name: string;
  selectionType: SelectionType;
  minSelect: number;
  maxSelect: number | null;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  options: ModifierOptionView[];
}

export interface MenuItemView {
  id: string;
  outletId: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  isActive: boolean;
  sortOrder: number;
  modifierGroups: ModifierGroupView[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicModifierOptionView {
  id: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
  sortOrder: number;
}

export interface PublicModifierGroupView {
  id: string;
  name: string;
  selectionType: SelectionType;
  minSelect: number;
  maxSelect: number | null;
  isRequired: boolean;
  sortOrder: number;
  options: PublicModifierOptionView[];
}

export interface PublicMenuItemView {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
  modifierGroups: PublicModifierGroupView[];
}

export interface PublicCategoryView {
  id: string;
  name: string;
  sortOrder: number;
  items: PublicMenuItemView[];
}

export interface PublicMenuView {
  table: {
    id: string;
    code: string;
    name: string;
    zone: string | null;
  };
  outlet: {
    id: string;
    name: string;
    slug: string;
  };
  session: {
    id: string;
    status: string;
    guestCount: number | null;
    openedAt: Date;
  } | null;
  categories: PublicCategoryView[];
}

export interface CashierMenuView {
  categories: PublicCategoryView[];
}

export type MenuItemWithRelations = MenuItem & {
  category: { name: string };
  modifierGroups: Array<{
    group: ModifierGroup & { options: ModifierOption[] };
  }>;
};

export type ModifierGroupWithOptions = ModifierGroup & {
  options: ModifierOption[];
};
