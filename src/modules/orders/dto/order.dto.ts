import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
} from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../common/pagination/pagination.dto';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class OrderItemInputDto {
  @ApiProperty({ example: '00000000-0000-0000-0000-000000000000' })
  @IsUUID()
  menuItemId!: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 99 })
  @IsInt()
  @Min(1)
  @Max(99)
  qty!: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  modifierOptionIds?: string[];

  @ApiPropertyOptional({ nullable: true, maxLength: 200 })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(200)
  notes?: string | null;
}

export class PublicOrderQuoteDto {
  @ApiProperty({ example: 'T01' })
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  tableCode!: string;

  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];
}

export class CreatePublicOrderDto extends PublicOrderQuoteDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(80)
  customerName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class CashierOrderQuoteDto {
  @ApiProperty({ enum: OrderType })
  @IsEnum(OrderType)
  orderType!: OrderType;

  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];
}

export class CreateCashierOrderDto extends CashierOrderQuoteDto {
  @ApiPropertyOptional({
    description: 'Wajib untuk DINE_IN, tidak boleh untuk TAKEAWAY',
  })
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(80)
  customerName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @ApiProperty({
    enum: [PaymentMethod.CASH, PaymentMethod.EDC, PaymentMethod.QRIS],
  })
  @IsIn([PaymentMethod.CASH, PaymentMethod.EDC, PaymentMethod.QRIS])
  paymentMethod!: PaymentMethod;
}

export class ConfirmOrderPaymentDto {
  @ApiProperty({ enum: [PaymentMethod.CASH, PaymentMethod.EDC] })
  @IsIn([PaymentMethod.CASH, PaymentMethod.EDC])
  paymentMethod!: PaymentMethod;
}

export class CancelOrderDto {
  @ApiProperty({ example: 'Customer membatalkan pesanan' })
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  reason!: string;
}

export class OrderListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ enum: OrderType })
  @IsOptional()
  @IsEnum(OrderType)
  orderType?: OrderType;

  @ApiPropertyOptional({ enum: OrderSource })
  @IsOptional()
  @IsEnum(OrderSource)
  source?: OrderSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @ApiPropertyOptional({
    example: '2026-11-22',
    description: 'Tanggal bisnis YYYY-MM-DD',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Format tanggal harus YYYY-MM-DD',
  })
  date?: string;

  @ApiPropertyOptional({ description: 'Filter nomor order (contains)' })
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(30)
  orderNumber?: string;
}
