import { Injectable } from '@nestjs/common';
import { type Prisma, UserRole } from '../../generated/prisma/client';
import {
  resolvePagination,
  type PaginationQueryDto,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import type { CredentialUser, SafeUser } from './user.types';

const SAFE_USER_SELECT = {
  id: true,
  outletId: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

const CREDENTIAL_USER_SELECT = {
  ...SAFE_USER_SELECT,
  passwordHash: true,
} as const;

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<CredentialUser | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: CREDENTIAL_USER_SELECT,
    });
  }

  async findActiveById(
    outletId: string,
    userId: string,
  ): Promise<SafeUser | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, outletId, isActive: true },
      select: SAFE_USER_SELECT,
    });
  }

  async findByOutletAndId(
    outletId: string,
    userId: string,
  ): Promise<SafeUser | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, outletId },
      select: SAFE_USER_SELECT,
    });
  }

  async listByOutlet(outletId: string, pagination?: PaginationQueryDto) {
    const page = resolvePagination(pagination);
    const where = { outletId };
    const orderBy = [{ role: 'asc' as const }, { name: 'asc' as const }];

    if (page.all) {
      const items = await this.prisma.user.findMany({
        where,
        select: SAFE_USER_SELECT,
        orderBy,
      });
      return { items, total: items.length };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: SAFE_USER_SELECT,
        orderBy,
        skip: page.skip,
        take: page.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  async create(data: Prisma.UserUncheckedCreateInput): Promise<SafeUser> {
    return this.prisma.user.create({
      data,
      select: SAFE_USER_SELECT,
    });
  }

  async update(
    outletId: string,
    userId: string,
    data: Prisma.UserUpdateInput,
  ): Promise<SafeUser | null> {
    await this.prisma.user.updateMany({
      where: { id: userId, outletId },
      data,
    });

    return this.findByOutletAndId(outletId, userId);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  async updatePassword(
    outletId: string,
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, outletId },
      data: { passwordHash },
    });
  }

  async countActiveAdmins(outletId: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        outletId,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });
  }
}
