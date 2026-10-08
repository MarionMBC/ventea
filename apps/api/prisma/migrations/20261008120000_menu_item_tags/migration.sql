-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "compareAtPriceCents" INTEGER,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
