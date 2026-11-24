import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../../generated/prisma/client';

export class CreateStaffDto {
  @ApiProperty({ example: 'Kasir Rembuk' })
  @Transform(({ value }) => {
    const raw: unknown = value;
    return typeof raw === 'string' ? raw.trim() : raw;
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'kasir@rembuk.local' })
  @Transform(({ value }) => {
    const raw: unknown = value;
    return typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
  })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Kasir123!', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @ApiProperty({
    enum: [UserRole.ADMIN, UserRole.CASHIER, UserRole.KITCHEN],
  })
  @IsEnum(UserRole)
  role!: UserRole;
}
