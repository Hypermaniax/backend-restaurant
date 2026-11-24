import { Injectable } from '@nestjs/common';
import type {
  CashierMenuView,
  PublicCategoryView,
  PublicMenuView,
  PublicMenuItemView,
} from './catalog.types';
import {
  PublicCatalogRepository,
  type PublicCategoryRecord,
} from './public-catalog.repository';
import { TablesService } from '../tables/tables.service';

@Injectable()
export class PublicCatalogService {
  constructor(
    private readonly catalog: PublicCatalogRepository,
    private readonly tables: TablesService,
  ) {}

  async getMenuByTableCode(code: string): Promise<PublicMenuView> {
    const table = await this.tables.resolvePublicTable(code);
    const categories = await this.catalog.findMenu(table.outlet.id);

    return {
      table: {
        id: table.id,
        code: table.code,
        name: table.name,
        zone: table.zone,
      },
      outlet: {
        id: table.outlet.id,
        name: table.outlet.name,
        slug: table.outlet.slug,
      },
      session: table.session
        ? {
            id: table.session.id,
            status: table.session.status,
            guestCount: table.session.guestCount,
            openedAt: table.session.openedAt,
          }
        : null,
      categories: categories
        .map((category) => this.toCategoryView(category))
        .filter((category) => category.items.length > 0),
    };
  }

  async getMenuForCashier(outletId: string): Promise<CashierMenuView> {
    const categories = await this.catalog.findMenu(outletId);
    return {
      categories: categories
        .map((category) => this.toCategoryView(category))
        .filter((category) => category.items.length > 0),
    };
  }

  private toCategoryView(category: PublicCategoryRecord): PublicCategoryView {
    return {
      id: category.id,
      name: category.name,
      sortOrder: category.sortOrder,
      items: category.menuItems.map((item) => this.toItemView(item)),
    };
  }

  private toItemView(
    item: PublicCategoryRecord['menuItems'][number],
  ): PublicMenuItemView {
    const groups = item.modifierGroups
      .map((link) => link.group)
      .filter((group) => group.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((group) => ({
        id: group.id,
        name: group.name,
        selectionType: group.selectionType,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        isRequired: group.isRequired,
        sortOrder: group.sortOrder,
        options: group.options
          .filter((option) => option.isActive)
          .sort(
            (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
          )
          .map((option) => ({
            id: option.id,
            name: option.name,
            priceDelta: option.priceDelta,
            isDefault: option.isDefault,
            sortOrder: option.sortOrder,
          })),
      }));

    return {
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      imageUrl: item.imageUrl,
      isAvailable: item.isAvailable,
      sortOrder: item.sortOrder,
      modifierGroups: groups,
    };
  }
}
