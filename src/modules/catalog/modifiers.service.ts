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
import type {
  ModifierOption,
  SelectionType,
} from '../../generated/prisma/client';
import type {
  ModifierGroupView,
  ModifierGroupWithOptions,
  ModifierOptionView,
} from './catalog.types';
import type { CatalogListQueryDto } from './dto/catalog-list-query.dto';
import type {
  CreateModifierGroupDto,
  CreateModifierOptionDto,
  UpdateModifierGroupDto,
  UpdateModifierOptionDto,
} from './dto/modifier.dto';
import { ModifierRepository } from './modifier.repository';

@Injectable()
export class ModifiersService {
  constructor(private readonly modifiers: ModifierRepository) {}

  async listGroups(
    outletId: string,
    query: CatalogListQueryDto,
  ): Promise<PageResult<ModifierGroupView>> {
    const includeInactive = query.includeInactive ?? false;
    const pagination = resolvePagination(query);
    const { items, total } = await this.modifiers.listGroupsByOutlet(
      outletId,
      includeInactive,
      query,
    );
    return createPageResult(
      items.map((group) => this.toView(group)),
      total,
      pagination,
    );
  }

  async createGroup(
    outletId: string,
    dto: CreateModifierGroupDto,
  ): Promise<ModifierGroupView> {
    const minSelect = dto.minSelect ?? (dto.isRequired ? 1 : 0);
    const maxSelect = this.normalizeMaxSelect(
      dto.selectionType,
      minSelect,
      dto.maxSelect,
    );

    this.validateSelection(
      dto.selectionType,
      minSelect,
      maxSelect,
      dto.isRequired ?? false,
    );

    const group = await this.modifiers.createGroup({
      outletId,
      name: dto.name,
      selectionType: dto.selectionType,
      minSelect,
      maxSelect,
      isRequired: dto.isRequired ?? false,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });

    return this.toView({ ...group, options: [] });
  }

  async updateGroup(
    outletId: string,
    groupId: string,
    dto: UpdateModifierGroupDto,
  ): Promise<ModifierGroupView> {
    const current = await this.requireGroup(outletId, groupId);
    const selectionType = dto.selectionType ?? current.selectionType;
    const minSelect = dto.minSelect ?? current.minSelect;
    const isRequired = dto.isRequired ?? current.isRequired;
    const maxSelect = this.normalizeMaxSelect(
      selectionType,
      minSelect,
      dto.maxSelect === undefined ? current.maxSelect : dto.maxSelect,
    );

    this.validateSelection(selectionType, minSelect, maxSelect, isRequired);

    const updated = await this.modifiers.updateGroup(outletId, groupId, {
      ...(dto.name === undefined ? {} : { name: dto.name }),
      ...(dto.selectionType === undefined
        ? {}
        : { selectionType: dto.selectionType }),
      ...(dto.minSelect === undefined ? {} : { minSelect: dto.minSelect }),
      maxSelect,
      ...(dto.isRequired === undefined ? {} : { isRequired: dto.isRequired }),
      ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
    });

    if (!updated) {
      throw new NotFoundException('Grup modifier tidak ditemukan');
    }

    return this.toView(updated);
  }

  async softDeleteGroup(
    outletId: string,
    groupId: string,
  ): Promise<ModifierGroupView> {
    const updated = await this.modifiers.updateGroup(outletId, groupId, {
      isActive: false,
    });
    if (!updated) {
      throw new NotFoundException('Grup modifier tidak ditemukan');
    }
    return this.toView(updated);
  }

  async createOption(
    outletId: string,
    groupId: string,
    dto: CreateModifierOptionDto,
  ): Promise<ModifierOptionView> {
    const group = await this.requireGroup(outletId, groupId);
    if (!group.isActive) {
      throw new BadRequestException('Grup modifier nonaktif');
    }

    const option = await this.modifiers.createOption({
      groupId,
      name: dto.name,
      priceDelta: dto.priceDelta ?? 0,
      isDefault: dto.isDefault ?? false,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });

    return this.toOptionView(option);
  }

  async updateOption(
    outletId: string,
    optionId: string,
    dto: UpdateModifierOptionDto,
  ): Promise<ModifierOptionView> {
    const updated = await this.modifiers.updateOption(outletId, optionId, {
      ...(dto.name === undefined ? {} : { name: dto.name }),
      ...(dto.priceDelta === undefined ? {} : { priceDelta: dto.priceDelta }),
      ...(dto.isDefault === undefined ? {} : { isDefault: dto.isDefault }),
      ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
    });

    if (!updated) {
      throw new NotFoundException('Opsi modifier tidak ditemukan');
    }

    return this.toOptionView(updated);
  }

  async softDeleteOption(
    outletId: string,
    optionId: string,
  ): Promise<ModifierOptionView> {
    const updated = await this.modifiers.updateOption(outletId, optionId, {
      isActive: false,
    });
    if (!updated) {
      throw new NotFoundException('Opsi modifier tidak ditemukan');
    }

    return this.toOptionView(updated);
  }

  private async requireGroup(
    outletId: string,
    groupId: string,
  ): Promise<ModifierGroupWithOptions> {
    const group = await this.modifiers.findGroupById(outletId, groupId);
    if (!group) {
      throw new NotFoundException('Grup modifier tidak ditemukan');
    }
    return group;
  }

  private normalizeMaxSelect(
    selectionType: SelectionType,
    minSelect: number,
    maxSelect: number | null | undefined,
  ): number | null {
    if (selectionType === 'SINGLE') {
      return 1;
    }

    if (maxSelect === undefined || maxSelect === null) {
      return null;
    }

    if (maxSelect < minSelect) {
      throw new BadRequestException(
        'maxSelect tidak boleh lebih kecil dari minSelect',
      );
    }

    return maxSelect;
  }

  private validateSelection(
    selectionType: SelectionType,
    minSelect: number,
    maxSelect: number | null,
    isRequired: boolean,
  ): void {
    if (selectionType === 'SINGLE') {
      if (minSelect > 1) {
        throw new BadRequestException('minSelect untuk SINGLE maksimal 1');
      }
      if (isRequired && minSelect < 1) {
        throw new BadRequestException(
          'Grup wajib harus memiliki minSelect minimal 1',
        );
      }
      return;
    }

    if (isRequired && minSelect < 1) {
      throw new BadRequestException(
        'Grup wajib harus memiliki minSelect minimal 1',
      );
    }

    if (maxSelect !== null && maxSelect < minSelect) {
      throw new BadRequestException(
        'maxSelect tidak boleh lebih kecil dari minSelect',
      );
    }
  }

  private toView(group: ModifierGroupWithOptions): ModifierGroupView {
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
        .sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        )
        .map((option) => this.toOptionView(option)),
    };
  }

  private toOptionView(option: ModifierOption): ModifierOptionView {
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
}
