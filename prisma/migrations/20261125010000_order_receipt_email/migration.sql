ALTER TABLE "orders" ADD COLUMN "customer_email" TEXT;
ALTER TABLE "orders" ADD COLUMN "receipt_email_sent_at" TIMESTAMPTZ(6);
