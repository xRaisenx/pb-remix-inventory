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
  if (product.salesVelocityFloat && product.salesVelocityFloat > 0) {
    stockoutDays = currentTotalInventory / product.salesVelocityFloat;
  } else if (product.salesVelocityFloat === 0 && currentTotalInventory > 0) {
    stockoutDays = Infinity;
  } else {
    stockoutDays = 0;
  }

  let status: ProductMetrics['status'] = 'Unknown';
  const lowThreshold = shopSettings.lowStockThresholdUnits;
  const criticalUnits = shopSettings.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowThreshold * 0.3));
  const criticalDays = shopSettings.criticalStockoutDays ?? 3;

  if (stockoutDays !== null && stockoutDays !== Infinity) {
    if (currentTotalInventory <= criticalUnits || (stockoutDays <= criticalDays && (product.salesVelocityFloat ?? 0) > 0)) {
      status = 'Critical';
    } else if (currentTotalInventory <= lowThreshold || (stockoutDays <= (lowThreshold / ((product.salesVelocityFloat ?? 1) === 0 ? 1 : (product.salesVelocityFloat ?? 1) )) && (product.salesVelocityFloat ?? 0) > 0 )) {
      status = 'Low';
    } else {
      status = 'Healthy';
    }
  } else if (stockoutDays === Infinity) {
     if (currentTotalInventory <= criticalUnits) {
        status = 'Critical';
     } else if (currentTotalInventory <= lowThreshold) {
        status = 'Low';
     } else {
        status = 'Healthy';
     }
  } else {
    if (currentTotalInventory === 0) {
        status = 'Critical';
    } else {
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

  if (currentTotalInventory === 0) {
      if (product.salesVelocityFloat && product.salesVelocityFloat > 0) {
          status = 'Critical';
      } else if (!product.salesVelocityFloat || product.salesVelocityFloat === 0) {
          status = 'Critical';
      }
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

  const products = await prisma.product.findMany({
    where: { shopId },
    include: { variants: { select: { inventoryQuantity: true } } }
  });

  let updatedCount = 0;
  for (const product of products) {
    // Cast product to ProductWithVariantsAndSalesVelocity for calculateProductMetrics
    // salesVelocityFloat is now part of product, so this cast is mainly for variants structure.
    const metrics = calculateProductMetrics(product as ProductWithVariantsAndSalesVelocity, shopSettings);

    const salesVelocityThresholdForTrending = notificationSetting?.salesVelocityThreshold ?? 50;
    const trending = product.salesVelocityFloat !== null && product.salesVelocityFloat > salesVelocityThresholdForTrending;

    await prisma.product.update({
      where: { id: product.id },
      data: {
        // These fields are now part of the Product model
        stockoutDays: metrics.stockoutDays,
        status: metrics.status,
        trending: trending,
      },
    });
    updatedCount++;
  }
  return { success: true, message: `Updated metrics for ${updatedCount} products in shop ${shop.shop}.`, updatedCount };
}
