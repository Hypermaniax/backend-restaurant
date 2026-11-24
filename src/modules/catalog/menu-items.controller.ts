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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '../../generated/prisma/client';
import { MESSAGES, withMessage } from '../../common/response';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { Roles } from '../security/decorators/roles.decorator';
import { JwtAuthGuard } from '../security/guards/jwt-auth.guard';
import { RolesGuard } from '../security/guards/roles.guard';
import type { AuthUser } from '../security/types/auth-user';
import {
  CreateMenuItemDto,
  MenuItemListQueryDto,
  UpdateMenuItemDto,
} from './dto/menu-item.dto';
import { MenuItemsService } from './menu-items.service';

const menuImageUpload = {
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
};

@ApiTags('admin-catalog')
@ApiBearerAuth()
@Controller('admin/menu-items')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class MenuItemsController {
  constructor(private readonly menuItems: MenuItemsService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar item menu' })
  list(@CurrentUser() user: AuthUser, @Query() query: MenuItemListQueryDto) {
    return this.menuItems.list(user.outletId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail item menu' })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.menuItems.get(user.outletId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Buat item menu' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateMenuItemDto) {
    const item = await this.menuItems.create(user.outletId, dto);
    return withMessage(item, MESSAGES.catalog.menuCreated);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Ubah item menu, ketersediaan, modifier, atau aktifkan kembali',
  })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    const item = await this.menuItems.update(
      user.outletId,
      id,
      dto,
      user.userId,
    );
    return withMessage(item, MESSAGES.catalog.menuUpdated);
  }

  @Post(':id/image')
  @ApiOperation({ summary: 'Upload gambar menu (JPEG/PNG/WebP, maks. 2 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file', menuImageUpload))
  async uploadImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const item = await this.menuItems.uploadImage(user.outletId, id, file);
    return withMessage(item, MESSAGES.catalog.menuImageUploaded);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Nonaktifkan item menu (soft delete)' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const item = await this.menuItems.softDelete(user.outletId, id);
    return withMessage(item, MESSAGES.catalog.menuDeactivated);
  }
}
