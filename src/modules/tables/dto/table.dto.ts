import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';
import { toBoolean } from '../../catalog/dto/query-transform';

const normalizeCode = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateTableDto {
  @ApiProperty({ example: 'T01' })
  @Transform(({ value }) => normalizeCode(value))
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9-]{0,19}$/, {
    message: 'Kode meja hanya huruf, angka, dan tanda hubung (maks. 20)',
  })
  code!: string;

  @ApiProperty({ example: 'Meja 01' })
  @Transform(({ value }) => {
    const raw: unknown = value;
    return typeof raw === 'string' ? raw.trim() : raw;
  })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: 'Indoor', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  zone?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTableDto {
  @ApiPropertyOptional({ example: 'T01' })
  @Transform(({ value }) => normalizeCode(value))
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9-]{0,19}$/, {
    message: 'Kode meja hanya huruf, angka, dan tanda hubung (maks. 20)',
  })
  code?: string;

  @ApiPropertyOptional({ example: 'Meja 01' })
  @Transform(({ value }) => {
    const raw: unknown = value;
    return typeof raw === 'string' ? raw.trim() : raw;
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: 'Indoor', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  zone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class OpenTableSessionDto {
  @ApiPropertyOptional({ example: 2, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  guestCount?: number;
}

export class TableListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Sertakan meja nonaktif (soft delete)' })
  @Transform(({ value }) => toBoolean(value))
  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;
}
