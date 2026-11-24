import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@rembuk.local' })
  @Transform(({ value }) => {
    const raw: unknown = value;
    return typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
  })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Admin123!' })
  @IsString()
  @MaxLength(72)
  password!: string;
}
