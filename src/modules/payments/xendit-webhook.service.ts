import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PaymentRepository } from './payment.repository';
import type { XenditWebhookPayload } from './payment.types';
import { XenditEventProcessorService } from './xendit-event-processor.service';

@Injectable()
export class XenditWebhookService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly config: ConfigService,
    private readonly processor: XenditEventProcessorService,
  ) {}

  async handleXenditWebhook(
    callbackToken: string | undefined,
    body: unknown,
  ): Promise<{ received: true }> {
    this.verifyCallbackToken(callbackToken);

    const payload = this.asRecord(body);
    const event = typeof payload?.event === 'string' ? payload.event : null;
    const data = this.asRecord(payload?.data) as
      XenditWebhookPayload['data'] | null;
    if (!event || !data) {
      throw new BadRequestException('Payload webhook tidak valid');
    }

    const externalReference = data.payment_id ?? data.payment_request_id;
    if (!externalReference) {
      throw new BadRequestException('ID pembayaran webhook tidak valid');
    }
    const externalId = `${event}:${externalReference}`;
    const referenceId =
      typeof data.reference_id === 'string' ? data.reference_id : null;

    let webhookEvent = await this.payments.findWebhookEvent(
      'XENDIT',
      externalId,
    );
    if (
      webhookEvent?.status === 'PROCESSED' ||
      webhookEvent?.status === 'FAILED'
    ) {
      return { received: true };
    }

    if (!webhookEvent) {
      try {
        webhookEvent = await this.payments.createWebhookEvent({
          provider: 'XENDIT',
          externalId,
          eventType: event,
          payload: this.toJson(payload),
        });
      } catch (error) {
        if (!this.isUniqueError(error)) {
          throw error;
        }
        webhookEvent = await this.payments.findWebhookEvent(
          'XENDIT',
          externalId,
        );
        if (!webhookEvent) {
          throw new InternalServerErrorException('Gagal menyimpan webhook');
        }
        if (
          webhookEvent.status === 'PROCESSED' ||
          webhookEvent.status === 'FAILED'
        ) {
          return { received: true };
        }
      }
    }

    try {
      const processed = await this.processor.processEvent(
        event,
        data,
        referenceId,
        data.payment_request_id ?? null,
      );
      await this.payments.updateWebhookEvent(webhookEvent.id, {
        status: processed ? 'PROCESSED' : 'FAILED',
        processedAt: new Date(),
      });
      return { received: true };
    } catch {
      throw new InternalServerErrorException('Gagal memproses webhook Xendit');
    }
  }

  private verifyCallbackToken(token: string | undefined) {
    const expected = this.config.getOrThrow<string>('XENDIT_WEBHOOK_TOKEN');
    if (!token) {
      throw new UnauthorizedException('Webhook token tidak valid');
    }

    const actualBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Webhook token tidak valid');
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private isUniqueError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
