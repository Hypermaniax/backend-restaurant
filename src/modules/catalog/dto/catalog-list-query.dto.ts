import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';
import { toBoolean } from './query-transform';

export class CatalogListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Sertakan data nonaktif (soft delete)' })
  @Transform(({ value }) => toBoolean(value))
  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;
}
