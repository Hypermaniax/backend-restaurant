import type { UserRole } from '../../generated/prisma/client';

export interface SafeUser {
  id: string;
  outletId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface CredentialUser extends SafeUser {
  passwordHash: string;
}
