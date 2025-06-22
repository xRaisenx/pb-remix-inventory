/*
  Warnings:

  - You are about to drop the column `shop` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `accessToken` on the `Shop` table. All the data in the column will be lost.
  - Added the required column `shopId` to the `Session` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Session_shop_idx";

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "shop",
ADD COLUMN     "shopId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Shop" DROP COLUMN "accessToken",
ADD COLUMN     "initialSyncCompleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Session_shopId_idx" ON "Session"("shopId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
