import { Injectable } from '@nestjs/common';
import type { ReceiptSettingsView } from '../settings/settings.types';
import type { OrderRecord } from './order.repository';

@Injectable()
export class OrderReceiptPdfService {
  async build(
    order: OrderRecord,
    settings: ReceiptSettingsView,
  ): Promise<Buffer> {
    const { default: PDFDocument } = await import('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc.font('Helvetica-Bold').fontSize(18).text(settings.outletName);
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(10).text('Struk pembayaran');
    doc.moveDown(1);

    doc.font('Helvetica-Bold').fontSize(12);
    doc.text(order.orderNumber);
    doc.font('Helvetica').fontSize(10);
    if (order.table) {
      doc.text(`Meja ${order.table.code} · ${order.table.name}`);
    }
    doc.text(`Waktu ${this.dateTime(order.paidAt ?? order.createdAt)}`);
    doc.moveDown(0.75);

    for (const item of order.items) {
      doc.font('Helvetica-Bold').text(`${item.qty}x ${item.nameSnapshot}`);
      doc
        .font('Helvetica')
        .text(`${this.money(item.lineTotal)}`, { align: 'right' });
      if (item.notes) {
        doc.fontSize(9).fillColor('#555555').text(item.notes);
        doc.fillColor('#000000').fontSize(10);
      }
      doc.moveDown(0.35);
    }

    doc.moveDown(0.4);
    doc.font('Helvetica').text(`Subtotal  ${this.money(order.subtotal)}`, {
      align: 'right',
    });
    if (order.serviceAmount > 0) {
      doc.text(`Service  ${this.money(order.serviceAmount)}`, {
        align: 'right',
      });
    }
    doc.text(`Pajak  ${this.money(order.taxAmount)}`, { align: 'right' });
    doc.moveDown(0.35);
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(`Total  ${this.money(order.total)}`, { align: 'right' });
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(10);
    doc.text(`Pembayaran ${order.paymentStatus}`);
    if (settings.receiptFooter) {
      doc.moveDown(1.5);
      doc
        .fillColor('#555555')
        .text(settings.receiptFooter, { align: 'center' });
    }

    doc.end();
    return done;
  }

  private money(amount: number): string {
    return `Rp ${amount.toLocaleString('id-ID')}`;
  }

  private dateTime(value: Date): string {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Jakarta',
    }).format(value);
  }
}
