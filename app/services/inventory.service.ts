import prisma from "~/db.server";
import { ProductStatus } from "@prisma/client";

// Enhanced inventory service with better merchant experience
export interface InventoryUpdateResult {
  success: boolean;
  message: string;
  previousQuantity?: number;
  newQuantity: number;
  product?: {
    id: string;
    title: string;
    handle: string;
  };
  alertGenerated?: boolean;
  suggestedRestock?: {
    quantity: number;
    urgency: 'low' | 'medium' | 'high' | 'critical';
    estimatedCost: number;
  };
}

export interface StockAnalysis {
  daysOfStock: number;
  status: ProductStatus;
  reorderPoint: number;
  suggestedOrderQuantity: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  velocity: number;
}

// Enhanced restock calculation with merchant insights
export function calculateRestock(
  currentStock: number,
  dailyVelocity: number,
  price: number,
  leadTimeDays: number = 7,
  bufferDays: number = 14
): InventoryUpdateResult['suggestedRestock'] {
  if (dailyVelocity <= 0) {
    return {
      quantity: Math.max(50, Math.round(currentStock * 0.5)),
      urgency: 'low',
      estimatedCost: Math.max(50, Math.round(currentStock * 0.5)) * price
    };
  }

  const daysUntilStockout = currentStock / dailyVelocity;
  const totalLeadTime = leadTimeDays + bufferDays;
  const suggestedQuantity = Math.ceil(dailyVelocity * totalLeadTime);
  
  let urgency: 'low' | 'medium' | 'high' | 'critical';
  
  if (daysUntilStockout <= 1) {
    urgency = 'critical';
  } else if (daysUntilStockout <= 3) {
    urgency = 'high';
  } else if (daysUntilStockout <= 7) {
    urgency = 'medium';
  } else {
    urgency = 'low';
  }

  return {
    quantity: suggestedQuantity,
    urgency,
    estimatedCost: suggestedQuantity * price
  };
}

// Enhanced inventory update with merchant notifications
export async function updateInventoryQuantityInShopifyAndDB(
  inventoryItemId: string,
  locationId: string,
  newQuantity: number,
  shopName: string,
  context: {
    reason?: string;
    userId?: string;
    automated?: boolean;
  } = {}
): Promise<InventoryUpdateResult> {
  let transaction;
  
  try {
    // Start database transaction for data consistency
    transaction = await prisma.$transaction(async (tx) => {
      // Get current product data
      const product = await tx.product.findFirst({
        where: { 
          OR: [
            { id: inventoryItemId },
            { shopifyInventoryItemId: inventoryItemId }
          ]
        },
        include: {
          analyticsData: {
            orderBy: { createdAt: 'desc' },
            take: 30 // Last 30 days for trend analysis
          }
        }
      });

      if (!product) {
        throw new Error(`Product with inventory item ID ${inventoryItemId} not found`);
      }

      const previousQuantity = product.quantity;
      
      // Calculate sales velocity and trend
      const analytics = product.analyticsData;
      const dailyVelocity = analytics.length > 0 
        ? analytics.reduce((sum, data) => sum + (data.salesVelocity || 0), 0) / analytics.length
        : 0;

      // Update product quantity
      const updatedProduct = await tx.product.update({
        where: { id: product.id },
        data: { 
          quantity: newQuantity,
          lastUpdated: new Date(),
          lastUpdatedBy: context.userId || 'system'
        }
      });

      // Generate analytics data for this update
      await tx.analyticsData.create({
        data: {
          productId: product.id,
          salesVelocity: dailyVelocity,
          stockLevel: newQuantity,
          daysUntilStockout: dailyVelocity > 0 ? newQuantity / dailyVelocity : 999,
          reorderPoint: Math.max(dailyVelocity * 7, 10), // 7 days buffer
          recordedAt: new Date()
        }
      });

      // Check if alert should be generated
      const shouldGenerateAlert = await shouldCreateStockAlert(
        newQuantity,
        dailyVelocity,
        product.status
      );

      let alertGenerated = false;
      if (shouldGenerateAlert) {
        await tx.productAlert.create({
          data: {
            productId: product.id,
            type: newQuantity <= 5 ? 'CRITICAL_STOCK' : 'LOW_STOCK',
            message: `${product.title} stock level: ${newQuantity} units (${Math.round(newQuantity / Math.max(dailyVelocity, 1))} days remaining)`,
            severity: newQuantity <= 5 ? 'HIGH' : 'MEDIUM',
            resolved: false,
            metadata: {
              previousQuantity,
              newQuantity,
              dailyVelocity,
              reason: context.reason || 'automatic_update',
              automated: context.automated || false
            }
          }
        });
        alertGenerated = true;
      }

      // Calculate restock suggestion
      const suggestedRestock = calculateRestock(
        newQuantity,
        dailyVelocity,
        product.price
      );

      return {
        success: true,
        message: `Successfully updated ${product.title} inventory to ${newQuantity} units`,
        previousQuantity,
        newQuantity,
        product: {
          id: product.id,
          title: product.title,
          handle: product.handle
        },
        alertGenerated,
        suggestedRestock
      };
    });

    return transaction;

  } catch (error) {
    console.error('❌ Inventory update failed:', error);
    
    // Provide merchant-friendly error messages
    let merchantMessage = 'Failed to update inventory. Please try again.';
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        merchantMessage = 'Product not found in your inventory system. Please refresh and try again.';
      } else if (error.message.includes('connection')) {
        merchantMessage = 'Database connection issue. Your inventory update will be retried automatically.';
      } else if (error.message.includes('constraint')) {
        merchantMessage = 'Invalid inventory data. Please check the quantity and try again.';
      }
    }

    return {
      success: false,
      message: merchantMessage,
      newQuantity: 0
    };
  }
}

