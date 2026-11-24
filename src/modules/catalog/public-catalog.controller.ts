import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicCatalogService } from './public-catalog.service';

@ApiTags('public-catalog')
@Controller('public/tables')
export class PublicCatalogController {
  constructor(private readonly catalog: PublicCatalogService) {}

  @Get(':code/menu')
  @ApiOperation({
    summary: 'Menu publik untuk kode meja, tanpa login',
  })
  getMenu(@Param('code') code: string) {
    return this.catalog.getMenuByTableCode(code);
  }
}
