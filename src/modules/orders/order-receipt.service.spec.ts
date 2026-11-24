import type { EmailService } from '../email/email.service';
import type { SettingsService } from '../settings/settings.service';
import { OrderReceiptPdfService } from './order-receipt-pdf.service';
import { OrderReceiptService } from './order-receipt.service';
import type { OrderRecord, OrderRepository } from './order.repository';

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'order-1',
    outletId: 'outlet-1',
    customerEmail: 'tamu@example.com',
    receiptEmailSentAt: null,
    orderNumber: '20261125-0001',
    customerName: 'Tamu',
    total: 25000,
    items: [],
    ...overrides,
  } as OrderRecord;
}

function buildService() {
  const orders = {
    findById: jest.fn(),
    markReceiptEmailSent: jest.fn(),
  };
  const settings = { getReceiptSettings: jest.fn() };
  const pdf = { build: jest.fn().mockResolvedValue(Buffer.from('pdf')) };
  const email = { send: jest.fn().mockResolvedValue(true) };
  const service = new OrderReceiptService(
    orders as unknown as OrderRepository,
    settings as unknown as SettingsService,
    pdf as unknown as OrderReceiptPdfService,
    email as unknown as EmailService,
  );
  return { service, orders, settings, pdf, email };
}

describe('OrderReceiptService', () => {
  it('skips orders without email or already sent receipt', async () => {
    const { service, orders, email } = buildService();
    orders.findById.mockResolvedValue(order({ customerEmail: null }));

    await service.sendForOrder('outlet-1', 'order-1');

    expect(email.send).not.toHaveBeenCalled();
  });

  it('sends a PDF and records the delivery timestamp', async () => {
    const { service, orders, settings, email } = buildService();
    orders.findById.mockResolvedValue(order());
    settings.getReceiptSettings.mockResolvedValue({
      outletName: 'Rembuk',
      taxInclusive: false,
      receiptFooter: 'Terima kasih',
    });

    await service.sendForOrder('outlet-1', 'order-1');

    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'tamu@example.com',
        attachments: [
          expect.objectContaining({
            filename: 'struk-20261125-0001.pdf',
            contentType: 'application/pdf',
          }),
        ],
      }),
    );
    expect(orders.markReceiptEmailSent).toHaveBeenCalledWith(
      'outlet-1',
      'order-1',
    );
  });
});
