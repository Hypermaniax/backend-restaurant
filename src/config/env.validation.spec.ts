import { validateEnv } from './env.validation';

const validEnv = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/resto',
  JWT_SECRET: 'a'.repeat(32),
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  JWT_REFRESH_EXPIRES_IN: '7d',
  CORS_ORIGINS: 'http://localhost:5173',
  PUBLIC_WEB_URL: 'http://localhost:5173',
  QR_BASE_URL: 'http://localhost:5173',
  TZ: 'Asia/Jakarta',
  XENDIT_SECRET_KEY: 'xnd_development_test',
  XENDIT_WEBHOOK_TOKEN: 'webhook-test',
  XENDIT_IS_PRODUCTION: 'false',
};

describe('validateEnv', () => {
  it('returns validated config and converts PORT to number', () => {
    const result = validateEnv(validEnv);

    expect(result.PORT).toBe(3000);
    expect(result.DATABASE_URL).toBe(validEnv.DATABASE_URL);
  });

  it('throws when a required variable is missing', () => {
    const incomplete: Record<string, unknown> = { ...validEnv };
    delete incomplete.DATABASE_URL;

    expect(() => validateEnv(incomplete)).toThrow(
      'Missing required environment variables: DATABASE_URL',
    );
  });

  it('throws when JWT secrets are too short', () => {
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: 'short' })).toThrow(
      'JWT_SECRET and JWT_REFRESH_SECRET must be at least 32 characters',
    );
  });

  it('throws when PORT is invalid', () => {
    expect(() => validateEnv({ ...validEnv, PORT: 'abc' })).toThrow(
      'PORT must be an integer between 1 and 65535',
    );
  });

  it('throws when XENDIT_IS_PRODUCTION is not boolean text', () => {
    expect(() =>
      validateEnv({ ...validEnv, XENDIT_IS_PRODUCTION: 'yes' }),
    ).toThrow('XENDIT_IS_PRODUCTION must be "true" or "false"');
  });
});
