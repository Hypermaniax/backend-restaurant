import type { ConfigService } from '@nestjs/config';
import { TableQrService } from './table-qr.service';

describe('TableQrService', () => {
  it('builds the public QR URL from QR_BASE_URL and table code', () => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('http://localhost:5173/'),
    };
    const service = new TableQrService(config as unknown as ConfigService);

    expect(service.buildTableUrl('T01')).toBe('http://localhost:5173/t/T01');
  });
});
