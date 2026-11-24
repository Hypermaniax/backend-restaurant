import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthUser, JwtPayload } from '../types/auth-user';

type AuthenticatedRequest = Request & { user?: AuthUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token akses tidak ditemukan');
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Token akses tidak ditemukan');
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });

      if (
        payload.type !== 'access' ||
        !payload.sub ||
        !payload.outletId ||
        !payload.role
      ) {
        throw new Error('Invalid access payload');
      }

      request.user = {
        userId: payload.sub,
        outletId: payload.outletId,
        role: payload.role,
      };

      return true;
    } catch {
      throw new UnauthorizedException(
        'Token akses tidak valid atau kedaluwarsa',
      );
    }
  }
}
