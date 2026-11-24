import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import {
  CounterType,
  OrderType,
  PrismaClient,
  SelectionType,
  TableStatus,
  UserRole,
} from '../src/generated/prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    options: '-c timezone=UTC',
  }),
});

function jakartaDate(now = new Date()) {
  const value = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  return new Date(`${value}T00:00:00.000Z`);
}

async function main() {
  const outlet = await prisma.outlet.upsert({
    where: { slug: 'rembuk' },
    update: { name: 'Rembuk' },
    create: {
      name: 'Rembuk',
      slug: 'rembuk',
      timezone: 'Asia/Jakarta',
    },
  });

  await prisma.settings.upsert({
    where: { outletId: outlet.id },
    update: {},
    create: {
      outletId: outlet.id,
      taxInclusive: false,
      taxBaseIncludesService: true,
      serviceRateBp: 500,
      requirePaymentBeforeKitchen: true,
      orderExpiryMinutes: 15,
      cashExpiryMinutes: 30,
      receiptFooter: 'Terima kasih sudah makan di Rembuk.',
    },
  });

  await prisma.taxRule.upsert({
    where: {
      outletId_orderType: {
        outletId: outlet.id,
        orderType: OrderType.DINE_IN,
      },
    },
    update: {},
    create: {
      outletId: outlet.id,
      orderType: OrderType.DINE_IN,
      isEnabled: true,
      rateBp: 1000,
    },
  });

  await prisma.taxRule.upsert({
    where: {
      outletId_orderType: {
        outletId: outlet.id,
        orderType: OrderType.TAKEAWAY,
      },
    },
    update: {},
    create: {
      outletId: outlet.id,
      orderType: OrderType.TAKEAWAY,
      isEnabled: false,
      rateBp: 0,
    },
  });

  const businessDate = jakartaDate();
  for (const counterType of [CounterType.ORDER, CounterType.QUEUE]) {
    await prisma.dailyCounter.upsert({
      where: {
        outletId_counterDate_counterType: {
          outletId: outlet.id,
          counterDate: businessDate,
          counterType,
        },
      },
      update: {},
      create: {
        outletId: outlet.id,
        counterDate: businessDate,
        counterType,
        lastNumber: 0,
      },
    });
  }

  const seedUsers = [
    {
      name: 'Admin Rembuk',
      email: (process.env.SEED_ADMIN_EMAIL ?? 'admin@rembuk.local').toLowerCase(),
      password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!',
      role: UserRole.ADMIN,
    },
    {
      name: 'Kasir Rembuk',
      email: (process.env.SEED_CASHIER_EMAIL ?? 'kasir@rembuk.local').toLowerCase(),
      password: process.env.SEED_CASHIER_PASSWORD ?? 'Kasir123!',
      role: UserRole.CASHIER,
    },
    {
      name: 'Dapur Rembuk',
      email: (process.env.SEED_KITCHEN_EMAIL ?? 'dapur@rembuk.local').toLowerCase(),
      password: process.env.SEED_KITCHEN_PASSWORD ?? 'Kitchen123!',
      role: UserRole.KITCHEN,
    },
  ];

  for (const user of seedUsers) {
    const passwordHash = await bcrypt.hash(user.password, 12);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, isActive: true },
      create: {
        outletId: outlet.id,
        name: user.name,
        email: user.email,
        passwordHash,
        role: user.role,
      },
    });
  }

  const tables = [
    { code: 'T01', name: 'Meja 01', zone: 'Indoor' },
    { code: 'T02', name: 'Meja 02', zone: 'Indoor' },
    { code: 'T03', name: 'Meja 03', zone: 'Indoor' },
    { code: 'T04', name: 'Meja 04', zone: 'Outdoor' },
    { code: 'T05', name: 'Meja 05', zone: 'Outdoor' },
    { code: 'T06', name: 'Meja 06', zone: 'Outdoor' },
    { code: 'VIP1', name: 'VIP 1', zone: 'VIP' },
    { code: 'VIP2', name: 'VIP 2', zone: 'VIP' },
  ];

  for (const table of tables) {
    await prisma.diningTable.upsert({
      where: {
        outletId_code: { outletId: outlet.id, code: table.code },
      },
      update: {
        name: table.name,
        zone: table.zone,
        isActive: true,
      },
      create: {
        outletId: outlet.id,
        code: table.code,
        name: table.name,
        zone: table.zone,
        status: TableStatus.AVAILABLE,
      },
    });
  }

  const categories = new Map<string, string>();
  for (const [index, name] of ['Makanan', 'Minuman', 'Camilan'].entries()) {
    const existing = await prisma.category.findFirst({
      where: { outletId: outlet.id, name },
    });
    const category = existing
      ? await prisma.category.update({
          where: { id: existing.id },
          data: { sortOrder: index + 1, isActive: true },
        })
      : await prisma.category.create({
          data: {
            outletId: outlet.id,
            name,
            sortOrder: index + 1,
          },
        });

    categories.set(name, category.id);
  }

  const menuItems = [
    {
      category: 'Makanan',
      name: 'Nasi Goreng Rembuk',
      description: 'Nasi goreng kampung, telur mata sapi, dan acar.',
      price: 28000,
      sortOrder: 1,
    },
    {
      category: 'Makanan',
      name: 'Mie Goreng Rembuk',
      description: 'Mie goreng dengan sayur, telur, dan ayam suwir.',
      price: 26000,
      sortOrder: 2,
    },
    {
      category: 'Makanan',
      name: 'Ayam Bakar Rembuk',
      description: 'Ayam bakar bumbu rempah dengan sambal dan lalapan.',
      price: 35000,
      sortOrder: 3,
    },
    {
      category: 'Minuman',
      name: 'Es Teh Manis',
      description: 'Teh manis dingin.',
      price: 8000,
      sortOrder: 1,
    },
    {
      category: 'Minuman',
      name: 'Kopi Susu Rembuk',
      description: 'Kopi susu gula aren, disajikan dingin.',
      price: 18000,
      sortOrder: 2,
    },
    {
      category: 'Minuman',
      name: 'Air Mineral',
      description: 'Botol 600 ml.',
      price: 5000,
      sortOrder: 3,
    },
    {
      category: 'Camilan',
      name: 'Kerupuk',
      description: 'Kerupuk udang.',
      price: 5000,
      sortOrder: 1,
    },
    {
      category: 'Camilan',
      name: 'Pisang Goreng',
      description: 'Pisang goreng hangat, porsi 4 buah.',
      price: 15000,
      sortOrder: 2,
    },
  ];

  const menuItemsByName = new Map<string, string>();
  for (const item of menuItems) {
    const categoryId = categories.get(item.category);
    if (!categoryId) {
      throw new Error(`Kategori seed tidak ditemukan: ${item.category}`);
    }

    const existing = await prisma.menuItem.findFirst({
      where: { outletId: outlet.id, name: item.name },
    });
    const menuItem = existing
      ? await prisma.menuItem.update({
          where: { id: existing.id },
          data: {
            categoryId,
            description: item.description,
            price: item.price,
            sortOrder: item.sortOrder,
            isActive: true,
          },
        })
      : await prisma.menuItem.create({
          data: {
            outletId: outlet.id,
            categoryId,
            name: item.name,
            description: item.description,
            price: item.price,
            sortOrder: item.sortOrder,
          },
        });

    menuItemsByName.set(item.name, menuItem.id);
  }

  const groups = [
    {
      name: 'Level Pedas',
      selectionType: SelectionType.SINGLE,
      minSelect: 1,
      maxSelect: 1,
      isRequired: true,
      sortOrder: 1,
      options: [
        { name: 'Tidak Pedas', priceDelta: 0, isDefault: true },
        { name: 'Sedang', priceDelta: 0, isDefault: false },
        { name: 'Pedas', priceDelta: 0, isDefault: false },
      ],
    },
    {
      name: 'Tambahan',
      selectionType: SelectionType.MULTIPLE,
      minSelect: 0,
      maxSelect: 3,
      isRequired: false,
      sortOrder: 2,
      options: [
        { name: 'Telur', priceDelta: 5000, isDefault: false },
        { name: 'Keju', priceDelta: 7000, isDefault: false },
        { name: 'Nasi Tambah', priceDelta: 8000, isDefault: false },
      ],
    },
  ];

  const groupsByName = new Map<string, string>();
  for (const group of groups) {
    const existing = await prisma.modifierGroup.findFirst({
      where: { outletId: outlet.id, name: group.name },
    });
    const saved = existing
      ? await prisma.modifierGroup.update({
          where: { id: existing.id },
          data: {
            selectionType: group.selectionType,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            isRequired: group.isRequired,
            sortOrder: group.sortOrder,
            isActive: true,
          },
        })
      : await prisma.modifierGroup.create({
          data: {
            outletId: outlet.id,
            name: group.name,
            selectionType: group.selectionType,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            isRequired: group.isRequired,
            sortOrder: group.sortOrder,
          },
        });

    groupsByName.set(group.name, saved.id);

    for (const [index, option] of group.options.entries()) {
      const existingOption = await prisma.modifierOption.findFirst({
        where: { groupId: saved.id, name: option.name },
      });
      if (existingOption) {
        await prisma.modifierOption.update({
          where: { id: existingOption.id },
          data: {
            priceDelta: option.priceDelta,
            isDefault: option.isDefault,
            isActive: true,
            sortOrder: index + 1,
          },
        });
      } else {
        await prisma.modifierOption.create({
          data: {
            groupId: saved.id,
            name: option.name,
            priceDelta: option.priceDelta,
            isDefault: option.isDefault,
            sortOrder: index + 1,
          },
        });
      }
    }
  }

  const assignments: Array<[string, string]> = [
    ['Nasi Goreng Rembuk', 'Level Pedas'],
    ['Nasi Goreng Rembuk', 'Tambahan'],
    ['Mie Goreng Rembuk', 'Level Pedas'],
    ['Mie Goreng Rembuk', 'Tambahan'],
    ['Ayam Bakar Rembuk', 'Tambahan'],
  ];

  for (const [menuItemName, groupName] of assignments) {
    const menuItemId = menuItemsByName.get(menuItemName);
    const groupId = groupsByName.get(groupName);
    if (!menuItemId || !groupId) {
      throw new Error(`Assignment seed tidak ditemukan: ${menuItemName}`);
    }

    await prisma.menuItemModifierGroup.upsert({
      where: { menuItemId_groupId: { menuItemId, groupId } },
      update: {},
      create: { menuItemId, groupId },
    });
  }

  console.log(
    'Seed selesai: outlet Rembuk, settings, tax rules, counters, staff, meja, kategori, menu, modifier.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
