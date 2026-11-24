import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { OrdersService } from './../src/modules/orders/orders.service';
import type { PaymentGateway } from './../src/modules/payments/payment.types';
import { PAYMENT_GATEWAY } from './../src/modules/payments/xendit-payment.provider';

jest.setTimeout(30000);

interface AuthBody {
  accessToken: string;
  refreshToken: string;
  message?: string;
  user: {
    email: string;
    role: string;
    passwordHash?: unknown;
  };
}

function asBody<T>(body: unknown): T {
  return body as T;
}

function getRefreshCookie(response: {
  headers: Record<string, unknown>;
}): string {
  const raw = response.headers['set-cookie'];
  const cookies = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === 'string'
      ? [raw]
      : [];
  const cookie = cookies.find((value) => value.startsWith('rembuk_refresh='));
  if (!cookie) {
    throw new Error('Refresh cookie not found');
  }
  return cookie.split(';')[0];
}

async function loginAs(
  app: INestApplication<App>,
  email: string,
  password: string,
): Promise<AuthBody> {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  return asBody<AuthBody>(response.body);
}

describe('Health (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken = '';
  let refreshToken = '';
  let refreshCookie = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      database: 'up',
    });
  });

  it('/auth/me rejects request without token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('/auth/login returns tokens and safe user', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: process.env.SEED_ADMIN_EMAIL ?? 'admin@rembuk.local',
        password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!',
      })
      .expect(200);

    const body = asBody<AuthBody>(response.body);

    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
    expect(body.message).toBe('Login berhasil');
    expect(body.user).toMatchObject({
      email: process.env.SEED_ADMIN_EMAIL ?? 'admin@rembuk.local',
      role: 'ADMIN',
    });
    expect(body.user.passwordHash).toBeUndefined();

    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
    refreshCookie = getRefreshCookie(response);
    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/auth');
    expect(setCookie).toContain('SameSite=Lax');
  });

  it('/auth/me returns current admin', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      email: process.env.SEED_ADMIN_EMAIL ?? 'admin@rembuk.local',
      role: 'ADMIN',
    });
  });

  it('/auth/refresh accepts the httpOnly cookie without a body', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(200);

    const body = asBody<AuthBody>(response.body);
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
    expect(body.message).toBe('Sesi berhasil diperbarui');
    expect(String(response.headers['set-cookie'])).toContain('rembuk_refresh=');
  });

  it('/auth/refresh rotates tokens from the body fallback', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    const body = asBody<AuthBody>(response.body);
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
    expect(body.message).toBe('Sesi berhasil diperbarui');
  });

  it('/auth/logout clears the refresh cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', refreshCookie)
      .expect(200);

    expect(response.body).toMatchObject({ message: 'Logout berhasil' });
    expect(String(response.headers['set-cookie'])).toContain(
      'rembuk_refresh=;',
    );
  });

  it('/auth/me rejects a refresh token', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${refreshToken}`)
      .expect(401);
  });

  it('/auth/refresh rejects an access token', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: accessToken })
      .expect(401);
  });

  it('admin can create staff and cashier is denied admin routes', async () => {
    const email = `cashier-e2e-${Date.now()}@rembuk.local`;
    const createdResponse = await request(app.getHttpServer())
      .post('/admin/staff')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Kasir E2E',
        email,
        password: 'Kasir123!',
        role: 'CASHIER',
      })
      .expect(201);
    const created = asBody<{
      id: string;
      email: string;
      role: string;
      message?: string;
    }>(createdResponse.body);

    try {
      expect(created).toMatchObject({
        email,
        role: 'CASHIER',
        message: 'Staff berhasil dibuat',
      });

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Kasir123!' })
        .expect(200);
      const cashier = asBody<AuthBody>(loginResponse.body);

      await request(app.getHttpServer())
        .get('/admin/settings')
        .set('Authorization', `Bearer ${cashier.accessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/admin/staff')
        .set('Authorization', `Bearer ${cashier.accessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/admin/reports/daily')
        .set('Authorization', `Bearer ${cashier.accessToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/admin/staff/${created.id}/deactivate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Kasir123!' })
        .expect(401);
    } finally {
      await prisma.user.deleteMany({ where: { id: created.id } });
    }
  });

  it('/admin/settings includes read-only qrBaseUrl', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = asBody<{ serviceRateBp: number; qrBaseUrl: string }>(
      response.body,
    );
    expect(typeof body.serviceRateBp).toBe('number');
    expect(typeof body.qrBaseUrl).toBe('string');
  });

  it('/admin/settings updates and writes an audit log', async () => {
    const beforeResponse = await request(app.getHttpServer())
      .get('/admin/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const before = asBody<{ receiptFooter: string | null }>(
      beforeResponse.body,
    );
    const auditBefore = await prisma.auditLog.count({
      where: { action: 'SETTINGS_UPDATED' },
    });

    const updateResponse = await request(app.getHttpServer())
      .patch('/admin/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ receiptFooter: 'E2E footer' })
      .expect(200);
    const updated = asBody<{
      receiptFooter: string | null;
      message?: string;
    }>(updateResponse.body);

    expect(updated.receiptFooter).toBe('E2E footer');
    expect(updated.message).toBe('Settings berhasil diperbarui');
    expect(
      await prisma.auditLog.count({
        where: { action: 'SETTINGS_UPDATED' },
      }),
    ).toBe(auditBefore + 1);

    await request(app.getHttpServer())
      .patch('/admin/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ receiptFooter: before.receiptFooter })
      .expect(200);
  });

  it('/admin/settings rejects service rate above 10000', async () => {
    await request(app.getHttpServer())
      .patch('/admin/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ serviceRateBp: 10001 })
      .expect(400);
  });

  it('/admin/tax-rules rejects rate above 10000', async () => {
    await request(app.getHttpServer())
      .patch('/admin/tax-rules/DINE_IN')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isEnabled: true, rateBp: 10001 })
      .expect(400);
  });

  it('serves public table and menu without auth', async () => {
    const tableResponse = await request(app.getHttpServer())
      .get('/public/tables/T01')
      .expect(200);

    expect(tableResponse.body).toMatchObject({
      code: 'T01',
      outlet: { slug: 'rembuk' },
    });
    expect(tableResponse.body).not.toHaveProperty('qrToken');

    const menuResponse = await request(app.getHttpServer())
      .get('/public/tables/T01/menu')
      .expect(200);
    const menu = asBody<{
      table: { code: string };
      categories: Array<{
        items: Array<{ id: string; isAvailable: boolean }>;
      }>;
    }>(menuResponse.body);

    expect(menu.table.code).toBe('T01');
    expect(menu.categories.length).toBeGreaterThan(0);
    const items = menu.categories.flatMap((category) => category.items);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => typeof item.isAvailable === 'boolean')).toBe(
      true,
    );
  });

  it('cashier can read the POS menu', async () => {
    const email = `cashier-menu-${Date.now()}@rembuk.local`;
    const createdResponse = await request(app.getHttpServer())
      .post('/admin/staff')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Kasir Menu E2E',
        email,
        password: 'Kasir123!',
        role: 'CASHIER',
      })
      .expect(201);
    const created = asBody<{ id: string }>(createdResponse.body);

    try {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Kasir123!' })
        .expect(200);
      const cashier = asBody<AuthBody>(loginResponse.body);

      await request(app.getHttpServer()).get('/cashier/menu').expect(401);

      const menuResponse = await request(app.getHttpServer())
        .get('/cashier/menu')
        .set('Authorization', `Bearer ${cashier.accessToken}`)
        .expect(200);
      const menu = asBody<{
        categories: Array<{
          name: string;
          items: Array<{
            id: string;
            isAvailable: boolean;
            modifierGroups: unknown[];
          }>;
        }>;
      }>(menuResponse.body);

      expect(menu.categories.length).toBeGreaterThan(0);
      const items = menu.categories.flatMap((category) => category.items);
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => typeof item.isAvailable === 'boolean')).toBe(
        true,
      );
      expect(items.every((item) => Array.isArray(item.modifierGroups))).toBe(
        true,
      );
    } finally {
      await prisma.user.deleteMany({ where: { id: created.id } });
    }
  });

  it('runs catalog soft delete, cashier availability, image upload, and QR', async () => {
    const suffix = Date.now();
    const categoryName = `E2E Kategori ${suffix}`;
    const itemName = `E2E Menu ${suffix}`;
    const tableCode = `E2E${suffix.toString().slice(-8)}`;
    let categoryId = '';
    let itemId = '';
    let tableId = '';
    let imageUrl = '';

    try {
      const categoryResponse = await request(app.getHttpServer())
        .post('/admin/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: categoryName, sortOrder: 99 })
        .expect(201);
      expect(categoryResponse.body).toMatchObject({
        message: 'Kategori berhasil dibuat',
      });
      categoryId = asBody<{ id: string }>(categoryResponse.body).id;

      const itemResponse = await request(app.getHttpServer())
        .post('/admin/menu-items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          categoryId,
          name: itemName,
          description: 'Menu e2e',
          price: 12345,
          sortOrder: 99,
        })
        .expect(201);
      itemId = asBody<{ id: string }>(itemResponse.body).id;

      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );
      const uploadResponse = await request(app.getHttpServer())
        .post(`/admin/menu-items/${itemId}/image`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', png, {
          filename: 'menu.png',
          contentType: 'image/png',
        })
        .expect(201);
      imageUrl = asBody<{ imageUrl: string }>(uploadResponse.body).imageUrl;
      expect(imageUrl).toMatch(/^\/uploads\/menu\/.+\.png$/);

      await request(app.getHttpServer())
        .post(`/admin/menu-items/${itemId}/image`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('not an image'), {
          filename: 'menu.txt',
          contentType: 'text/plain',
        })
        .expect(400);

      const cashier = await loginAs(
        app,
        process.env.SEED_CASHIER_EMAIL ?? 'kasir@rembuk.local',
        process.env.SEED_CASHIER_PASSWORD ?? 'Kasir123!',
      );

      const auditBefore = await prisma.auditLog.count({
        where: { action: 'MENU_ITEM_AVAILABILITY_UPDATED' },
      });

      const availabilityResponse = await request(app.getHttpServer())
        .patch(`/cashier/menu-items/${itemId}/availability`)
        .set('Authorization', `Bearer ${cashier.accessToken}`)
        .send({ isAvailable: false })
        .expect(200);
      expect(availabilityResponse.body).toMatchObject({
        id: itemId,
        isAvailable: false,
      });
      expect(
        await prisma.auditLog.count({
          where: { action: 'MENU_ITEM_AVAILABILITY_UPDATED' },
        }),
      ).toBe(auditBefore + 1);

      await request(app.getHttpServer())
        .patch(`/admin/menu-items/${itemId}`)
        .set('Authorization', `Bearer ${cashier.accessToken}`)
        .send({ price: 1 })
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/admin/menu-items/${itemId}`)
        .set('Authorization', `Bearer ${cashier.accessToken}`)
        .expect(403);

      const menuResponse = await request(app.getHttpServer())
        .get('/public/tables/T01/menu')
        .expect(200);
      const publicItems = asBody<{
        categories: Array<{
          items: Array<{ id: string; isAvailable: boolean }>;
        }>;
      }>(menuResponse.body).categories.flatMap((category) => category.items);
      expect(publicItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: itemId, isAvailable: false }),
        ]),
      );

      await request(app.getHttpServer())
        .delete(`/admin/menu-items/${itemId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const storedItem = await prisma.menuItem.findUnique({
        where: { id: itemId },
      });
      expect(storedItem?.isActive).toBe(false);

      const menuAfterDelete = await request(app.getHttpServer())
        .get('/public/tables/T01/menu')
        .expect(200);
      const deletedItem = asBody<{
        categories: Array<{ items: Array<{ id: string }> }>;
      }>(menuAfterDelete.body)
        .categories.flatMap((category) => category.items)
        .find((item) => item.id === itemId);
      expect(deletedItem).toBeUndefined();

      await request(app.getHttpServer())
        .delete(`/admin/categories/${categoryId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const storedCategory = await prisma.category.findUnique({
        where: { id: categoryId },
      });
      expect(storedCategory?.isActive).toBe(false);

      const tableResponse = await request(app.getHttpServer())
        .post('/admin/tables')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: tableCode, name: 'Meja E2E', zone: 'Test' })
        .expect(201);
      expect(tableResponse.body).toMatchObject({
        message: 'Meja berhasil dibuat',
      });
      tableId = asBody<{ id: string }>(tableResponse.body).id;

      const qrResponse = await request(app.getHttpServer())
        .get(`/admin/tables/${tableId}/qr.png`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect('Content-Type', /image\/png/);
      expect(Number(qrResponse.headers['content-length'] ?? 0)).toBeGreaterThan(
        1000,
      );

      const pdfResponse = await request(app.getHttpServer())
        .get('/admin/tables/qr.pdf')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect('Content-Type', /application\/pdf/);
      expect(
        Number(pdfResponse.headers['content-length'] ?? 0),
      ).toBeGreaterThan(1000);

      const openResponse = await request(app.getHttpServer())
        .post(`/cashier/tables/${tableId}/sessions/open`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ guestCount: 2 })
        .expect(201);
      expect(openResponse.body).toMatchObject({ status: 'OPEN' });

      const closeResponse = await request(app.getHttpServer())
        .post(`/cashier/tables/${tableId}/sessions/close`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);
      expect(closeResponse.body).toMatchObject({ status: 'CLOSED' });

      await request(app.getHttpServer())
        .delete(`/admin/tables/${tableId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const storedTable = await prisma.diningTable.findUnique({
        where: { id: tableId },
      });
      expect(storedTable?.isActive).toBe(false);
    } finally {
      if (tableId) {
        await prisma.tableSession.deleteMany({ where: { tableId } });
        await prisma.diningTable.deleteMany({ where: { id: tableId } });
      }
      if (imageUrl) {
        const filePath = resolve(process.cwd(), imageUrl.replace(/^\//, ''));
        await unlink(filePath).catch(() => undefined);
      }
      if (itemId) {
        await prisma.menuItemModifierGroup.deleteMany({
          where: { menuItemId: itemId },
        });
        await prisma.menuItem.deleteMany({ where: { id: itemId } });
      }
      if (categoryId) {
        await prisma.category.deleteMany({ where: { id: categoryId } });
      }
    }
  });

  it('manages modifier groups and options with soft delete', async () => {
    const suffix = Date.now();
    let groupId = '';
    let optionId = '';

    try {
      const groupResponse = await request(app.getHttpServer())
        .post('/admin/modifier-groups')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: `E2E Modifier ${suffix}`,
          selectionType: 'SINGLE',
          isRequired: true,
        })
        .expect(201);
      const group = asBody<{ id: string; maxSelect: number }>(
        groupResponse.body,
      );
      groupId = group.id;
      expect(group.maxSelect).toBe(1);

      const optionResponse = await request(app.getHttpServer())
        .post(`/admin/modifier-groups/${groupId}/options`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Pedas', priceDelta: 0 })
        .expect(201);
      optionId = asBody<{ id: string }>(optionResponse.body).id;

      const listResponse = await request(app.getHttpServer())
        .get('/admin/modifier-groups')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const groups = asBody<{
        items: Array<{ id: string; options: Array<{ id: string }> }>;
      }>(listResponse.body);
      const listed = groups.items.find((item) => item.id === groupId);
      expect(listed?.options).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: optionId })]),
      );

      await request(app.getHttpServer())
        .delete(`/admin/modifier-options/${optionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const storedOption = await prisma.modifierOption.findUnique({
        where: { id: optionId },
      });
      expect(storedOption?.isActive).toBe(false);

      await request(app.getHttpServer())
        .delete(`/admin/modifier-groups/${groupId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const storedGroup = await prisma.modifierGroup.findUnique({
        where: { id: groupId },
      });
      expect(storedGroup?.isActive).toBe(false);
    } finally {
      if (optionId) {
        await prisma.modifierOption.deleteMany({ where: { id: optionId } });
      }
      if (groupId) {
        await prisma.menuItemModifierGroup.deleteMany({ where: { groupId } });
        await prisma.modifierGroup.deleteMany({ where: { id: groupId } });
      }
    }
  });

  it('runs quote, public cash order, idempotency, payment, cancel, expiry, and cashier orders', async () => {
    const suffix = Date.now();
    const tableCode = `ORD${suffix.toString().slice(-8)}`;
    const outlet = await prisma.outlet.findUnique({
      where: { slug: 'rembuk' },
    });
    if (!outlet) {
      throw new Error('Outlet seed tidak ditemukan');
    }
    const menuItem = await prisma.menuItem.findFirst({
      where: { outletId: outlet.id, name: 'Air Mineral', isActive: true },
    });
    if (!menuItem) {
      throw new Error('Menu seed Air Mineral tidak ditemukan');
    }

    const ordersService = app.get(OrdersService);
    const orderIds = new Set<string>();
    let tableId = '';

    try {
      const tableResponse = await request(app.getHttpServer())
        .post('/admin/tables')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: tableCode, name: 'Meja Order E2E', zone: 'Test' })
        .expect(201);
      tableId = asBody<{ id: string }>(tableResponse.body).id;

      const item = { menuItemId: menuItem.id, qty: 2 };
      const quoteResponse = await request(app.getHttpServer())
        .post('/public/orders/quote')
        .send({ tableCode, items: [item] })
        .expect(200);
      expect(quoteResponse.body).toMatchObject({
        subtotal: 10000,
        serviceAmount: 500,
        taxAmount: 1050,
        total: 11550,
        taxRateBp: 1000,
        taxInclusive: false,
        taxBaseIncludesService: true,
        serviceRateBp: 500,
      });

      await request(app.getHttpServer())
        .post('/public/orders')
        .send({ tableCode, orderType: 'TAKEAWAY', items: [item] })
        .expect(400);

      const idempotencyKey = `e2e-order-${suffix}`;
      const orderResponse = await request(app.getHttpServer())
        .post('/public/orders')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          tableCode,
          customerName: 'Customer E2E',
          items: [{ ...item, notes: 'Tanpa es' }],
        })
        .expect(201);
      const publicOrder = asBody<{
        id: string;
        status: string;
        queueNumber: number | null;
        total: number;
        sessionId: string;
        message?: string;
        accessToken?: unknown;
      }>(orderResponse.body);
      orderIds.add(publicOrder.id);

      expect(publicOrder).toMatchObject({
        status: 'AWAITING_CASH',
        queueNumber: null,
        total: 11550,
        message: 'Order berhasil dibuat',
      });
      expect(publicOrder.sessionId).toEqual(expect.any(String));
      expect(publicOrder.accessToken).toBeUndefined();

      const replayResponse = await request(app.getHttpServer())
        .post('/public/orders')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          tableCode,
          customerName: 'Customer E2E',
          items: [{ ...item, notes: 'Tanpa es' }],
        })
        .expect(201);
      expect(asBody<{ id: string }>(replayResponse.body).id).toBe(
        publicOrder.id,
      );

      const pendingResponse = await request(app.getHttpServer())
        .get('/cashier/orders')
        .query({
          status: 'AWAITING_CASH',
          tableId,
          source: 'CUSTOMER_QR',
        })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(
        asBody<{ items: Array<{ id: string }> }>(
          pendingResponse.body,
        ).items.map((order) => order.id),
      ).toContain(publicOrder.id);

      const cashierTablesResponse = await request(app.getHttpServer())
        .get('/cashier/tables')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(
        asBody<Array<{ id: string }>>(cashierTablesResponse.body).map(
          (table) => table.id,
        ),
      ).toContain(tableId);

      const paidResponse = await request(app.getHttpServer())
        .post(`/cashier/orders/${publicOrder.id}/confirm-payment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ paymentMethod: 'CASH' })
        .expect(200);
      const paidOrder = asBody<{
        status: string;
        paymentStatus: string;
        queueNumber: number;
        queueDisplay: string;
        message?: string;
        payments: Array<{ method: string; status: string }>;
      }>(paidResponse.body);
      expect(paidOrder).toMatchObject({
        status: 'PAID',
        paymentStatus: 'PAID',
        queueNumber: expect.any(Number) as unknown,
        queueDisplay: expect.stringMatching(/^A-\d{3,}$/) as unknown,
        message: 'Pembayaran berhasil dikonfirmasi',
        payments: [expect.objectContaining({ method: 'CASH', status: 'PAID' })],
      });
      expect(paidOrder.queueNumber).toBeGreaterThan(0);

      const detailResponse = await request(app.getHttpServer())
        .get(`/cashier/orders/${publicOrder.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const detail = asBody<{
        id: string;
        status: string;
        items: Array<{ nameSnapshot: string; qty: number }>;
      }>(detailResponse.body);
      expect(detail).toMatchObject({
        id: publicOrder.id,
        status: 'PAID',
      });
      expect(detail.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ nameSnapshot: 'Air Mineral', qty: 2 }),
        ]),
      );

      const receiptSettingsResponse = await request(app.getHttpServer())
        .get('/cashier/settings/receipt')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(receiptSettingsResponse.body).toMatchObject({
        outletName: expect.any(String) as unknown,
        taxInclusive: expect.any(Boolean) as unknown,
      });
      expect(receiptSettingsResponse.body).toHaveProperty('receiptFooter');

      const confirmedAudits = await prisma.auditLog.findMany({
        where: { entityType: 'order', entityId: publicOrder.id },
        select: { action: true },
      });
      expect(confirmedAudits.map((row) => row.action)).toEqual(
        expect.arrayContaining(['ORDER_PAYMENT_CONFIRMED', 'QUEUE_ASSIGNED']),
      );

      await request(app.getHttpServer())
        .post(`/cashier/orders/${publicOrder.id}/cancel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reason: 'Tidak boleh' })
        .expect(400);

      const cancelOrderResponse = await request(app.getHttpServer())
        .post('/public/orders')
        .send({ tableCode, items: [{ menuItemId: menuItem.id, qty: 1 }] })
        .expect(201);
      const cancelOrder = asBody<{ id: string }>(cancelOrderResponse.body);
      orderIds.add(cancelOrder.id);

      const cancelledResponse = await request(app.getHttpServer())
        .post(`/cashier/orders/${cancelOrder.id}/cancel`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reason: 'Customer membatalkan' })
        .expect(200);
      expect(cancelledResponse.body).toMatchObject({
        status: 'CANCELLED',
        queueNumber: null,
        cancelReason: 'Customer membatalkan',
        message: 'Order berhasil dibatalkan',
      });

      const expiredOrderResponse = await request(app.getHttpServer())
        .post('/public/orders')
        .send({ tableCode, items: [{ menuItemId: menuItem.id, qty: 1 }] })
        .expect(201);
      const expiredOrder = asBody<{ id: string }>(expiredOrderResponse.body);
      orderIds.add(expiredOrder.id);
      await prisma.order.update({
        where: { id: expiredOrder.id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      await ordersService.expireStaleOrders(new Date());
      const storedExpired = await prisma.order.findUnique({
        where: { id: expiredOrder.id },
      });
      expect(storedExpired).toMatchObject({
        status: 'EXPIRED',
        paymentStatus: 'EXPIRED',
        queueNumber: null,
      });

      const cashierQuoteResponse = await request(app.getHttpServer())
        .post('/cashier/orders/quote')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          orderType: 'TAKEAWAY',
          items: [{ menuItemId: menuItem.id, qty: 2 }],
        })
        .expect(200);
      expect(cashierQuoteResponse.body).toMatchObject({
        subtotal: 10000,
        serviceAmount: 0,
        taxAmount: 0,
        total: 10000,
      });

      const takeawayResponse = await request(app.getHttpServer())
        .post('/cashier/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          orderType: 'TAKEAWAY',
          paymentMethod: 'EDC',
          customerName: 'Takeaway E2E',
          items: [{ menuItemId: menuItem.id, qty: 2 }],
        })
        .expect(201);
      const takeaway = asBody<{
        id: string;
        status: string;
        table: unknown;
        serviceAmount: number;
        taxAmount: number;
        queueNumber: number;
        message?: string;
        payments: Array<{ method: string }>;
      }>(takeawayResponse.body);
      orderIds.add(takeaway.id);
      expect(takeaway).toMatchObject({
        status: 'PAID',
        table: null,
        serviceAmount: 0,
        taxAmount: 0,
        queueNumber: expect.any(Number) as unknown,
        message: 'Order berhasil dibuat',
        payments: [expect.objectContaining({ method: 'EDC' })],
      });
      expect(takeaway.queueNumber).not.toBe(paidOrder.queueNumber);

      const cashierAudits = await prisma.auditLog.findMany({
        where: { entityType: 'order', entityId: takeaway.id },
        select: { action: true },
      });
      expect(cashierAudits.map((row) => row.action)).toEqual(
        expect.arrayContaining([
          'ORDER_CREATED',
          'ORDER_PAID',
          'QUEUE_ASSIGNED',
        ]),
      );

      const dineInResponse = await request(app.getHttpServer())
        .post('/cashier/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          orderType: 'DINE_IN',
          tableId,
          paymentMethod: 'CASH',
          items: [{ menuItemId: menuItem.id, qty: 1 }],
        })
        .expect(201);
      const dineIn = asBody<{
        id: string;
        status: string;
        queueNumber: number;
      }>(dineInResponse.body);
      orderIds.add(dineIn.id);
      expect(dineIn.status).toBe('PAID');
      expect(dineIn.queueNumber).not.toBe(paidOrder.queueNumber);
      expect(dineIn.queueNumber).not.toBe(takeaway.queueNumber);

      const kdsResponse = await request(app.getHttpServer())
        .get('/kds/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const kdsOrders = asBody<
        Array<{
          id: string;
          orderType: string;
          source: string;
          queueNumber: number;
          tableCode: string | null;
          customerName: string | null;
          items: Array<{ nameSnapshot: string; qty: number }>;
        }>
      >(kdsResponse.body);
      expect(kdsOrders).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: publicOrder.id,
            orderType: 'DINE_IN',
            queueNumber: paidOrder.queueNumber,
            tableCode,
            customerName: 'Customer E2E',
            items: [expect.objectContaining({ qty: 2 })],
          }),
        ]),
      );

      const prepareResponse = await request(app.getHttpServer())
        .patch(`/kds/orders/${publicOrder.id}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'PREPARING' })
        .expect(200);
      expect(prepareResponse.body).toMatchObject({
        status: 'PREPARING',
        queueNumber: paidOrder.queueNumber,
        message: 'Status order berhasil diperbarui',
      });

      const displayPreparing = await request(app.getHttpServer())
        .get('/public/display/queue')
        .expect(200);
      const preparingBody = asBody<{
        preparing: Array<Record<string, unknown>>;
        ready: Array<Record<string, unknown>>;
      }>(displayPreparing.body);
      const preparingItem = preparingBody.preparing.find(
        (item) => item.queueNumber === paidOrder.queueNumber,
      );
      expect(preparingItem).toEqual({
        queueNumber: paidOrder.queueNumber,
        orderType: 'DINE_IN',
        tableCode,
        status: 'PREPARING',
      });

      await request(app.getHttpServer())
        .patch(`/kds/orders/${publicOrder.id}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'READY' })
        .expect(200);
      const displayReady = await request(app.getHttpServer())
        .get('/public/display/queue')
        .expect(200);
      expect(
        asBody<{ ready: Array<{ queueNumber: number }> }>(displayReady.body)
          .ready,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ queueNumber: paidOrder.queueNumber }),
        ]),
      );

      await request(app.getHttpServer())
        .patch(`/kds/orders/${publicOrder.id}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'SERVED' })
        .expect(200);
      const displayAfterServed = await request(app.getHttpServer())
        .get('/public/display/queue')
        .expect(200);
      const servedBody = asBody<{
        preparing: Array<{ queueNumber: number }>;
        ready: Array<{ queueNumber: number }>;
      }>(displayAfterServed.body);
      expect(
        [...servedBody.preparing, ...servedBody.ready].some(
          (item) => item.queueNumber === paidOrder.queueNumber,
        ),
      ).toBe(false);

      const dashboardResponse = await request(app.getHttpServer())
        .get('/cashier/dashboard')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const dashboard = asBody<{
        revenueToday: number;
        openTables: number;
        pendingPayments: number;
        kdsQueue: number;
      }>(dashboardResponse.body);
      expect(dashboard.revenueToday).toBeGreaterThanOrEqual(11550);
      expect(dashboard.openTables).toBeGreaterThanOrEqual(1);
      expect(dashboard.pendingPayments).toBeGreaterThanOrEqual(0);
      expect(dashboard.kdsQueue).toBeGreaterThanOrEqual(2);

      await request(app.getHttpServer())
        .get(`/public/orders/${publicOrder.id}`)
        .expect(404);
    } finally {
      const ids = [...orderIds];
      if (ids.length > 0) {
        await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
        await prisma.order.deleteMany({ where: { id: { in: ids } } });
        await prisma.auditLog.deleteMany({
          where: { entityType: 'order', entityId: { in: ids } },
        });
      }
      if (tableId) {
        await prisma.tableSession.deleteMany({ where: { tableId } });
        await prisma.diningTable.deleteMany({ where: { id: tableId } });
      }
    }
  });

  it('runs customer QRIS, webhook idempotency, amount mismatch, retry, and cash fallback', async () => {
    const suffix = Date.now();
    const tableCode = `QRS${suffix.toString().slice(-8)}`;
    const outlet = await prisma.outlet.findUnique({
      where: { slug: 'rembuk' },
    });
    if (!outlet) {
      throw new Error('Outlet seed tidak ditemukan');
    }
    const menuItem = await prisma.menuItem.findFirst({
      where: { outletId: outlet.id, name: 'Air Mineral', isActive: true },
    });
    if (!menuItem) {
      throw new Error('Menu seed Air Mineral tidak ditemukan');
    }

    const config = app.get(ConfigService);
    const webhookToken = config.getOrThrow<string>('XENDIT_WEBHOOK_TOKEN');
    const gateway = app.get<PaymentGateway>(PAYMENT_GATEWAY);
    let qrSequence = 0;
    const gatewaySpy = jest
      .spyOn(gateway, 'createQris')
      .mockImplementation((input) => {
        qrSequence += 1;
        return Promise.resolve({
          providerPaymentId: `pr-${suffix}-${qrSequence}`,
          qrString: `QRIS-${suffix}-${qrSequence}`,
          expiresAt: input.expiresAt,
          raw: {
            payment_request_id: `pr-${suffix}-${qrSequence}`,
            status: 'REQUIRES_ACTION',
          },
        });
      });
    const simulateSpy = jest
      .spyOn(gateway, 'simulateQris')
      .mockResolvedValue(undefined);

    const orderIds = new Set<string>();
    const webhookExternalIds = new Set<string>();
    let tableId = '';

    try {
      const tableResponse = await request(app.getHttpServer())
        .post('/admin/tables')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: tableCode, name: 'Meja QRIS E2E', zone: 'Test' })
        .expect(201);
      tableId = asBody<{ id: string }>(tableResponse.body).id;

      const orderResponse = await request(app.getHttpServer())
        .post('/public/orders')
        .send({
          tableCode,
          items: [{ menuItemId: menuItem.id, qty: 2 }],
        })
        .expect(201);
      const publicOrder = asBody<{ id: string; status: string }>(
        orderResponse.body,
      );
      orderIds.add(publicOrder.id);
      expect(publicOrder.status).toBe('AWAITING_CASH');

      const payResponse = await request(app.getHttpServer())
        .post(`/public/orders/${publicOrder.id}/pay-online`)
        .send({ tableCode })
        .expect(200);
      const firstPayment = asBody<{
        paymentId: string;
        referenceId: string;
        status: string;
        amount: number;
        qrString: string;
        expiresAt: string;
        message?: string;
      }>(payResponse.body);
      expect(firstPayment).toMatchObject({
        status: 'PENDING',
        amount: 11550,
        qrString: expect.stringContaining('QRIS-') as unknown,
        expiresAt: expect.any(String) as unknown,
        message: 'QRIS siap digunakan',
      });

      const afterOnline = await prisma.order.findUnique({
        where: { id: publicOrder.id },
      });
      expect(afterOnline).toMatchObject({
        status: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        queueNumber: null,
      });

      const replayResponse = await request(app.getHttpServer())
        .post(`/public/orders/${publicOrder.id}/pay-online`)
        .send({ tableCode })
        .expect(200);
      expect(asBody<{ paymentId: string }>(replayResponse.body).paymentId).toBe(
        firstPayment.paymentId,
      );

      const pendingStatus = await request(app.getHttpServer())
        .get(`/public/orders/${publicOrder.id}/payment-status`)
        .query({ tableCode })
        .expect(200);
      expect(pendingStatus.body).toEqual({
        status: 'PENDING',
        queueNumber: null,
        queueDisplay: null,
      });

      const simulateResponse = await request(app.getHttpServer())
        .post(`/public/orders/${publicOrder.id}/simulate-payment`)
        .send({ tableCode })
        .expect(200);
      expect(
        asBody<{ status: string; message?: string }>(simulateResponse.body),
      ).toMatchObject({
        status: 'PENDING',
        message: 'Simulasi pembayaran dikirim ke Xendit',
      });
      expect(simulateSpy).toHaveBeenCalledWith({
        paymentRequestId: expect.stringContaining(`pr-${suffix}-`) as unknown,
        amount: 11550,
      });
      expect(
        await prisma.order.findUnique({ where: { id: publicOrder.id } }),
      ).toMatchObject({
        status: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
      });

      await request(app.getHttpServer())
        .get(`/public/orders/${publicOrder.id}/payment-status`)
        .query({ tableCode: `WRONG${suffix}` })
        .expect(404);

      await request(app.getHttpServer())
        .post('/webhooks/xendit')
        .set('x-callback-token', 'wrong-token')
        .send({ event: 'payment.capture', data: {} })
        .expect(401);

      const badPaymentId = `py-bad-${suffix}`;
      const badExternalId = `payment.capture:${badPaymentId}`;
      webhookExternalIds.add(badExternalId);
      await request(app.getHttpServer())
        .post('/webhooks/xendit')
        .set('x-callback-token', webhookToken)
        .send({
          event: 'payment.capture',
          data: {
            payment_id: badPaymentId,
            reference_id: firstPayment.referenceId,
            request_amount: 1000,
            currency: 'IDR',
          },
        })
        .expect(200);

      const badPayment = await prisma.payment.findUnique({
        where: { id: firstPayment.paymentId },
      });
      expect(badPayment?.status).toBe('FAILED');
      expect(
        await prisma.order.findUnique({ where: { id: publicOrder.id } }),
      ).toMatchObject({
        status: 'PENDING_PAYMENT',
        paymentStatus: 'FAILED',
        queueNumber: null,
      });

      const retryResponse = await request(app.getHttpServer())
        .post(`/public/orders/${publicOrder.id}/pay-online`)
        .send({ tableCode })
        .expect(200);
      const retryPayment = asBody<{
        paymentId: string;
        referenceId: string;
        status: string;
      }>(retryResponse.body);
      expect(retryPayment.paymentId).not.toBe(firstPayment.paymentId);
      expect(retryPayment.status).toBe('PENDING');

      const goodPaymentId = `py-good-${suffix}`;
      const goodExternalId = `payment.capture:${goodPaymentId}`;
      webhookExternalIds.add(goodExternalId);
      const capturePayload = {
        event: 'payment.capture',
        data: {
          payment_id: goodPaymentId,
          reference_id: retryPayment.referenceId,
          request_amount: 11550,
          currency: 'IDR',
          captures: [{ capture_timestamp: new Date().toISOString() }],
        },
      };

      await request(app.getHttpServer())
        .post('/webhooks/xendit')
        .set('x-callback-token', webhookToken)
        .send(capturePayload)
        .expect(200);
      await request(app.getHttpServer())
        .post('/webhooks/xendit')
        .set('x-callback-token', webhookToken)
        .send(capturePayload)
        .expect(200);

      const paidOrder = await prisma.order.findUnique({
        where: { id: publicOrder.id },
      });
      expect(paidOrder).toMatchObject({
        status: 'PAID',
        paymentStatus: 'PAID',
        queueNumber: expect.any(Number) as unknown,
      });
      const paidPaymentCount = await prisma.payment.count({
        where: { orderId: publicOrder.id, status: 'PAID' },
      });
      expect(paidPaymentCount).toBe(1);

      const paidStatus = await request(app.getHttpServer())
        .get(`/public/orders/${publicOrder.id}/payment-status`)
        .query({ tableCode })
        .expect(200);
      expect(paidStatus.body).toEqual({
        status: 'PAID',
        queueNumber: paidOrder?.queueNumber,
        queueDisplay: `A-${String(paidOrder?.queueNumber).padStart(3, '0')}`,
      });

      const cashierOrderResponse = await request(app.getHttpServer())
        .post('/cashier/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          orderType: 'TAKEAWAY',
          paymentMethod: 'QRIS',
          items: [{ menuItemId: menuItem.id, qty: 2 }],
        })
        .expect(201);
      const cashierOrder = asBody<{
        id: string;
        status: string;
        queueNumber: number | null;
        payments: unknown[];
      }>(cashierOrderResponse.body);
      orderIds.add(cashierOrder.id);
      expect(cashierOrder).toMatchObject({
        status: 'PENDING_PAYMENT',
        queueNumber: null,
        payments: [],
      });

      const cashierQrisResponse = await request(app.getHttpServer())
        .post(`/cashier/orders/${cashierOrder.id}/pay-qris`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const cashierQris = asBody<{
        paymentId: string;
        referenceId: string;
        status: string;
        message?: string;
      }>(cashierQrisResponse.body);
      expect(cashierQris.status).toBe('PENDING');
      expect(cashierQris.message).toBe('QRIS siap digunakan');

      const cashFallbackResponse = await request(app.getHttpServer())
        .post(`/cashier/orders/${cashierOrder.id}/confirm-payment`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ paymentMethod: 'CASH' })
        .expect(200);
      const cashFallback = asBody<{
        status: string;
        queueNumber: number;
        payments: Array<{ method: string; status: string }>;
      }>(cashFallbackResponse.body);
      expect(cashFallback.status).toBe('PAID');
      expect(cashFallback.queueNumber).toEqual(expect.any(Number) as unknown);
      expect(cashFallback.payments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ method: 'QRIS', status: 'EXPIRED' }),
          expect.objectContaining({ method: 'CASH', status: 'PAID' }),
        ]),
      );

      const latePaymentId = `py-late-${suffix}`;
      const lateExternalId = `payment.capture:${latePaymentId}`;
      webhookExternalIds.add(lateExternalId);
      await request(app.getHttpServer())
        .post('/webhooks/xendit')
        .set('x-callback-token', webhookToken)
        .send({
          event: 'payment.capture',
          data: {
            payment_id: latePaymentId,
            reference_id: cashierQris.referenceId,
            request_amount: 10000,
            currency: 'IDR',
          },
        })
        .expect(200);

      const afterLateCapture = await prisma.order.findUnique({
        where: { id: cashierOrder.id },
      });
      expect(afterLateCapture).toMatchObject({
        status: 'PAID',
        queueNumber: cashFallback.queueNumber,
      });
      expect(
        await prisma.payment.count({
          where: { orderId: cashierOrder.id, status: 'PAID' },
        }),
      ).toBe(1);
    } finally {
      simulateSpy.mockRestore();
      gatewaySpy.mockRestore();
      const ids = [...orderIds];
      if (ids.length > 0) {
        await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
        await prisma.order.deleteMany({ where: { id: { in: ids } } });
        await prisma.auditLog.deleteMany({
          where: { entityType: 'order', entityId: { in: ids } },
        });
      }
      if (webhookExternalIds.size > 0) {
        await prisma.webhookEvent.deleteMany({
          where: { externalId: { in: [...webhookExternalIds] } },
        });
      }
      if (tableId) {
        await prisma.tableSession.deleteMany({ where: { tableId } });
        await prisma.diningTable.deleteMany({ where: { id: tableId } });
      }
    }
  });

  it('/auth/logout returns success', async () => {
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('throttles repeated login attempts', async () => {
    let lastStatus = 0;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@rembuk.local', password: 'Wrong123!' });
      lastStatus = response.status;

      if (lastStatus === 429) {
        break;
      }
    }

    expect(lastStatus).toBe(429);
  });

  it('/admin/tax-rules lists both order types', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/tax-rules')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = asBody<
      Array<{ orderType: string; isEnabled: boolean; rateBp: number }>
    >(response.body);
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ orderType: 'DINE_IN' }),
        expect.objectContaining({ orderType: 'TAKEAWAY' }),
      ]),
    );
  });

  it('/admin/tax-rules updates and writes an audit log', async () => {
    const listResponse = await request(app.getHttpServer())
      .get('/admin/tax-rules')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const rules = asBody<
      Array<{ orderType: string; isEnabled: boolean; rateBp: number }>
    >(listResponse.body);
    const current = rules.find((rule) => rule.orderType === 'DINE_IN');
    if (!current) {
      throw new Error('DINE_IN tax rule is missing');
    }

    const auditBefore = await prisma.auditLog.count({
      where: { entityType: 'tax_rule' },
    });

    const updateResponse = await request(app.getHttpServer())
      .patch('/admin/tax-rules/DINE_IN')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        isEnabled: current.isEnabled,
        rateBp: current.rateBp === 1000 ? 1100 : 1000,
      })
      .expect(200);
    const updated = asBody<{ rateBp: number }>(updateResponse.body);

    expect(updated.rateBp).toBe(current.rateBp === 1000 ? 1100 : 1000);
    expect(
      await prisma.auditLog.count({
        where: { entityType: 'tax_rule' },
      }),
    ).toBe(auditBefore + 1);

    await request(app.getHttpServer())
      .patch('/admin/tax-rules/DINE_IN')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        isEnabled: current.isEnabled,
        rateBp: current.rateBp,
      })
      .expect(200);
  });

  it('keeps tax snapshots stable and serves admin reports', async () => {
    const suffix = Date.now();
    const tableCode = `RPT${suffix.toString().slice(-8)}`;
    const outlet = await prisma.outlet.findUnique({
      where: { slug: 'rembuk' },
    });
    if (!outlet) {
      throw new Error('Outlet seed tidak ditemukan');
    }
    const menuItem = await prisma.menuItem.findFirst({
      where: { outletId: outlet.id, name: 'Air Mineral', isActive: true },
    });
    if (!menuItem) {
      throw new Error('Menu seed Air Mineral tidak ditemukan');
    }

    const rule = await prisma.taxRule.findUnique({
      where: {
        outletId_orderType: {
          outletId: outlet.id,
          orderType: 'DINE_IN',
        },
      },
    });
    if (!rule) {
      throw new Error('Tax rule DINE_IN tidak ditemukan');
    }

    let tableId = '';
    let orderId = '';
    try {
      const tableResponse = await request(app.getHttpServer())
        .post('/admin/tables')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code: tableCode, name: 'Meja Report E2E', zone: 'Test' })
        .expect(201);
      tableId = asBody<{ id: string }>(tableResponse.body).id;

      const orderResponse = await request(app.getHttpServer())
        .post('/public/orders')
        .send({ tableCode, items: [{ menuItemId: menuItem.id, qty: 2 }] })
        .expect(201);
      const order = asBody<{
        id: string;
        taxAmount: number;
        total: number;
        taxRateBp: number;
      }>(orderResponse.body);
      orderId = order.id;

      const changedRate = rule.rateBp === 1000 ? 1200 : 1000;
      await request(app.getHttpServer())
        .patch('/admin/tax-rules/DINE_IN')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ isEnabled: rule.isEnabled, rateBp: changedRate })
        .expect(200);

      const stored = await prisma.order.findUnique({
        where: { id: orderId },
      });
      expect(stored).toMatchObject({
        taxAmount: order.taxAmount,
        total: order.total,
        taxRateBp: order.taxRateBp,
      });

      for (const report of [
        'daily',
        'payments',
        'items',
        'tax',
        'cancellations',
      ]) {
        await request(app.getHttpServer())
          .get(`/admin/reports/${report}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
      }

      const dailyResponse = await request(app.getHttpServer())
        .get('/admin/reports/daily')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(dailyResponse.body).toMatchObject({
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as unknown,
        orderTypes: [
          expect.objectContaining({ orderType: 'DINE_IN' }),
          expect.objectContaining({ orderType: 'TAKEAWAY' }),
        ],
      });

      await request(app.getHttpServer())
        .get('/admin/reports/daily')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ date: '2026-02-31' })
        .expect(400);

      await request(app.getHttpServer())
        .get('/admin/reports/export')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ type: 'unknown' })
        .expect(400);

      const csvResponse = await request(app.getHttpServer())
        .get('/admin/reports/export')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ type: 'daily' })
        .expect(200)
        .expect('Content-Type', /text\/csv/);
      expect(csvResponse.text.split('\r\n')[0]).toBe(
        'order_type,order_count,subtotal,tax,service,discount,revenue',
      );
    } finally {
      if (orderId) {
        await prisma.payment.deleteMany({ where: { orderId } });
        await prisma.order.deleteMany({ where: { id: orderId } });
        await prisma.auditLog.deleteMany({
          where: { entityType: 'order', entityId: orderId },
        });
      }
      await request(app.getHttpServer())
        .patch('/admin/tax-rules/DINE_IN')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ isEnabled: rule.isEnabled, rateBp: rule.rateBp })
        .expect(200);
      if (tableId) {
        await prisma.tableSession.deleteMany({ where: { tableId } });
        await prisma.diningTable.deleteMany({ where: { id: tableId } });
      }
    }
  });

  it('throttles repeated public display requests', async () => {
    let lastStatus = 0;

    for (let attempt = 0; attempt < 130; attempt += 1) {
      const response = await request(app.getHttpServer()).get(
        '/public/display/queue',
      );
      lastStatus = response.status;
      if (lastStatus === 429) {
        break;
      }
    }

    expect(lastStatus).toBe(429);
  });
});
