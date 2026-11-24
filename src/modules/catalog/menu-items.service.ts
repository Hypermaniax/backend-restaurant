import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  createPageResult,
  resolvePagination,
  type PageResult,
} from '../../common/pagination/pagination.dto';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CategoryRepository } from './category.repository';
import type { MenuItemView, MenuItemWithRelations } from './catalog.types';
import type {
  CreateMenuItemDto,
  MenuItemListQueryDto,
  UpdateMenuItemDto,
} from './dto/menu-item.dto';
import { MenuImageService } from './menu-image.service';
import { toMenuItemView } from './menu-item.mapper';
import { MenuItemRepository } from './menu-item.repository';
import { ModifierRepository } from './modifier.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MenuItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menuItems: MenuItemRepository,
    private readonly categories: CategoryRepository,
    private readonly modifiers: ModifierRepository,
    private readonly audit: AuditService,
    private readonly images: MenuImageService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(
    outletId: string,
    query: MenuItemListQueryDto,
  ): Promise<PageResult<MenuItemView>> {
    const pagination = resolvePagination(query);
    const { items, total } = await this.menuItems.listByOutlet(
      outletId,
      {
        includeInactive: query.includeInactive ?? false,
        categoryId: query.categoryId,
        isAvailable: query.isAvailable,
      },
      query,
    );

    return createPageResult(
      items.map((item) => toMenuItemView(item)),
      total,
      pagination,
    );
  }

  async get(outletId: string, menuItemId: string): Promise<MenuItemView> {
    return toMenuItemView(await this.requireItem(outletId, menuItemId));
  }

  async create(
    outletId: string,
    dto: CreateMenuItemDto,
  ): Promise<MenuItemView> {
    await this.requireActiveCategory(outletId, dto.categoryId);
    await this.ensureModifierGroups(outletId, dto.modifierGroupIds ?? []);

    const item = await this.prisma.$transaction(async (tx) => {
      const created = await this.menuItems.create({
        outletId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description ?? null,
        price: dto.price,
        imageUrl: dto.imageUrl ?? null,
        isAvailable: dto.isAvailable ?? true,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      });

      if (dto.modifierGroupIds?.length) {
        await this.menuItems.replaceModifierGroups(
          created.id,
          dto.modifierGroupIds,
          tx,
        );
      }

      const saved = await this.menuItems.findById(outletId, created.id, tx);
      if (!saved) {
        throw new NotFoundException('Menu item tidak ditemukan');
      }
      return saved;
    });

    const view = toMenuItemView(item);
    this.emitMenuUpdated(view);
    return view;
  }

  async update(
    outletId: string,
    menuItemId: string,
    dto: UpdateMenuItemDto,
    actorUserId: string,
  ): Promise<MenuItemView> {
    const current = await this.requireItem(outletId, menuItemId);

    if (dto.categoryId !== undefined) {
      await this.requireActiveCategory(outletId, dto.categoryId);
    }
    if (dto.modifierGroupIds !== undefined) {
      await this.ensureModifierGroups(outletId, dto.modifierGroupIds);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.menuItems.update(
        outletId,
        menuItemId,
        {
          ...(dto.categoryId === undefined
            ? {}
            : { categoryId: dto.categoryId }),
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.description === undefined
            ? {}
            : { description: dto.description }),
          ...(dto.price === undefined ? {} : { price: dto.price }),
          ...(dto.imageUrl === undefined ? {} : { imageUrl: dto.imageUrl }),
          ...(dto.isAvailable === undefined
            ? {}
            : { isAvailable: dto.isAvailable }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
        },
        tx,
      );

      if (dto.modifierGroupIds !== undefined) {
        await this.menuItems.replaceModifierGroups(
          menuItemId,
          dto.modifierGroupIds,
          tx,
        );
      }

      if (
        dto.isAvailable !== undefined &&
        dto.isAvailable !== current.isAvailable
      ) {
        await this.audit.record(
          {
            outletId,
            actorUserId,
            action: 'MENU_ITEM_AVAILABILITY_UPDATED',
            entityType: 'menu_item',
            entityId: menuItemId,
            before: { isAvailable: current.isAvailable },
            after: { isAvailable: dto.isAvailable },
          },
          tx,
        );
      }

      const saved = await this.menuItems.findById(outletId, menuItemId, tx);
      if (!saved) {
        throw new NotFoundException('Menu item tidak ditemukan');
      }
      return saved;
    });

    const view = toMenuItemView(updated);
    this.emitMenuUpdated(view);
    return view;
  }

  async updateAvailability(
    outletId: string,
    menuItemId: string,
    isAvailable: boolean,
    actorUserId: string,
  ): Promise<MenuItemView> {
    const current = await this.requireItem(outletId, menuItemId);

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.menuItems.update(outletId, menuItemId, { isAvailable }, tx);

      await this.audit.record(
        {
          outletId,
          actorUserId,
          action: 'MENU_ITEM_AVAILABILITY_UPDATED',
          entityType: 'menu_item',
          entityId: menuItemId,
          before: { isAvailable: current.isAvailable },
          after: { isAvailable },
        },
        tx,
      );

      const saved = await this.menuItems.findById(outletId, menuItemId, tx);
      if (!saved) {
        throw new NotFoundException('Menu item tidak ditemukan');
      }
      return saved;
    });

    const view = toMenuItemView(updated);
    this.emitMenuUpdated(view);
    return view;
  }

  async uploadImage(
    outletId: string,
    menuItemId: string,
    file: Express.Multer.File | undefined,
  ): Promise<MenuItemView> {
    await this.requireItem(outletId, menuItemId);
    const imageUrl = await this.images.store(file);
    await this.menuItems.update(outletId, menuItemId, { imageUrl });

    const view = await this.get(outletId, menuItemId);
    this.emitMenuUpdated(view);
    return view;
  }

  async softDelete(
    outletId: string,
    menuItemId: string,
  ): Promise<MenuItemView> {
    await this.menuItems.update(outletId, menuItemId, { isActive: false });
    const view = await this.get(outletId, menuItemId);
    this.emitMenuUpdated(view);
    return view;
  }

  private emitMenuUpdated(item: MenuItemView) {
    this.realtime.emitMenuUpdated(item.outletId, {
      menuItemId: item.id,
      isAvailable: item.isAvailable,
    });
  }

  private async requireItem(
    outletId: string,
    menuItemId: string,
  ): Promise<MenuItemWithRelations> {
    const item = await this.menuItems.findById(outletId, menuItemId);
    if (!item) {
      throw new NotFoundException('Menu item tidak ditemukan');
    }
    return item;
  }

  private async requireActiveCategory(
    outletId: string,
    categoryId: string,
  ): Promise<void> {
    const category = await this.categories.findActiveById(outletId, categoryId);
    if (!category) {
      throw new BadRequestException('Kategori tidak ditemukan atau nonaktif');
    }
  }

  private async ensureModifierGroups(
    outletId: string,
    groupIds: string[],
  ): Promise<void> {
    if (groupIds.length === 0) {
      return;
    }

    const groups = await this.modifiers.findGroupsByIds(outletId, groupIds);
    if (groups.length !== groupIds.length) {
      throw new BadRequestException('Grup modifier tidak ditemukan');
    }
    if (groups.some((group) => !group.isActive)) {
      throw new BadRequestException('Grup modifier nonaktif');
    }
  }
}
