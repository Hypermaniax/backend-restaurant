import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../../generated/prisma/client';

export class UpdateStaffDto {
  @ApiPropertyOptional({ example: 'Kasir Rembuk' })
  @Transform(({ value }) => {
    const raw: unknown = value;
    return typeof raw === 'string' ? raw.trim() : raw;
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    enum: [UserRole.ADMIN, UserRole.CASHIER, UserRole.KITCHEN],
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
