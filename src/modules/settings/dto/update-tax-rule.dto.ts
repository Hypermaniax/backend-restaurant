import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class UpdateTaxRuleDto {
  @ApiProperty()
  @IsBoolean()
  isEnabled!: boolean;

  @ApiProperty({ minimum: 0, maximum: 10000 })
  @IsInt()
  @Min(0)
  @Max(10000)
  rateBp!: number;
}
