import { BadRequestException, ConflictException } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';
import type { UserRepository } from './user.repository';
import type { CredentialUser, SafeUser } from './user.types';
import { UsersService } from './users.service';

const safeUser: SafeUser = {
  id: 'user-1',
  outletId: 'outlet-1',
  name: 'Kasir Rembuk',
  email: 'kasir@rembuk.local',
  role: UserRole.CASHIER,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const credentialUser: CredentialUser = {
  ...safeUser,
  passwordHash: 'hashed-password',
};

function buildService() {
  const users = {
    findByEmail: jest.fn(),
    findActiveById: jest.fn(),
    findByOutletAndId: jest.fn(),
    listByOutlet: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateLastLogin: jest.fn(),
    updatePassword: jest.fn(),
    countActiveAdmins: jest.fn(),
  };
  const passwords = {
    hash: jest.fn(),
    verify: jest.fn(),
  };
  const service = new UsersService(
    users as unknown as UserRepository,
    passwords,
  );

  return { service, users, passwords };
}

describe('UsersService', () => {
  it('returns staff with pagination metadata', async () => {
    const { service, users } = buildService();
    users.listByOutlet.mockResolvedValue({ items: [safeUser], total: 3 });

    const result = await service.listStaff('outlet-1', {
      page: 1,
      pageSize: 2,
    });

    expect(users.listByOutlet).toHaveBeenCalledWith('outlet-1', {
      page: 1,
      pageSize: 2,
    });
    expect(result.items).toEqual([safeUser]);
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
  });

  it('validates active credentials and strips the password hash', async () => {
    const { service, users, passwords } = buildService();
    users.findByEmail.mockResolvedValue(credentialUser);
    passwords.verify.mockResolvedValue(true);

    const result = await service.validateCredentials(
      'KASIR@REMBUK.LOCAL',
      'Kasir123!',
    );

    expect(users.findByEmail).toHaveBeenCalledWith('kasir@rembuk.local');
    expect(result).toEqual(safeUser);
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects credentials for inactive users', async () => {
    const { service, users } = buildService();
    users.findByEmail.mockResolvedValue({
      ...credentialUser,
      isActive: false,
    });

    await expect(
      service.validateCredentials('kasir@rembuk.local', 'Kasir123!'),
    ).resolves.toBeNull();
  });

  it('rejects duplicate staff email', async () => {
    const { service, users } = buildService();
    users.findByEmail.mockResolvedValue(credentialUser);

    await expect(
      service.createStaff('outlet-1', {
        name: 'Kasir Baru',
        email: 'kasir@rembuk.local',
        password: 'Kasir123!',
        role: UserRole.CASHIER,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('prevents an admin from deactivating their own account', async () => {
    const { service, users } = buildService();
    users.findByOutletAndId.mockResolvedValue({
      ...safeUser,
      role: UserRole.ADMIN,
    });

    await expect(
      service.deactivateStaff('outlet-1', 'user-1', 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });
});
