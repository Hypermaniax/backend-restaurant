import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';
import type { TokenService } from '../security/token.service';
import type { SafeUser } from '../users/user.types';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

const user: SafeUser = {
  id: 'user-1',
  outletId: 'outlet-1',
  name: 'Admin Rembuk',
  email: 'admin@rembuk.local',
  role: UserRole.ADMIN,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

function buildService() {
  const users = {
    validateCredentials: jest.fn(),
    markLogin: jest.fn(),
    findActiveById: jest.fn(),
  };
  const tokens = {
    issue: jest.fn(),
    verifyRefresh: jest.fn(),
  };
  const service = new AuthService(
    users as unknown as UsersService,
    tokens as unknown as TokenService,
  );

  return { service, users, tokens };
}

describe('AuthService', () => {
  it('logs in a valid staff and issues tokens', async () => {
    const { service, users, tokens } = buildService();
    users.validateCredentials.mockResolvedValue(user);
    tokens.issue.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
    });

    const result = await service.login({
      email: 'admin@rembuk.local',
      password: 'Admin123!',
    });

    expect(users.markLogin).toHaveBeenCalledWith(user.id);
    expect(tokens.issue).toHaveBeenCalledWith({
      id: user.id,
      outletId: user.outletId,
      role: user.role,
    });
    expect(result).toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
      user,
    });
  });

  it('rejects invalid credentials', async () => {
    const { service, users } = buildService();
    users.validateCredentials.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'admin@rembuk.local',
        password: 'wrong-password',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects refresh for an inactive user', async () => {
    const { service, users, tokens } = buildService();
    tokens.verifyRefresh.mockResolvedValue({
      sub: user.id,
      outletId: user.outletId,
      role: user.role,
      type: 'refresh',
    });
    users.findActiveById.mockResolvedValue(null);

    await expect(service.refresh('refresh-token-value')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
