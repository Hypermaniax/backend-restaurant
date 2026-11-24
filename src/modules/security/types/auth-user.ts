import type { UserRole } from '../../../generated/prisma/client';

export interface AuthUser {
  userId: string;
  outletId: string;
  role: UserRole;
}

export interface JwtPayload {
  sub: string;
  outletId: string;
  role: UserRole;
  type: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
