import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    this.from =
      this.config.get<string>('MAIL_FROM')?.trim() ?? 'no-reply@rembuk.local';

    this.transporter = host
      ? createTransport({
          host,
          port: Number.isInteger(port) ? port : 587,
          secure: this.config.get<string>('SMTP_SECURE') === 'true',
          auth: user && pass ? { user, pass } : undefined,
        })
      : null;
  }

  async send(input: SendEmailInput): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(
        `SMTP belum dikonfigurasi; email ke ${input.to} tidak dikirim.`,
      );
      return false;
    }

    await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments,
    });
    return true;
  }
}
