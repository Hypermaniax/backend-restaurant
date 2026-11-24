import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CreateQrisInput,
  PaymentGateway,
  QrisPaymentResult,
  SimulateQrisInput,
} from './payment.types';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

interface XenditPaymentRequestResponse {
  payment_request_id?: string;
  id?: string;
  status?: string;
  actions?: Array<{
    type?: string;
    descriptor?: string;
    value?: string;
  }>;
  channel_properties?: {
    expires_at?: string;
  };
}

@Injectable()
export class XenditPaymentProvider implements PaymentGateway {
  private readonly logger = new Logger(XenditPaymentProvider.name);
  private readonly secretKey: string;

  constructor(config: ConfigService) {
    this.secretKey = config.getOrThrow<string>('XENDIT_SECRET_KEY');
  }

  async createQris(input: CreateQrisInput): Promise<QrisPaymentResult> {
    const response = await fetch('https://api.xendit.co/v3/payment_requests', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        'api-version': '2024-11-11',
      },
      body: JSON.stringify({
        reference_id: input.referenceId,
        type: 'PAY',
        country: 'ID',
        currency: 'IDR',
        request_amount: input.amount,
        channel_code: 'QRIS',
        channel_properties: {
          expires_at: input.expiresAt.toISOString(),
        },
        description: `Order ${input.orderNumber}`,
        metadata: {
          order_id: input.orderId,
          order_number: input.orderNumber,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      this.logger.error(
        `Xendit create QRIS failed with HTTP ${response.status}`,
      );
      throw new BadGatewayException('Gagal membuat QRIS Xendit');
    }

    const body = (await response
      .json()
      .catch(() => null)) as XenditPaymentRequestResponse | null;
    if (!body) {
      throw new BadGatewayException('Respons QRIS Xendit tidak valid');
    }

    const qrString = body.actions?.find(
      (action) =>
        action.type === 'PRESENT_TO_CUSTOMER' &&
        action.descriptor === 'QR_STRING',
    )?.value;
    if (!qrString) {
      throw new BadGatewayException('QR string Xendit tidak ditemukan');
    }

    return {
      providerPaymentId: body.payment_request_id ?? body.id ?? null,
      qrString,
      expiresAt:
        this.parseDate(body.channel_properties?.expires_at) ?? input.expiresAt,
      raw: body as Record<string, unknown>,
    };
  }

  async simulateQris(input: SimulateQrisInput): Promise<void> {
    const response = await fetch(
      `https://api.xendit.co/v3/payment_requests/${encodeURIComponent(input.paymentRequestId)}/simulate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
          'Content-Type': 'application/json',
          'api-version': '2024-11-11',
        },
        body: JSON.stringify({ amount: input.amount }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      this.logger.error(
        `Xendit simulate payment failed with HTTP ${response.status}`,
      );
      throw new BadGatewayException('Gagal memicu simulasi pembayaran Xendit');
    }
  }

  private parseDate(value: string | undefined): Date | null {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
