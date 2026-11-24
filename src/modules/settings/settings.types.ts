import type { OrderType } from '../../generated/prisma/client';

export interface SettingsView {
  outletId: string;
  taxInclusive: boolean;
  taxBaseIncludesService: boolean;
  serviceRateBp: number;
  requirePaymentBeforeKitchen: boolean;
  orderExpiryMinutes: number;
  cashExpiryMinutes: number;
  receiptFooter: string | null;
  updatedAt: Date;
  qrBaseUrl: string;
}

export interface TaxRuleView {
  id: string;
  outletId: string;
  orderType: OrderType;
  isEnabled: boolean;
  rateBp: number;
  updatedAt: Date;
}

export interface ReceiptSettingsView {
  outletName: string;
  taxInclusive: boolean;
  receiptFooter: string | null;
}
