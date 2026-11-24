import { BadGatewayException, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { XenditPaymentProvider } from './xendit-payment.provider';

function provider() {
  const config = {
    getOrThrow: jest.fn().mockReturnValue('xnd_development_secret'),
  };
  return new XenditPaymentProvider(config as unknown as ConfigService);
}

describe('XenditPaymentProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('creates a QRIS payment and extracts the QR string', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          payment_request_id: 'pr-1',
          status: 'REQUIRES_ACTION',
          actions: [
            {
              type: 'PRESENT_TO_CUSTOMER',
              descriptor: 'QR_STRING',
              value: 'QRIS-PAYLOAD',
            },
          ],
          channel_properties: {
            expires_at: '2026-11-22T01:00:00.000Z',
          },
        }),
    } as Response);

    const result = await provider().createQris({
      referenceId: 'PAY-1',
      amount: 11550,
      expiresAt: new Date('2026-11-22T01:00:00.000Z'),
      orderId: 'order-1',
      orderNumber: '20261122-0001',
    });

    expect(result).toMatchObject({
      providerPaymentId: 'pr-1',
      qrString: 'QRIS-PAYLOAD',
      expiresAt: new Date('2026-11-22T01:00:00.000Z'),
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({
      'api-version': '2024-11-11',
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      reference_id: 'PAY-1',
      type: 'PAY',
      country: 'ID',
      currency: 'IDR',
      request_amount: 11550,
      channel_code: 'QRIS',
    });
  });

  it('simulates a QRIS payment request in test mode', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    await provider().simulateQris({
      paymentRequestId: 'pr-1',
      amount: 11550,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.xendit.co/v3/payment_requests/pr-1/simulate');
    expect(init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ amount: 11550 }),
    });
    expect(init.headers).toMatchObject({
      'api-version': '2024-11-11',
    });
  });

  it('throws when Xendit rejects the simulation', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
    } as Response);

    await expect(
      provider().simulateQris({
        paymentRequestId: 'pr-1',
        amount: 11550,
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('throws without exposing the raw provider response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'invalid key secret-value' }),
    } as Response);

    await expect(
      provider().createQris({
        referenceId: 'PAY-1',
        amount: 11550,
        expiresAt: new Date(),
        orderId: 'order-1',
        orderNumber: '20261122-0001',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
