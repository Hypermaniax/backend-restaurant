import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import QRCode from 'qrcode';

interface TableQrCard {
  code: string;
  name: string;
}

@Injectable()
export class TableQrService {
  constructor(private readonly config: ConfigService) {}

  buildTableUrl(code: string): string {
    const base = this.config
      .getOrThrow<string>('QR_BASE_URL')
      .replace(/\/+$/, '');
    return `${base}/t/${encodeURIComponent(code)}`;
  }

  async createPng(code: string): Promise<Buffer> {
    return QRCode.toBuffer(this.buildTableUrl(code), {
      type: 'png',
      errorCorrectionLevel: 'H',
      margin: 4,
      width: 600,
    });
  }

  async createPdf(tables: TableQrCard[]): Promise<Buffer> {
    const { default: PDFDocument } = await import('pdfkit');
    const doc = new PDFDocument({
      size: 'A4',
      margin: 36,
      info: {
        Title: 'Kartu QR Meja Rembuk',
        Author: 'Rembuk',
      },
    });

    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const margin = 36;
    const gap = 14;
    const columns = 2;
    const rows = 3;
    const cardWidth = (doc.page.width - margin * 2 - gap) / columns;
    const cardHeight = (doc.page.height - margin * 2 - gap * (rows - 1)) / rows;

    for (const [index, table] of tables.entries()) {
      if (index > 0 && index % (columns * rows) === 0) {
        doc.addPage();
      }

      const slot = index % (columns * rows);
      const column = slot % columns;
      const row = Math.floor(slot / columns);
      const x = margin + column * (cardWidth + gap);
      const y = margin + row * (cardHeight + gap);

      const qr = await QRCode.toBuffer(this.buildTableUrl(table.code), {
        type: 'png',
        errorCorrectionLevel: 'H',
        margin: 4,
        width: 420,
      });

      this.drawCard(doc, table, qr, x, y, cardWidth, cardHeight);
    }

    doc.end();
    return done;
  }

  private drawCard(
    doc: PDFKit.PDFDocument,
    table: TableQrCard,
    qr: Buffer,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    doc
      .roundedRect(x, y, width, height, 10)
      .lineWidth(1)
      .strokeColor('#DCE8DF')
      .stroke();

    doc.circle(x + 26, y + 27, 12).fill('#143C35');
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#F2A93B')
      .text('R', x + 22, y + 20, { width: 10, align: 'center' });
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor('#143C35')
      .text('Rembuk', x + 44, y + 18, { width: width - 58 });
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#6B7772')
      .text('Makan, tanpa ribet.', x + 44, y + 36, { width: width - 58 });

    const qrSize = Math.min(132, width - 56);
    const qrX = x + (width - qrSize) / 2;
    const qrY = y + 54;
    doc.image(qr, qrX, qrY, { width: qrSize, height: qrSize });

    let textY = qrY + qrSize + 8;
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#143C35')
      .text(table.name, x + 12, textY, {
        width: width - 24,
        align: 'center',
      });

    textY += 16;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#D94A2B')
      .text(table.code, x + 12, textY, {
        width: width - 24,
        align: 'center',
      });

    textY += 15;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#4A5752')
      .text('Scan untuk lihat menu & pesan', x + 12, textY, {
        width: width - 24,
        align: 'center',
      });

    textY += 12;
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor('#6B7772')
      .text(this.buildTableUrl(table.code), x + 12, textY, {
        width: width - 24,
        align: 'center',
      });
  }
}
