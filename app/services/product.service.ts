// app/services/product.service.ts
import prisma from '~/db.server';
import type { Product, Variant, Shop, NotificationSetting as PrismaNotificationSettings } from '@prisma/client'; // Renamed to avoid conflict

// Interface for product with its variants, now including salesVelocityFloat from Product model
interface ProductWithVariantsAndSalesVelocity extends Product {
  variants: Pick<Variant, 'inventoryQuantity'>[];
  // salesVelocityFloat is now part of the Product model, so it's directly available.
}

interface ProductMetrics {
  currentTotalInventory: number;
  stockoutDays: number | null;
  status: 'Healthy' | 'Low' | 'Critical' | 'Unknown';
}

// shopSettings now more closely matches Prisma NotificationSettings structure
interface ShopSettingsForMetrics {
  lowStockThresholdUnits: number;
  criticalStockThresholdUnits?: number; // From Prisma NotificationSetting
  criticalStockoutDays?: number;      // From Prisma NotificationSetting
}

export function calculateProductMetrics(
  product: ProductWithVariantsAndSalesVelocity, // Use the updated interface
  shopSettings: ShopSettingsForMetrics
): ProductMetrics {
  const currentTotalInventory = product.variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0);

  let stockoutDays: number | null = null;
  // Use salesVelocityFloat directly from the product model
  if (product.salesVelocityFloat !== null && product.salesVelocityFloat > 0) {
    stockoutDays = currentTotalInventory / product.salesVelocityFloat;
  } else if (product.salesVelocityFloat === 0 && currentTotalInventory > 0) {
    stockoutDays = Infinity; // Has stock, but no sales
  } else if (currentTotalInventory === 0) {
    stockoutDays = 0; // No stock
  }
  // If salesVelocityFloat is null and inventory > 0, stockoutDays remains null (Unknown/Cannot calculate)


  let status: ProductMetrics['status'] = 'Unknown';
  const lowThreshold = shopSettings.lowStockThresholdUnits;
  // Use provided critical thresholds or calculate defaults based on lowThreshold
  const criticalUnits = shopSettings.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowThreshold * 0.3));
  const criticalDays = shopSettings.criticalStockoutDays ?? 3; // Typo fixed: criticalStockoutDays

  // Prioritize Critical status
  if (currentTotalInventory === 0) {
      status = 'Critical';
  } else if (currentTotalInventory <= criticalUnits) {
      status = 'Critical';
  } else if (stockoutDays !== null && stockoutDays !== Infinity && stockoutDays <= criticalDays && (product.salesVelocityFloat ?? 0) > 0) {
      status = 'Critical';
  }
  // Then check for Low status if not Critical
  else if (currentTotalInventory <= lowThreshold) {
      status = 'Low';
  } else if (stockoutDays !== null && stockoutDays !== Infinity && stockoutDays <= (lowThreshold / ((product.salesVelocityFloat ?? 1) === 0 ? 1 : (product.salesVelocityFloat ?? 1) )) && (product.salesVelocityFloat ?? 0) > 0 ) {
      status = 'Low';
  }
  // Otherwise, it's Healthy
  else {
      status = 'Healthy';
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
    // The user's schema has NotificationSettings as an array, so take the first or handle multiple if logic dictates
    include: { NotificationSettings: true }
  });

  if (!shop) {
    return { success: false, message: `Shop with ID ${shopId} not found.`, updatedCount: 0 };
  }

  // Assuming one NotificationSetting per shop for these thresholds, or use defaults.
  const notificationSetting = shop.NotificationSettings?.[0];

  const lowStockThresholdUnits = notificationSetting?.lowStockThreshold ?? shop.lowStockThreshold ?? 10;
  const criticalStockThresholdUnits = notificationSetting?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThresholdUnits * 0.3));
  const criticalStockoutDays = notificationSetting?.criticalStockoutDays ?? 3;

  const shopSettings: ShopSettingsForMetrics = { lowStockThresholdUnits, criticalStockThresholdUnits, criticalStockoutDays };

  let totalUpdatedCount = 0;
  const BATCH_SIZE = 100;
  let skip = 0;
  let hasMoreProducts = true;

  console.log(`Starting batched update of product metrics for shop ${shop.shop}. Batch size: ${BATCH_SIZE}`);

  while (hasMoreProducts) {
    const productsInBatch = await prisma.product.findMany({
      where: { shopId },
      include: { variants: { select: { inventoryQuantity: true } } },
      take: BATCH_SIZE,
      skip: skip,
      orderBy: { id: 'asc' },
    });

    if (productsInBatch.length === 0) {
      hasMoreProducts = false;
      break;
    }

    console.log(`Processing metrics batch of ${productsInBatch.length} products for shop ${shop.shop}. Skip: ${skip}`);
    for (const product of productsInBatch) {
      const metrics = calculateProductMetrics(product as ProductWithVariantsAndSalesVelocity, shopSettings);
      const salesVelocityThresholdForTrending = notificationSetting?.salesVelocityThreshold ?? 50;
      const trending = product.salesVelocityFloat !== null && product.salesVelocityFloat > salesVelocityThresholdForTrending;

      try {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            stockoutDays: metrics.stockoutDays,
            status: metrics.status,
            trending: trending,
          },
        });
        totalUpdatedCount++;
      } catch (e) {
        console.error(`Failed to update metrics for product ID ${product.id} in shop ${shop.shop}:`, e);
        // Decide if one failure should stop all, or just log and continue. For now, log and continue.
      }
    }

    skip += BATCH_SIZE;
    if (productsInBatch.length < BATCH_SIZE) {
      hasMoreProducts = false;
    }
    // Optional: await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
  }
  return { success: true, message: `Updated metrics for ${totalUpdatedCount} products in shop ${shop.shop}.`, totalUpdatedCount };
}
