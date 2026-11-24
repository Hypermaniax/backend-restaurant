import { OrderType } from '../../generated/prisma/client';
import { ReportCsvService } from './report-csv.service';
import { ReportType } from './report.types';
import type { ReportsService } from './reports.service';

function buildService() {
  const reports = {
    daily: jest.fn(),
    payments: jest.fn(),
    items: jest.fn(),
    tax: jest.fn(),
    cancellations: jest.fn(),
  };
  const service = new ReportCsvService(reports as unknown as ReportsService);
  return { service, reports };
}

describe('ReportCsvService', () => {
  it('exports CSV and escapes formula-like cells', async () => {
    const { service, reports } = buildService();
    reports.cancellations.mockResolvedValue({
      date: '2026-11-22',
      count: 1,
      totalAmount: 10000,
      rows: [
        {
          orderNumber: '20261122-0002',
          orderType: OrderType.TAKEAWAY,
          total: 10000,
          reason: '=HYPERLINK("x")',
          cancelledAt: new Date('2026-11-22T02:00:00.000Z'),
          cancelledByUserId: 'user-1',
        },
      ],
    });

    const file = await service.exportCsv(
      'outlet-1',
      ReportType.CANCELLATIONS,
      '2026-11-22',
    );

    expect(file.filename).toBe('report-cancellations-2026-11-22.csv');
    expect(file.content).toContain(`'=HYPERLINK(""x"")`);
  });
});
