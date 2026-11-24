import type {
  TableSession,
  TableSessionStatus,
  TableStatus,
} from '../../generated/prisma/client';

export interface TableSessionView {
  id: string;
  tableId: string;
  status: TableSessionStatus;
  guestCount: number | null;
  openedAt: Date;
  closedAt: Date | null;
  closedByUserId: string | null;
}

export interface TableView {
  id: string;
  outletId: string;
  code: string;
  name: string;
  zone: string | null;
  status: TableStatus;
  isActive: boolean;
  openSession: TableSessionView | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicTableView {
  id: string;
  code: string;
  name: string;
  zone: string | null;
  status: TableStatus;
  outlet: {
    id: string;
    name: string;
    slug: string;
  };
  session: TableSessionView | null;
}

export type TableWithOpenSession = {
  id: string;
  outletId: string;
  code: string;
  name: string;
  zone: string | null;
  status: TableStatus;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  sessions: TableSession[];
};
