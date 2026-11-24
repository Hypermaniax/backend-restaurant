import {
  Body,
  Controller,
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
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { MESSAGES, withMessage } from '../../common/response';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { Roles } from '../security/decorators/roles.decorator';
import { JwtAuthGuard } from '../security/guards/jwt-auth.guard';
import { RolesGuard } from '../security/guards/roles.guard';
import type { AuthUser } from '../security/types/auth-user';
import { CreateStaffDto } from './dto/create-staff.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { UsersService } from './users.service';

@ApiTags('admin-staff')
@ApiBearerAuth()
@Controller('admin/staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar staff pada outlet' })
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.users.listStaff(user.outletId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Buat akun staff baru' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    const staff = await this.users.createStaff(user.outletId, dto);
    return withMessage(staff, MESSAGES.staff.created);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Ubah nama atau role staff' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    const staff = await this.users.updateStaff(
      user.outletId,
      id,
      user.userId,
      dto,
    );
    return withMessage(staff, MESSAGES.staff.updated);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Nonaktifkan akun staff' })
  async deactivate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const staff = await this.users.deactivateStaff(
      user.outletId,
      id,
      user.userId,
    );
    return withMessage(staff, MESSAGES.staff.deactivated);
  }

  @Patch(':id/password')
  @ApiOperation({ summary: 'Reset password staff' })
  async resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    await this.users.resetPassword(user.outletId, id, dto);
    return { message: MESSAGES.staff.passwordReset };
  }
}
