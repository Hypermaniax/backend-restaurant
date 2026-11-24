import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { MESSAGES, withMessage } from '../../common/response';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { Roles } from '../security/decorators/roles.decorator';
import { JwtAuthGuard } from '../security/guards/jwt-auth.guard';
import { RolesGuard } from '../security/guards/roles.guard';
import type { AuthUser } from '../security/types/auth-user';
import { CategoriesService } from './categories.service';
import { CatalogListQueryDto } from './dto/catalog-list-query.dto';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@ApiTags('admin-catalog')
@ApiBearerAuth()
@Controller('admin/categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar kategori menu' })
  list(@CurrentUser() user: AuthUser, @Query() query: CatalogListQueryDto) {
    return this.categories.list(user.outletId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Buat kategori' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    const category = await this.categories.create(user.outletId, dto);
    return withMessage(category, MESSAGES.catalog.categoryCreated);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Ubah kategori atau aktifkan kembali' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const category = await this.categories.update(user.outletId, id, dto);
    return withMessage(category, MESSAGES.catalog.categoryUpdated);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Nonaktifkan kategori (soft delete)' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const category = await this.categories.softDelete(user.outletId, id);
    return withMessage(category, MESSAGES.catalog.categoryDeactivated);
  }
}
