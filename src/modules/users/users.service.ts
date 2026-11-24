import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  createPageResult,
  resolvePagination,
  type PageResult,
  type PaginationQueryDto,
} from '../../common/pagination/pagination.dto';
import { UserRole } from '../../generated/prisma/client';
import { PasswordService } from '../security/password.service';
import type { CreateStaffDto } from './dto/create-staff.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import type { UpdateStaffDto } from './dto/update-staff.dto';
import { UserRepository } from './user.repository';
import type { SafeUser } from './user.types';

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordService,
  ) {}

  async validateCredentials(
    email: string,
    password: string,
  ): Promise<SafeUser | null> {
    const user = await this.users.findByEmail(this.normalizeEmail(email));

    if (!user?.isActive) {
      return null;
    }

    const passwordMatches = await this.passwords.verify(
      password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      return null;
    }

    return {
      id: user.id,
      outletId: user.outletId,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }

  async markLogin(userId: string): Promise<void> {
    await this.users.updateLastLogin(userId);
  }

  async findActiveById(
    outletId: string,
    userId: string,
  ): Promise<SafeUser | null> {
    return this.users.findActiveById(outletId, userId);
  }

  async listStaff(
    outletId: string,
    query: PaginationQueryDto = {},
  ): Promise<PageResult<SafeUser>> {
    const pagination = resolvePagination(query);
    const { items, total } = await this.users.listByOutlet(outletId, query);
    return createPageResult(items, total, pagination);
  }

  async createStaff(outletId: string, dto: CreateStaffDto): Promise<SafeUser> {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.users.findByEmail(email);

    if (existing) {
      throw new ConflictException('Email sudah digunakan');
    }

    const passwordHash = await this.passwords.hash(dto.password);

    return this.users.create({
      outletId,
      name: dto.name,
      email,
      passwordHash,
      role: dto.role,
    });
  }

  async updateStaff(
    outletId: string,
    userId: string,
    actorUserId: string,
    dto: UpdateStaffDto,
  ): Promise<SafeUser> {
    const current = await this.requireStaff(outletId, userId);

    if (
      current.id === actorUserId &&
      dto.role !== undefined &&
      dto.role !== current.role
    ) {
      throw new BadRequestException('Tidak bisa mengubah role akun sendiri');
    }

    const data: { name?: string; role?: UserRole } = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.role !== undefined) {
      data.role = dto.role;
    }

    if (Object.keys(data).length === 0) {
      return current;
    }

    const updated = await this.users.update(outletId, userId, data);
    if (!updated) {
      throw new NotFoundException('Staff tidak ditemukan');
    }

    return updated;
  }

  async deactivateStaff(
    outletId: string,
    userId: string,
    actorUserId: string,
  ): Promise<SafeUser> {
    const current = await this.requireStaff(outletId, userId);

    if (current.id === actorUserId) {
      throw new BadRequestException('Tidak bisa menonaktifkan akun sendiri');
    }

    if (
      current.role === UserRole.ADMIN &&
      current.isActive &&
      (await this.users.countActiveAdmins(outletId)) <= 1
    ) {
      throw new BadRequestException('Minimal satu admin harus aktif');
    }

    const updated = await this.users.update(outletId, userId, {
      isActive: false,
    });
    if (!updated) {
      throw new NotFoundException('Staff tidak ditemukan');
    }

    return updated;
  }

  async resetPassword(
    outletId: string,
    userId: string,
    dto: ResetPasswordDto,
  ): Promise<void> {
    await this.requireStaff(outletId, userId);
    const passwordHash = await this.passwords.hash(dto.password);
    await this.users.updatePassword(outletId, userId, passwordHash);
  }

  private async requireStaff(
    outletId: string,
    userId: string,
  ): Promise<SafeUser> {
    const user = await this.users.findByOutletAndId(outletId, userId);

    if (!user) {
      throw new NotFoundException('Staff tidak ditemukan');
    }

    return user;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
