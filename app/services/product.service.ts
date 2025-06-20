// app/services/product.service.ts
import prisma from '~/db.server';
import type { Product, Variant, Shop, NotificationSettings } from '@prisma/client';

interface ProductMetrics {
  currentTotalInventory: number;
  stockoutDays: number | null; // Can be null if sales velocity is 0 or not available
  status: 'Healthy' | 'Low' | 'Critical' | 'Unknown';
  // trending can be determined here too if logic is simple enough
}

interface ProductWithVariants extends Product {
  variants: Pick<Variant, 'inventoryQuantity'>[];
}

/**
 * Calculates dynamic metrics for a single product.
 * @param product - The product object, including its variants with inventoryQuantity.
 * @param shopSettings - Shop settings containing thresholds.
 *                     Requires lowStockThreshold (e.g., from Shop or NotificationSettings).
 *                     A criticalStockThreshold (e.g., in days or units) should also be defined.
 */
export function calculateProductMetrics(
  product: ProductWithVariants,
  shopSettings: { lowStockThresholdUnits: number; criticalStockThresholdUnits?: number; criticalStockoutDays?: number }
): ProductMetrics {
  const currentTotalInventory = product.variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0);

  let stockoutDays: number | null = null;
  if (product.salesVelocityFloat && product.salesVelocityFloat > 0) {
    stockoutDays = currentTotalInventory / product.salesVelocityFloat;
  } else if (product.salesVelocityFloat === 0 && currentTotalInventory > 0) {
    stockoutDays = Infinity; // Has stock, but no sales
  } else {
    stockoutDays = 0; // No stock, or no sales velocity data
  }

  let status: ProductMetrics['status'] = 'Unknown';
  const lowThreshold = shopSettings.lowStockThresholdUnits;
  // Define critical thresholds, e.g. 0 units or a few days of stockout
  const criticalUnits = shopSettings.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowThreshold * 0.3)); // e.g. 5 units or 30% of low threshold
  const criticalDays = shopSettings.criticalStockoutDays ?? 3; // e.g., 3 days

  if (stockoutDays !== null && stockoutDays !== Infinity) { // Finite stockout days calculated
    if (currentTotalInventory <= criticalUnits || (stockoutDays <= criticalDays && product.salesVelocityFloat! > 0)) {
      status = 'Critical';
    } else if (currentTotalInventory <= lowThreshold || (stockoutDays <= (lowThreshold / (product.salesVelocityFloat! || 1)) && product.salesVelocityFloat! > 0 )) {
      status = 'Low';
    } else {
      status = 'Healthy';
    }
  } else if (stockoutDays === Infinity) { // Has stock, but no sales
     if (currentTotalInventory <= criticalUnits) {
        status = 'Critical'; // Still critical if below unit threshold despite no sales
     } else if (currentTotalInventory <= lowThreshold) {
        status = 'Low'; // Low if below unit threshold despite no sales
     } else {
        status = 'Healthy'; // Healthy if above low threshold, even with no sales
     }
  } else { // If stockoutDays is null (e.g. currentTotalInventory is 0 and no sales velocity)
    if (currentTotalInventory === 0) {
        status = 'Critical'; // No stock is always critical if we expect sales or it's an active product
    } else {
        // This case should ideally not be hit if stockoutDays logic is comprehensive
        // but as a fallback based on units:
        if (currentTotalInventory <= criticalUnits) {
          status = 'Critical';
        } else if (currentTotalInventory <= lowThreshold) {
          status = 'Low';
        } else if (currentTotalInventory > lowThreshold) {
            status = 'Healthy';
        } else {
            status = 'Unknown';
        }
    }
  }

  // Final override: if inventory is 0, it's critical, unless sales velocity is also 0 (could be inactive)
  if (currentTotalInventory === 0) {
      if (product.salesVelocityFloat && product.salesVelocityFloat > 0) { // Actively selling but no stock
          status = 'Critical';
      } else if (!product.salesVelocityFloat || product.salesVelocityFloat === 0) { // No stock, no sales
          status = 'Critical'; // Or 'OutOfStock' - for now, critical as it needs attention.
      }
  }


  return {
    currentTotalInventory,
    stockoutDays: stockoutDays === Infinity ? null : (stockoutDays !== null ? parseFloat(stockoutDays.toFixed(2)) : null),
    status,
  };
}

/**
 * Updates all product metrics for a given shop.
 * This should be called periodically or after significant inventory/sales data changes.
 * @param shopId - The ID of the shop.
 */
export async function updateAllProductMetricsForShop(shopId: string): Promise<{ success: boolean; message: string; updatedCount: number }> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { notificationSettings: true } // To get potential override thresholds
  });

  if (!shop) {
    return { success: false, message: `Shop with ID ${shopId} not found.`, updatedCount: 0 };
  }

  // Determine thresholds: Use NotificationSettings override if available, else Shop default, else hardcoded fallback.
  const lowStockThresholdUnits = shop.notificationSettings?.lowStockThreshold ?? shop.lowStockThreshold ?? 10;

  const criticalStockThresholdUnits =
    shop.notificationSettings?.criticalStockThresholdUnits ??
    Math.min(5, Math.floor(lowStockThresholdUnits * 0.3)); // Fallback: e.g., 5 units or 30% of low threshold

  const criticalStockoutDays =
    shop.notificationSettings?.criticalStockoutDays ??
    3; // Fallback: e.g., 3 days

  const shopSettings = { lowStockThresholdUnits, criticalStockThresholdUnits, criticalStockoutDays };

  const products = await prisma.product.findMany({
    where: { shopId },
    include: { variants: { select: { inventoryQuantity: true } } }
  });

  let updatedCount = 0;
  for (const product of products) {
    // salesVelocityFloat is nullable. calculateProductMetrics handles null.
    const metrics = calculateProductMetrics(product, shopSettings);

    // Determine 'trending' status - simple example:
    const salesVelocityThresholdForTrending = shop.notificationSettings?.salesVelocityThreshold ?? 50; // Default if not set
    const trending = product.salesVelocityFloat !== null && product.salesVelocityFloat > salesVelocityThresholdForTrending;

    await prisma.product.update({
      where: { id: product.id },
      data: {
        stockoutDays: metrics.stockoutDays,
        status: metrics.status,
        trending: trending, // Update trending status
        // currentTotalInventory is not a field on Product model, it's calculated dynamically.
      },
    });
    updatedCount++;
  }
  return { success: true, message: `Updated metrics for ${updatedCount} products in shop ${shop.shop}.`, updatedCount };
}
