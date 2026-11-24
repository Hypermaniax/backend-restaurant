import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

jest.setTimeout(30000);

interface AuthBody {
  accessToken: string;
}

interface OrderEventPayload {
  order: {
    id: string;
    queueNumber: number | null;
    status: string;
  };
}

interface QueueEventPayload {
  queue: {
    queueNumber: number;
    status: string;
  };
}

function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Event ${event} tidak diterima`));
    }, 4_000);
    const handler = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });
}

async function connectSocket(
  url: string,
  auth: Record<string, unknown>,
): Promise<Socket> {
  const socket = io(url, {
    auth,
    transports: ['websocket'],
    reconnection: false,
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Socket tidak terhubung'));
    }, 4_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  return socket;
}

describe('Realtime (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let baseUrl = '';
  let accessToken = '';
  let outletId = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.listen(0);
    const server = app.getHttpServer();
    const address = (
      server as { address: () => AddressInfo | string | null }
    ).address();
    if (!address || typeof address === 'string') {
      throw new Error('Alamat server e2e tidak ditemukan');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: process.env.SEED_ADMIN_EMAIL ?? 'admin@rembuk.local',
        password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!',
      })
      .expect(200);
    accessToken = (login.body as AuthBody).accessToken;

    const outlet = await prisma.outlet.findUnique({
      where: { slug: 'rembuk' },
    });
    if (!outlet) {
      throw new Error('Outlet seed tidak ditemukan');
    }
    outletId = outlet.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('joins staff/display rooms and emits after order commit', async () => {
    const menuItem = await prisma.menuItem.findFirst({
      where: { outletId, name: 'Air Mineral', isActive: true },
    });
    if (!menuItem) {
      throw new Error('Menu seed Air Mineral tidak ditemukan');
    }

    let cashierSocket: Socket | null = null;
    let displaySocket: Socket | null = null;
    let orderId = '';

    try {
      cashierSocket = await connectSocket(baseUrl, {
        token: accessToken,
      });
      displaySocket = await connectSocket(baseUrl, {
        channel: 'display',
        outletId,
      });

      const paidEvent = waitForEvent<OrderEventPayload>(
        cashierSocket,
        'order.paid',
      );
      const queueEvent = waitForEvent<QueueEventPayload>(
        displaySocket,
        'queue.updated',
      );

      const response = await request(app.getHttpServer())
        .post('/cashier/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          orderType: 'TAKEAWAY',
          paymentMethod: 'CASH',
          customerName: 'Socket E2E',
          items: [{ menuItemId: menuItem.id, qty: 1 }],
        })
        .expect(201);
      orderId = (response.body as { id: string }).id;

      const paid = await paidEvent;
      expect(paid.order).toMatchObject({
        id: orderId,
        status: 'PAID',
        queueNumber: expect.any(Number) as unknown,
      });

      const queue = await queueEvent;
      expect(queue.queue).toMatchObject({
        queueNumber: paid.order.queueNumber,
        status: 'PAID',
      });

      const statusEvent = waitForEvent<OrderEventPayload>(
        cashierSocket,
        'order.status_changed',
      );
      await request(app.getHttpServer())
        .patch(`/kds/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'PREPARING' })
        .expect(200);
      const changed = await statusEvent;
      expect(changed.order).toMatchObject({
        id: orderId,
        status: 'PREPARING',
        queueNumber: paid.order.queueNumber,
      });
    } finally {
      cashierSocket?.disconnect();
      displaySocket?.disconnect();
      if (orderId) {
        await prisma.payment.deleteMany({ where: { orderId } });
        await prisma.order.deleteMany({ where: { id: orderId } });
        await prisma.auditLog.deleteMany({
          where: { entityType: 'order', entityId: orderId },
        });
      }
    }
  });
});
