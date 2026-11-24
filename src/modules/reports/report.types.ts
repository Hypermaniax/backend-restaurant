import type { OrderType, PaymentMethod } from '../../generated/prisma/client';

export enum ReportType {
  DAILY = 'daily',
  PAYMENTS = 'payments',
  ITEMS = 'items',
  TAX = 'tax',
  CANCELLATIONS = 'cancellations',
}

export interface ReportOrderTypeRow {
  orderType: OrderType;
  orderCount: number;
  subtotal: number;
  tax: number;
  service: number;
  discount: number;
  revenue: number;
}

export interface DailyReport {
  date: string;
  orderCount: number;
  subtotal: number;
  tax: number;
  service: number;
  discount: number;
  revenue: number;
  orderTypes: ReportOrderTypeRow[];
}

export interface PaymentReportRow {
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  orderCount: number;
  amount: number;
}

export interface PaymentReport {
  date: string;
  totalAmount: number;
  rows: PaymentReportRow[];
}

export interface ItemReportRow {
  menuItemId: string | null;
  name: string;
  qty: number;
  revenue: number;
}

export interface ItemReport {
  date: string;
  totalQty: number;
  totalRevenue: number;
  rows: ItemReportRow[];
}

export interface TaxReportRow {
  orderType: OrderType;
  orderCount: number;
  taxAmount: number;
}

export interface TaxReport {
  date: string;
  totalTax: number;
  rows: TaxReportRow[];
}

export interface CancellationReportRow {
  orderId: string;
  orderNumber: string;
  orderType: OrderType;
  total: number;
  reason: string | null;
  cancelledAt: Date | null;
  cancelledByUserId: string | null;
}

export interface CancellationReport {
  date: string;
  count: number;
  totalAmount: number;
  rows: CancellationReportRow[];
}

export interface ReportCsv {
  filename: string;
  content: string;
}
