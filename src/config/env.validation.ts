const required = [
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'JWT_REFRESH_SECRET',
  'JWT_REFRESH_EXPIRES_IN',
  'CORS_ORIGINS',
  'PUBLIC_WEB_URL',
  'QR_BASE_URL',
  'TZ',
  'XENDIT_SECRET_KEY',
  'XENDIT_WEBHOOK_TOKEN',
  'XENDIT_IS_PRODUCTION',
] as const;

const allowedNodeEnv = new Set([
  'development',
  'test',
  'staging',
  'production',
]);

export function validateEnv(config: Record<string, unknown>) {
  const missing = required.filter((key) => {
    const value = config[key];
    return typeof value !== 'string' || value.trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  const nodeEnv = String(config.NODE_ENV);
  if (!allowedNodeEnv.has(nodeEnv)) {
    throw new Error(
      `NODE_ENV must be one of: ${[...allowedNodeEnv].join(', ')}`,
    );
  }

  const port = Number(config.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const jwtSecret = String(config.JWT_SECRET);
  const jwtRefreshSecret = String(config.JWT_REFRESH_SECRET);
  if (jwtSecret.length < 32 || jwtRefreshSecret.length < 32) {
    throw new Error(
      'JWT_SECRET and JWT_REFRESH_SECRET must be at least 32 characters',
    );
  }

  const isProduction = String(config.XENDIT_IS_PRODUCTION);
  if (isProduction !== 'true' && isProduction !== 'false') {
    throw new Error('XENDIT_IS_PRODUCTION must be "true" or "false"');
  }

  return {
    ...config,
    PORT: port,
  };
}
