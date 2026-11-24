import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { SettingsService } from '../settings/settings.service';
import { OrderReceiptPdfService } from './order-receipt-pdf.service';
import { OrderRepository } from './order.repository';

@Injectable()
export class OrderReceiptService {
  private readonly logger = new Logger(OrderReceiptService.name);

  constructor(
    private readonly orders: OrderRepository,
    private readonly settings: SettingsService,
    private readonly pdf: OrderReceiptPdfService,
    private readonly email: EmailService,
  ) {}

  sendForOrder(outletId: string, orderId: string): Promise<void> {
    return this.deliver(outletId, orderId).catch((error: unknown) => {
      this.logger.warn(
        `Struk email order ${orderId} gagal: ${this.errorText(error)}`,
      );
    });
  }

  private async deliver(outletId: string, orderId: string): Promise<void> {
    const order = await this.orders.findById(outletId, orderId);
    if (!order || !order.customerEmail || order.receiptEmailSentAt) {
      return;
    }

    const settings = await this.settings.getReceiptSettings(outletId);
    const pdf = await this.pdf.build(order, settings);
    const sent = await this.email.send({
      to: order.customerEmail,
      subject: `Struk ${order.orderNumber} - ${settings.outletName}`,
      html: `
        <p>Halo${order.customerName ? ` ${order.customerName}` : ''},</p>
        <p>Terima kasih. Struk pesanan <strong>${order.orderNumber}</strong> terlampir.</p>
        <p>Total: <strong>Rp ${order.total.toLocaleString('id-ID')}</strong></p>
      `,
      attachments: [
        {
          filename: `struk-${order.orderNumber}.pdf`,
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    });
    if (!sent) {
      return;
    }
    await this.orders.markReceiptEmailSent(outletId, orderId);
  }

  private errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
