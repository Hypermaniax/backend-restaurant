import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { OrderStatus } from '../../../generated/prisma/client';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateKdsStatusDto {
  @ApiProperty({
    enum: [OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.SERVED],
  })
  @IsIn([OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.SERVED])
  status!: OrderStatus;
}

export class DisplayQueueQueryDto {
  @ApiPropertyOptional({ description: 'Default: outlet pertama' })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsUUID()
  outletId?: string;
}
