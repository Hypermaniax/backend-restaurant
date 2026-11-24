import type { PaymentStatus } from '../../generated/prisma/client';

export interface CreateQrisInput {
  referenceId: string;
  amount: number;
  expiresAt: Date;
  orderId: string;
  orderNumber: string;
}

export interface QrisPaymentResult {
  providerPaymentId: string | null;
  qrString: string;
  expiresAt: Date;
  raw: Record<string, unknown>;
}

export interface SimulateQrisInput {
  paymentRequestId: string;
  amount: number;
}

export interface PaymentGateway {
  createQris(input: CreateQrisInput): Promise<QrisPaymentResult>;
  simulateQris(input: SimulateQrisInput): Promise<void>;
}

export interface PayQrisView {
  paymentId: string;
  referenceId: string;
  status: PaymentStatus;
  amount: number;
  qrString: string;
  expiresAt: Date;
}

export interface PublicPaymentStatusView {
  status: string;
  queueNumber: number | null;
  queueDisplay: string | null;
}

export interface XenditWebhookPayload {
  event?: string;
  data?: {
    payment_id?: string;
    payment_request_id?: string;
    reference_id?: string;
    request_amount?: number;
    currency?: string;
    status?: string;
    captures?: Array<{ capture_timestamp?: string }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
