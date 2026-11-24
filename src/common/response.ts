export const MESSAGES = {
  auth: {
    login: 'Login berhasil',
    refresh: 'Sesi berhasil diperbarui',
    logout: 'Logout berhasil',
  },
  orders: {
    created: 'Order berhasil dibuat',
    cancelled: 'Order berhasil dibatalkan',
    paymentConfirmed: 'Pembayaran berhasil dikonfirmasi',
  },
  payments: {
    qrisReady: 'QRIS siap digunakan',
    simulationSent: 'Simulasi pembayaran dikirim ke Xendit',
  },
  kds: {
    statusUpdated: 'Status order berhasil diperbarui',
  },
  catalog: {
    categoryCreated: 'Kategori berhasil dibuat',
    categoryUpdated: 'Kategori berhasil diperbarui',
    categoryDeactivated: 'Kategori berhasil dinonaktifkan',
    modifierGroupCreated: 'Grup modifier berhasil dibuat',
    modifierGroupUpdated: 'Grup modifier berhasil diperbarui',
    modifierGroupDeactivated: 'Grup modifier berhasil dinonaktifkan',
    modifierOptionCreated: 'Opsi modifier berhasil dibuat',
    modifierOptionUpdated: 'Opsi modifier berhasil diperbarui',
    modifierOptionDeactivated: 'Opsi modifier berhasil dinonaktifkan',
    menuCreated: 'Menu berhasil dibuat',
    menuUpdated: 'Menu berhasil diperbarui',
    menuImageUploaded: 'Gambar menu berhasil diunggah',
    menuDeactivated: 'Menu berhasil dinonaktifkan',
    menuAvailabilityUpdated: 'Ketersediaan menu berhasil diperbarui',
  },
  tables: {
    created: 'Meja berhasil dibuat',
    updated: 'Meja berhasil diperbarui',
    deactivated: 'Meja berhasil dinonaktifkan',
    sessionOpened: 'Sesi meja berhasil dibuka',
    sessionClosed: 'Sesi meja berhasil ditutup',
  },
  staff: {
    created: 'Staff berhasil dibuat',
    updated: 'Staff berhasil diperbarui',
    deactivated: 'Staff berhasil dinonaktifkan',
    passwordReset: 'Password berhasil direset',
  },
  settings: {
    updated: 'Settings berhasil diperbarui',
    taxRuleUpdated: 'Aturan pajak berhasil diperbarui',
  },
} as const;

export function withMessage<T extends object>(
  data: T,
  message: string,
): T & { message: string } {
  return { ...data, message };
}
