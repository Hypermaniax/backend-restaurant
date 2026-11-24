import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'rembuk_refresh';
const DEFAULT_REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthCookieService {
  constructor(private readonly config: ConfigService) {}

  read(request: Request): string | undefined {
    const value: unknown = request.cookies?.[REFRESH_COOKIE_NAME];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  set(response: Response, refreshToken: string): void {
    response.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...this.baseOptions(),
      maxAge: this.refreshMaxAgeMs(),
    });
  }

  clear(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, this.baseOptions());
  }

  private baseOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/auth',
    };
  }

  private refreshMaxAgeMs(): number {
    const raw = (
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d'
    ).trim();
    const match = /^(\d+)([smhd])$/.exec(raw);
    if (!match) {
      return DEFAULT_REFRESH_MAX_AGE_MS;
    }

    const multipliers: Record<string, number> = {
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };

    return Number(match[1]) * multipliers[match[2]];
  }
}