// Enhanced stock alert logic
async function shouldCreateStockAlert(
  currentStock: number,
  dailyVelocity: number,
  currentStatus: ProductStatus
): Promise<boolean> {
  // Don't create duplicate alerts for already critical items
  if (currentStatus === 'CRITICAL' && currentStock <= 5) {
    return false;
  }

  // Critical stock threshold
  if (currentStock <= 5) {
    return true;
  }

  // Low stock based on velocity
  if (dailyVelocity > 0) {
    const daysUntilStockout = currentStock / dailyVelocity;
    if (daysUntilStockout <= 3) {
      return true;
    }
  }

  // Trending product running low
  if (dailyVelocity > 20 && currentStock <= 20) {
    return true;
  }

  return false;
}

// Bulk inventory operations for efficiency
export async function bulkUpdateInventory(
  updates: Array<{
    inventoryItemId: string;
    locationId: string;
    newQuantity: number;
  }>,
  shopName: string,
  context: { userId?: string; reason?: string } = {}
): Promise<{
  success: boolean;
  results: InventoryUpdateResult[];
  summary: {
    totalUpdated: number;
    alertsGenerated: number;
    criticalItems: number;
  };
}> {
  const results: InventoryUpdateResult[] = [];
  let alertsGenerated = 0;
  let criticalItems = 0;

  try {
    // Process updates in batches of 10 for performance
    const batchSize = 10;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(update => 
          updateInventoryQuantityInShopifyAndDB(
            update.inventoryItemId,
            update.locationId,
            update.newQuantity,
            shopName,
            context
          )
        )
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          if (result.value.alertGenerated) alertsGenerated++;
          if (result.value.newQuantity <= 5) criticalItems++;
        } else {
          results.push({
            success: false,
            message: 'Batch update failed for this item',
            newQuantity: 0
          });
        }
      }
    }

    return {
      success: true,
      results,
      summary: {
        totalUpdated: results.filter(r => r.success).length,
        alertsGenerated,
        criticalItems
      }
    };

  } catch (error) {
    console.error('❌ Bulk inventory update failed:', error);
    
    return {
      success: false,
      results: [],
      summary: {
        totalUpdated: 0,
        alertsGenerated: 0,
        criticalItems: 0
      }
    };
  }
}

// Get comprehensive stock analysis for merchants
export async function getStockAnalysis(productId: string): Promise<StockAnalysis | null> {
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        analyticsData: {
          orderBy: { createdAt: 'desc' },
          take: 30
        }
      }
    });

    if (!product) return null;

    const analytics = product.analyticsData;
    const recentVelocity = analytics.slice(0, 7); // Last 7 days
    const olderVelocity = analytics.slice(7, 14); // Previous 7 days

    const currentVelocity = recentVelocity.length > 0
      ? recentVelocity.reduce((sum, data) => sum + (data.salesVelocity || 0), 0) / recentVelocity.length
      : 0;

    const previousVelocity = olderVelocity.length > 0
      ? olderVelocity.reduce((sum, data) => sum + (data.salesVelocity || 0), 0) / olderVelocity.length
      : 0;

    // Determine trend
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (currentVelocity > previousVelocity * 1.2) {
      trend = 'increasing';
    } else if (currentVelocity < previousVelocity * 0.8) {
      trend = 'decreasing';
    }

    const daysOfStock = currentVelocity > 0 ? product.quantity / currentVelocity : 999;
    const reorderPoint = Math.max(currentVelocity * 7, 10); // 7 days buffer
    const suggestedOrderQuantity = Math.ceil(currentVelocity * 21); // 3 weeks supply

    return {
      daysOfStock,
      status: product.status,
      reorderPoint,
      suggestedOrderQuantity,
      trend,
      velocity: currentVelocity
    };

  } catch (error) {
    console.error('❌ Stock analysis failed:', error);
    return null;
  }
}

// Export for use in other services
export { shouldCreateStockAlert };