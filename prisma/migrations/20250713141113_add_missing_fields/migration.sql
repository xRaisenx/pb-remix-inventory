-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationChannel" ADD VALUE 'SMS';
ALTER TYPE "NotificationChannel" ADD VALUE 'Webhook';

-- AlterEnum
ALTER TYPE "ProductStatus" ADD VALUE 'OutOfStock';

-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN     "availableQuantity" INTEGER;

-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "subject" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "handle" TEXT,
ADD COLUMN     "quantity" INTEGER DEFAULT 0;

-- CreateTable
CREATE TABLE "AnalyticsData" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "unitsSold" INTEGER,
    "revenue" DOUBLE PRECISION,
    "orders" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAlert" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsData_productId_idx" ON "AnalyticsData"("productId");

-- CreateIndex
CREATE INDEX "AnalyticsData_date_idx" ON "AnalyticsData"("date");

-- CreateIndex
CREATE INDEX "ProductAlert_productId_idx" ON "ProductAlert"("productId");

-- CreateIndex
CREATE INDEX "ProductAlert_isActive_idx" ON "ProductAlert"("isActive");

-- AddForeignKey
ALTER TABLE "AnalyticsData" ADD CONSTRAINT "AnalyticsData_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAlert" ADD CONSTRAINT "ProductAlert_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
