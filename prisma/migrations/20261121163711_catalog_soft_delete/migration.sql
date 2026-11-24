-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "modifier_groups" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;
