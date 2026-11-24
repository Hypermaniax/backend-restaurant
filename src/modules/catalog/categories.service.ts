import { Injectable, NotFoundException } from '@nestjs/common';
import {
  createPageResult,
  resolvePagination,
  type PageResult,
} from '../../common/pagination/pagination.dto';
import type { Category } from '../../generated/prisma/client';
import type { CatalogListQueryDto } from './dto/catalog-list-query.dto';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CategoryRepository } from './category.repository';
import type { CategoryView } from './catalog.types';

@Injectable()
export class CategoriesService {
  constructor(private readonly categories: CategoryRepository) {}

  async list(
    outletId: string,
    query: CatalogListQueryDto,
  ): Promise<PageResult<CategoryView>> {
    const includeInactive = query.includeInactive ?? false;
    const pagination = resolvePagination(query);
    const { items, total } = await this.categories.listByOutlet(
      outletId,
      includeInactive,
      query,
    );
    return createPageResult(
      items.map((category) => this.toView(category)),
      total,
      pagination,
    );
  }

  async create(
    outletId: string,
    dto: CreateCategoryDto,
  ): Promise<CategoryView> {
    const category = await this.categories.create({
      outletId,
      name: dto.name,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return this.toView(category);
  }

  async update(
    outletId: string,
    categoryId: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryView> {
    await this.requireCategory(outletId, categoryId);

    const category = await this.categories.update(outletId, categoryId, {
      ...(dto.name === undefined ? {} : { name: dto.name }),
      ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
      ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
    });

    if (!category) {
      throw new NotFoundException('Kategori tidak ditemukan');
    }

    return this.toView(category);
  }

  async softDelete(
    outletId: string,
    categoryId: string,
  ): Promise<CategoryView> {
    await this.requireCategory(outletId, categoryId);
    const category = await this.categories.update(outletId, categoryId, {
      isActive: false,
    });

    if (!category) {
      throw new NotFoundException('Kategori tidak ditemukan');
    }

    return this.toView(category);
  }

  private async requireCategory(
    outletId: string,
    categoryId: string,
  ): Promise<Category> {
    const category = await this.categories.findById(outletId, categoryId);
    if (!category) {
      throw new NotFoundException('Kategori tidak ditemukan');
    }
    return category;
  }

  private toView(category: Category): CategoryView {
    return {
      id: category.id,
      outletId: category.outletId,
      name: category.name,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    };
  }
}
