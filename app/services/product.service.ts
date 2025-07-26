import prisma from '~/db.server';
// After `npx prisma generate`, these imports will now resolve correctly.
import { ProductStatus, type Product, type Variant } from '@prisma/client';

// Define a precise type for the product data shape we are working with.
// This combines the base Product type with the included Variant relation.
type ProductWithVariants = Product & {
  Variant: (Variant & { Inventory: { quantity: number }[] })[];
};

interface ProductMetrics {
  currentTotalInventory: number;
  stockoutDays: number | null;
  status: ProductStatus;
}

// Shop-specific settings needed for metric calculation
interface ShopSettingsForMetrics {
  lowStockThresholdUnits: number;
  criticalStockThresholdUnits: number;
  criticalStockoutDays: number;
}

export function calculateProductMetrics(
  product: ProductWithVariants, // Use the correctly defined type
  shopSettings: ShopSettingsForMetrics
): ProductMetrics {
  // FIX: Add explicit types for the 'reduce' callback parameters.
  const currentTotalInventory = product.Variant.reduce(
    (sum: number, v: Variant & { Inventory: { quantity: number }[] }) =>
      sum + (v.Inventory?.reduce((invSum: number, inv: { quantity: number }) => invSum + (inv.quantity || 0), 0) || 0),
    0
  );
  const salesVelocity = product.salesVelocityFloat ?? 0;

  let stockoutDays: number | null = null;
  if (salesVelocity > 0) {
    stockoutDays = currentTotalInventory / salesVelocity;
  } else if (currentTotalInventory > 0) {
    stockoutDays = Infinity;
  } else {
    stockoutDays = 0;
  }

  let status: ProductStatus = ProductStatus.OK;
  const { lowStockThresholdUnits, criticalStockThresholdUnits, criticalStockoutDays } = shopSettings;

  if (currentTotalInventory === 0) {
    status = ProductStatus.Critical;
  } else if (currentTotalInventory <= criticalStockThresholdUnits) {
    status = ProductStatus.Critical;
  } else if (stockoutDays !== null && stockoutDays !== Infinity && stockoutDays <= criticalStockoutDays && salesVelocity > 0) {
    status = ProductStatus.Critical;
  } else if (currentTotalInventory <= lowStockThresholdUnits) {
    status = ProductStatus.Low;
  }

  return {
    currentTotalInventory,
    stockoutDays: stockoutDays === Infinity ? null : (stockoutDays !== null ? parseFloat(stockoutDays.toFixed(2)) : null),
    status,
  };
}

export async function updateAllProductMetricsForShop(shopId: string): Promise<{ success: boolean; message: string; updatedCount: number }> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { NotificationSetting: true }
  });

  if (!shop) {
    return { success: false, message: `Shop with ID ${shopId} not found.`, updatedCount: 0 };
  }

  const notificationSetting = shop.NotificationSetting;
  const lowStockThresholdUnits = notificationSetting?.lowStockThreshold ?? shop.lowStockThreshold ?? 10;

  const shopSettings: ShopSettingsForMetrics = {
    lowStockThresholdUnits,
    criticalStockThresholdUnits: notificationSetting?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThresholdUnits * 0.3)),
    criticalStockoutDays: notificationSetting?.criticalStockoutDays ?? 3,
  };
  const salesVelocityThresholdForTrending = notificationSetting?.salesVelocityThreshold ?? 50;

  let totalUpdatedCount = 0;
  const BATCH_SIZE = 100;
  let skip = 0;
  let hasMoreProducts = true;

  console.log(`Starting metrics update for shop ${shopId}. Low: ${shopSettings.lowStockThresholdUnits}, CritUnits: ${shopSettings.criticalStockThresholdUnits}, CritDays: ${shopSettings.criticalStockoutDays}`);

  while (hasMoreProducts) {
    // The type is now correctly inferred by Prisma. The explicit type annotation and
    // the `as` assertion are no longer needed, leading to cleaner code.
    const productsInBatch: ProductWithVariants[] = await prisma.product.findMany({
      where: { shopId },
      include: { Variant: { include: { Inventory: true } } },
      take: BATCH_SIZE,
      skip: skip,
      orderBy: { id: 'asc' }
    });

    if (productsInBatch.length === 0) {
      hasMoreProducts = false;
      break;
    }

    console.log(`Processing batch of ${productsInBatch.length} products for shop ${shopId}. Skip: ${skip}`);

    for (const product of productsInBatch) {
      const metrics = calculateProductMetrics(product, shopSettings);
      // `product.salesVelocityFloat` will now resolve correctly.
      const trending = (product.salesVelocityFloat ?? 0) > salesVelocityThresholdForTrending;

      try {
        // `product.id` and `product.title` will now resolve correctly.
        await prisma.product.update({
          where: { id: product.id },
          data: {
            stockoutDays: metrics.stockoutDays,
            status: metrics.status,
            trending: trending,
          },
        });
        totalUpdatedCount++;
      } catch (e: any) {
        console.error(`Failed to update metrics for product ${product.id} (${product.title}): ${e.message}`);
      }
    }
    skip += BATCH_SIZE;
  }
  console.log(`Metrics update completed for shop ${shopId}. Total products updated: ${totalUpdatedCount}.`);
  return { success: true, message: `Updated metrics for ${totalUpdatedCount} products.`, updatedCount: totalUpdatedCount };
}
