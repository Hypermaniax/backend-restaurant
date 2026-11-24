ALTER TABLE "orders" ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "orders_outlet_id_idempotency_key_key" ON "orders"("outlet_id", "idempotency_key");
