import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

function toBoolean(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === true || value === 'true' || value === 1 || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === 0 || value === '0') {
    return false;
  }
  return value;
}

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    default: DEFAULT_PAGE_SIZE,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  @ApiPropertyOptional({
    description: 'Ambil semua data tanpa pagination (untuk dropdown)',
  })
  @Transform(({ value }) => toBoolean(value))
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}

export interface PaginationArgs {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  all: boolean;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PageResult<T> {
  items: T[];
  meta: PageMeta;
}

export function resolvePagination(query?: PaginationQueryDto): PaginationArgs {
  const page = query?.page ?? 1;
  const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    all: query?.all ?? false,
  };
}

export function createPageResult<T>(
  items: T[],
  total: number,
  pagination: PaginationArgs,
): PageResult<T> {
  if (pagination.all) {
    return {
      items,
      meta: {
        page: 1,
        pageSize: Math.max(items.length, 1),
        total,
        totalPages: total > 0 ? 1 : 0,
      },
    };
  }

  return {
    items,
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.ceil(total / pagination.pageSize),
    },
  };
}
