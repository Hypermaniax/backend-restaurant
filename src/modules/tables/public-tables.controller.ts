import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TablesService } from './tables.service';

@ApiTags('public-tables')
@Controller('public/tables')
export class PublicTablesController {
  constructor(private readonly tables: TablesService) {}

  @Get(':code')
  @ApiOperation({ summary: 'Resolve meja + outlet + sesi dari kode QR' })
  resolve(@Param('code') code: string) {
    return this.tables.resolvePublicTable(code);
  }
}
