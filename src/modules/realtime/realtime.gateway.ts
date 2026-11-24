import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../security/types/auth-user';

interface ConnectionWindow {
  count: number;
  resetAt: number;
}

@WebSocketGateway()
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server?: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly connectionWindows = new Map<string, ConnectionWindow>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    const address = client.handshake.address || 'unknown';
    if (!this.allowConnection(address)) {
      client.disconnect(true);
      return;
    }

    const auth = this.asRecord(client.handshake.auth);
    const token = this.stringValue(auth?.token);
    if (token) {
      const payload = await this.verifyAccessToken(token);
      if (!payload) {
        client.disconnect(true);
        return;
      }

      const rooms = this.staffRooms(payload.outletId, payload.role);
      if (rooms.length === 0) {
        client.disconnect(true);
        return;
      }
      await client.join(rooms);
      return;
    }

    if (this.stringValue(auth?.channel) !== 'display') {
      client.disconnect(true);
      return;
    }

    const outletId =
      this.stringValue(auth?.outletId) ?? (await this.defaultOutletId());
    if (!outletId) {
      client.disconnect(true);
      return;
    }

    await client.join(`outlet:${outletId}:display`);
  }

  emitToRoom(room: string, event: string, payload: unknown) {
    try {
      this.server?.to(room).emit(event, payload);
    } catch {
      this.logger.warn(`Socket emit failed for ${event}`);
    }
  }

  private async verifyAccessToken(token: string): Promise<JwtPayload | null> {
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
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  private staffRooms(outletId: string, role: UserRole): string[] {
    const rooms: string[] = [];
    if (role === UserRole.CASHIER || role === UserRole.ADMIN) {
      rooms.push(`outlet:${outletId}:cashier`);
    }
    if (role === UserRole.KITCHEN || role === UserRole.ADMIN) {
      rooms.push(`outlet:${outletId}:kds`);
    }
    return rooms;
  }

  private async defaultOutletId(): Promise<string | null> {
    const outlet = await this.prisma.outlet.findFirst({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return outlet?.id ?? null;
  }

  private allowConnection(address: string): boolean {
    const now = Date.now();
    const current = this.connectionWindows.get(address);
    if (!current || current.resetAt <= now) {
      this.connectionWindows.set(address, {
        count: 1,
        resetAt: now + 60_000,
      });
      return true;
    }

    current.count += 1;
    if (current.count <= 30) {
      return true;
    }

    this.logger.warn('Socket connection rate limit exceeded');
    return false;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private stringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
}
