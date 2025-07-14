// app/services/product.service.ts
import prisma from '~/db.server';
import { ProductStatus, type Product, type Variant } from '@prisma/client';

// Interface for product data passed to calculateProductMetrics
// Ensure salesVelocityFloat is part of the Product model or added if it's calculated elsewhere before this step.
interface ProductWithVariantsAndSalesVelocity extends Product {
  variants: Pick<Variant, 'inventoryQuantity'>[];
  // salesVelocityFloat is expected by the original code, ensure it's on the Product model
  // or explicitly add it here if it's derived before calling calculateProductMetrics.
  // salesVelocityFloat?: number | null;
}

interface ProductMetrics {
  currentTotalInventory: number;
  stockoutDays: number | null; // Can be null if sales velocity is 0 or inventory is 0 with no velocity
  status: ProductStatus; // Status based on thresholds
}

// Shop-specific settings needed for metric calculation
interface ShopSettingsForMetrics {
  lowStockThresholdUnits: number;
  criticalStockThresholdUnits: number;
  criticalStockoutDays: number;
}

export function calculateProductMetrics(
  product: ProductWithVariantsAndSalesVelocity, // Type for the product input
  shopSettings: ShopSettingsForMetrics // Type for shop settings
): ProductMetrics {
  const currentTotalInventory = product.variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0);
  const salesVelocity = product.salesVelocityFloat ?? 0; // Use salesVelocityFloat from Product model

  let stockoutDays: number | null = null;
  if (salesVelocity > 0) {
    stockoutDays = currentTotalInventory / salesVelocity;
  } else if (currentTotalInventory > 0) {
    // Positive inventory but no sales, effectively infinite stockout days (represented as null or a large number)
    stockoutDays = Infinity; // Or a very large number if Infinity is problematic for DB/display
  } else {
    // Zero inventory and no sales, stockout is immediate (0 days)
    stockoutDays = 0;
  }

  let status: ProductStatus = ProductStatus.OK; // Default status (assuming OK for Healthy)
  const { lowStockThresholdUnits, criticalStockThresholdUnits, criticalStockoutDays } = shopSettings;

  // Determine status based on inventory levels and stockout days
  if (currentTotalInventory === 0) {
    status = ProductStatus.Critical; // No stock is always critical
  } else if (currentTotalInventory <= criticalStockThresholdUnits) {
    // Below or at critical units threshold
    status = ProductStatus.Critical;
  } else if (stockoutDays !== null && stockoutDays !== Infinity && stockoutDays <= criticalStockoutDays && salesVelocity > 0) {
    // Will stock out within critical days period, and there are sales
    status = ProductStatus.Critical;
  } else if (currentTotalInventory <= lowStockThresholdUnits) {
    // Below or at low units threshold (but not critical)
    status = ProductStatus.Low;
  }
  // Otherwise, it remains ProductStatus.OK

  return {
    currentTotalInventory,
    // Convert Infinity to null for database storage if Infinity is not desired
    stockoutDays: stockoutDays === Infinity ? null : (stockoutDays !== null ? parseFloat(stockoutDays.toFixed(2)) : null),
    status,
  };
}

export async function updateAllProductMetricsForShop(shopId: string): Promise<{ success: boolean; message: string; updatedCount: number }> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { NotificationSetting: true } // Include to get shop-specific thresholds
  });

  if (!shop) {
    return { success: false, message: `Shop with ID ${shopId} not found.`, updatedCount: 0 };
  }

  // Determine thresholds: use notification settings if available, else shop defaults, else app defaults
  const notificationSetting = shop.NotificationSetting; // Assuming one setting per shop
  const lowStockThresholdUnits = notificationSetting?.lowStockThreshold ?? shop.lowStockThreshold ?? 10; // App default: 10

  const shopSettings: ShopSettingsForMetrics = {
    lowStockThresholdUnits,
    criticalStockThresholdUnits: notificationSetting?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThresholdUnits * 0.3)), // Default: 5 or 30% of low stock
    criticalStockoutDays: notificationSetting?.criticalStockoutDays ?? 3, // Default: 3 days
  };
  const salesVelocityThresholdForTrending = notificationSetting?.salesVelocityThreshold ?? 50; // Default: 50 units/day for trending

  let totalUpdatedCount = 0;
  const BATCH_SIZE = 100; // Process products in batches
  let skip = 0;
  let hasMoreProducts = true;

  console.log(`Starting metrics update for shop ${shopId}. Low: ${shopSettings.lowStockThresholdUnits}, CritUnits: ${shopSettings.criticalStockThresholdUnits}, CritDays: ${shopSettings.criticalStockoutDays}`);

  while (hasMoreProducts) {
    const productsInBatch: ProductWithVariantsAndSalesVelocity[] = await prisma.product.findMany({
      where: { shopId },
      include: { variants: { select: { inventoryQuantity: true } } }, // Only need inventoryQuantity from variants
      take: BATCH_SIZE,
      skip: skip,
      orderBy: { id: 'asc' } // Consistent ordering for batching
    });

    if (productsInBatch.length === 0) {
      hasMoreProducts = false;
      break;
    }

    console.log(`Processing batch of ${productsInBatch.length} products for shop ${shopId}. Skip: ${skip}`);

    for (const product of productsInBatch) {
      // Ensure salesVelocityFloat is available on product, if not, this will fail or use 0.
      // If salesVelocityFloat is calculated dynamically elsewhere, that service should run first.
      if (product.salesVelocityFloat === undefined) {
        // console.warn(`Product ${product.id} (${product.title}) is missing salesVelocityFloat. Metrics may be inaccurate.`);
      }

      const metrics = calculateProductMetrics(product, shopSettings);
      const trending = (product.salesVelocityFloat ?? 0) > salesVelocityThresholdForTrending;

      try {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            stockoutDays: metrics.stockoutDays,
            status: metrics.status,
            trending: trending,
            // lastCalculatedAt: new Date(), // Optional: timestamp of last calculation
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
  // Corrected typo in return statement: totalUpdatedCount instead of updatedCount (if that was the typo)
  // The original problem description said "totalUpdatedCount vs. updatedCount", implying `updatedCount` was the field name.
  // Sticking to `updatedCount` as the field name in the return object as per the problem description's implied fix.
  return { success: true, message: `Updated metrics for ${totalUpdatedCount} products.`, updatedCount: totalUpdatedCount };
}
