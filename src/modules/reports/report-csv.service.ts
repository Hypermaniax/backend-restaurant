import { Injectable } from '@nestjs/common';
import type {
  CancellationReport,
  DailyReport,
  ItemReport,
  PaymentReport,
  ReportCsv,
  TaxReport,
} from './report.types';
import { ReportType } from './report.types';
import { ReportsService } from './reports.service';

@Injectable()
export class ReportCsvService {
  constructor(private readonly reports: ReportsService) {}

  async exportCsv(
    outletId: string,
    type: ReportType,
    date?: string,
  ): Promise<ReportCsv> {
    switch (type) {
      case ReportType.DAILY:
        return this.dailyCsv(await this.reports.daily(outletId, date));
      case ReportType.PAYMENTS:
        return this.paymentsCsv(await this.reports.payments(outletId, date));
      case ReportType.ITEMS:
        return this.itemsCsv(await this.reports.items(outletId, 200, date));
      case ReportType.TAX:
        return this.taxCsv(await this.reports.tax(outletId, date));
      case ReportType.CANCELLATIONS:
        return this.cancellationsCsv(
          await this.reports.cancellations(outletId, date),
        );
    }
  }

  private dailyCsv(report: DailyReport): ReportCsv {
    const rows: Array<Array<string | number | null>> = report.orderTypes.map(
      (row) => [
        row.orderType,
        row.orderCount,
        row.subtotal,
        row.tax,
        row.service,
        row.discount,
        row.revenue,
      ],
    );
    rows.push([
      'TOTAL',
      report.orderCount,
      report.subtotal,
      report.tax,
      report.service,
      report.discount,
      report.revenue,
    ]);

    return this.csv(
      `daily-${report.date}`,
      [
        'order_type',
        'order_count',
        'subtotal',
        'tax',
        'service',
        'discount',
        'revenue',
      ],
      rows,
    );
  }

  private paymentsCsv(report: PaymentReport): ReportCsv {
    return this.csv(
      `payments-${report.date}`,
      ['order_type', 'payment_method', 'order_count', 'amount'],
      report.rows.map((row) => [
        row.orderType,
        row.paymentMethod,
        row.orderCount,
        row.amount,
      ]),
    );
  }

  private itemsCsv(report: ItemReport): ReportCsv {
    return this.csv(
      `items-${report.date}`,
      ['menu_item_id', 'name', 'qty', 'revenue'],
      report.rows.map((row) => [
        row.menuItemId,
        row.name,
        row.qty,
        row.revenue,
      ]),
    );
  }

  private taxCsv(report: TaxReport): ReportCsv {
    return this.csv(
      `tax-${report.date}`,
      ['order_type', 'order_count', 'tax_amount'],
      report.rows.map((row) => [row.orderType, row.orderCount, row.taxAmount]),
    );
  }

  private cancellationsCsv(report: CancellationReport): ReportCsv {
    return this.csv(
      `cancellations-${report.date}`,
      [
        'order_number',
        'order_type',
        'total',
        'reason',
        'cancelled_at',
        'cancelled_by_user_id',
      ],
      report.rows.map((row) => [
        row.orderNumber,
        row.orderType,
        row.total,
        row.reason,
        row.cancelledAt?.toISOString() ?? null,
        row.cancelledByUserId,
      ]),
    );
  }

  private csv(
    name: string,
    headers: string[],
    rows: Array<Array<string | number | null>>,
  ): ReportCsv {
    const lines = [
      headers.map((value) => this.csvCell(value)).join(','),
      ...rows.map((row) => row.map((value) => this.csvCell(value)).join(',')),
    ];
    return {
      filename: `report-${name}.csv`,
      content: `${lines.join('\r\n')}\r\n`,
    };
  }

  private csvCell(value: string | number | null): string {
    if (value === null) {
      return '';
    }
    const text = String(value);
    const safe =
      typeof value === 'string' && /^[=+\-@\t\r]/.test(text)
        ? `'${text}`
        : text;
    return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  }
}
