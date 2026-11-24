import { Injectable, UnauthorizedException } from '@nestjs/common';
import { MESSAGES } from '../../common/response';
import { TokenService } from '../security/token.service';
import type { AuthUser } from '../security/types/auth-user';
import type { SafeUser } from '../users/user.types';
import { UsersService } from '../users/users.service';
import type { LoginDto } from './dto/login.dto';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.validateCredentials(dto.email, dto.password);

    if (!user) {
      throw new UnauthorizedException('Email atau password salah');
    }

    await this.users.markLogin(user.id);
    const tokens = await this.tokens.issue({
      id: user.id,
      outletId: user.outletId,
      role: user.role,
    });

    return { ...tokens, user };
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const payload = await this.tokens.verifyRefresh(refreshToken);
    const user = await this.users.findActiveById(payload.outletId, payload.sub);

    if (!user) {
      throw new UnauthorizedException('Akun tidak aktif');
    }

    const tokens = await this.tokens.issue({
      id: user.id,
      outletId: user.outletId,
      role: user.role,
    });

    return { ...tokens, user };
  }

  async me(user: AuthUser): Promise<SafeUser> {
    const current = await this.users.findActiveById(user.outletId, user.userId);

    if (!current) {
      throw new UnauthorizedException('Akun tidak aktif');
    }

    return current;
  }

  logout(): { message: string } {
    return { message: MESSAGES.auth.logout };
  }
}
