import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { UserRole } from '../../generated/prisma/client';
import type { JwtPayload, TokenPair } from './types/auth-user';

export interface TokenSubject {
  id: string;
  outletId: string;
  role: UserRole;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issue(subject: TokenSubject): Promise<TokenPair> {
    const base = {
      sub: subject.id,
      outletId: subject.outletId,
      role: subject.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync({ ...base, type: 'access' } satisfies JwtPayload, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.config.getOrThrow<string>(
          'JWT_EXPIRES_IN',
        ) as JwtSignOptions['expiresIn'],
      }),
      this.jwt.signAsync({ ...base, type: 'refresh' } satisfies JwtPayload, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.getOrThrow<string>(
          'JWT_REFRESH_EXPIRES_IN',
        ) as JwtSignOptions['expiresIn'],
      }),
    ]);

    return { accessToken, refreshToken };
  }

  async verifyRefresh(token: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });

      if (
        payload.type !== 'refresh' ||
        !payload.sub ||
        !payload.outletId ||
        !payload.role
      ) {
        throw new Error('Invalid refresh payload');
      }

      return payload;
    } catch {
      throw new UnauthorizedException(
        'Refresh token tidak valid atau kedaluwarsa',
      );
    }
  }
}
