import prisma from "~/db.server";
import shopify from "~/shopify.server";
import type { ProductStatus } from "@prisma/client";

// Enhanced inventory service with comprehensive error handling and validation
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
  error?: string;
  userErrors?: Array<{ field: string[] | null; message: string; }>;
}

export interface BulkInventoryUpdateResult {
  success: boolean;
  results: InventoryUpdateResult[];
  summary: {
    totalUpdated: number;
    alertsGenerated: number;
    criticalItems: number;
    failedUpdates: number;
  };
  error?: string;
}

export interface StockAnalysis {
  daysOfStock: number;
  status: ProductStatus;
  reorderPoint: number;
  suggestedOrderQuantity: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  velocity: number;
}

// Input validation schemas
export interface InventoryUpdateInput {
  shopDomain: string;
  variantId: string;
  newQuantity: number;
  shopifyLocationGid: string;
  reason?: string;
  userId?: string;
  automated?: boolean;
}

// Validation functions
function validateInventoryInput(input: InventoryUpdateInput): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.shopDomain || typeof input.shopDomain !== 'string') {
    errors.push('Shop domain is required and must be a string');
  }

  if (!input.variantId || typeof input.variantId !== 'string') {
    errors.push('Variant ID is required and must be a string');
  }

  if (typeof input.newQuantity !== 'number') {
    errors.push('New quantity must be a number');
  } else if (input.newQuantity < 0) {
    errors.push('New quantity cannot be negative');
  } else if (input.newQuantity > 1000000) {
    errors.push('New quantity cannot exceed 1,000,000 units');
  } else if (!Number.isInteger(input.newQuantity)) {
    errors.push('New quantity must be a whole number');
  }

  if (!input.shopifyLocationGid || typeof input.shopifyLocationGid !== 'string') {
    errors.push('Shopify location ID is required and must be a string');
  }

  return { isValid: errors.length === 0, errors };
}

// Enhanced restock calculation with merchant insights
export function calculateRestock(
  currentStock: number,
  dailyVelocity: number,
  price: number,
  leadTimeDays: number = 7,
  bufferDays: number = 14
): InventoryUpdateResult['suggestedRestock'] {
  // Validate inputs
  if (currentStock < 0 || dailyVelocity < 0 || price < 0) {
    return {
      quantity: 50,
      urgency: 'low',
      estimatedCost: 50 * Math.max(price, 1)
    };
  }

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
    quantity: Math.max(suggestedQuantity, 10), // Minimum 10 units
    urgency,
    estimatedCost: Math.max(suggestedQuantity, 10) * price
  };
}

// Retry logic with exponential backoff
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Check if it's a retryable error
      const isRetryable = 
        error instanceof Error && (
          error.message.includes('timeout') ||
          error.message.includes('network') ||
          error.message.includes('connection') ||
          error.message.includes('rate limit') ||
          error.message.includes('429')
        );
      
      if (!isRetryable) {
        throw error;
      }
      
      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      console.log(`Retrying operation (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms delay`);
    }
  }
  
  throw lastError!;
}

// Enhanced inventory update with comprehensive error handling
export async function updateInventoryQuantityInShopifyAndDB(
  shopDomain: string,
  variantId: string,
  newQuantity: number,
  shopifyLocationGid: string,
  context: {
    reason?: string;
    userId?: string;
    automated?: boolean;
  } = {}
): Promise<InventoryUpdateResult> {
  const input: InventoryUpdateInput = {
    shopDomain,
    variantId,
    newQuantity,
    shopifyLocationGid,
    ...context
  };

  // Step 1: Input validation
  const validation = validateInventoryInput(input);
  if (!validation.isValid) {
    return {
      success: false,
      message: 'Invalid input data provided.',
      newQuantity: 0,
      error: validation.errors.join(', '),
    };
  }

  try {
    // Step 2: Get shop session for Shopify API
    let shop = await prisma.shop.findUnique({
      where: { shop: shopDomain },
      include: { }
    });
    if (!shop) {
      shop = await prisma.shop.create({ data: { shop: shopDomain, updatedAt: new Date() } });
    }

    const session = await prisma.session.findFirst({ where: { shopId: shop.id, isOnline: false } });

    // Step 3: Database transaction with Shopify API call
    const result = await withRetry(async () => {
      return await prisma.$transaction(async (tx) => {
        // Get current product data
        const variant = await tx.variant.findUnique({
          where: { id: variantId },
          include: {
            Product: {
              include: {
                Variant: { select: { inventoryQuantity: true } },
                Shop: { include: { NotificationSettings: true } }
              }
            }
          }
        });

        if (!variant) {
          throw new Error(`VARIANT_NOT_FOUND: Variant with ID ${variantId} not found in your inventory system.`);
        }

        if (!variant.inventoryItemId) {
          throw new Error(`INVENTORY_ITEM_MISSING: This product variant is not set up for inventory tracking in Shopify.`);
        }

        const previousQuantity = variant.inventoryQuantity || 0;
        const product = variant.Product;

        // Step 4: Update inventory in Shopify first
        const client = new (shopify as any).clients.Graphql({ 
          session: {
            ...session,
            shop: shopDomain,
            accessToken: session?.accessToken || "",
            expires: session?.expires,
            isOnline: session?.isOnline || false,
            scope: session?.scope || "",
            state: session?.state || "",
          }
        });

        const inventoryAdjustMutation = `
          mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
            inventoryAdjustQuantities(input: $input) {
              inventoryAdjustmentGroup {
                id
                reason
                createdAt
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const response = await client.query({
          data: {
            query: inventoryAdjustMutation,
            variables: {
              input: {
                reason: context.reason || 'Inventory management via Planet Beauty AI',
                name: `Adjustment-${Date.now()}`,
                changes: [
                  {
                    delta: newQuantity - previousQuantity,
                    inventoryItemId: variant.inventoryItemId,
                    locationId: shopifyLocationGid,
                  }
                ]
              }
            }
          }
        });

        if (response.body.errors && response.body.errors.length > 0) {
          throw new Error(`SHOPIFY_API_ERROR: ${response.body.errors[0].message}`);
        }

        const adjustmentData = response.body.data?.inventoryAdjustQuantities;
        if (adjustmentData?.userErrors && adjustmentData.userErrors.length > 0) {
          return {
            success: false,
            message: 'Shopify rejected the inventory update.',
            newQuantity: previousQuantity,
            error: 'SHOPIFY_VALIDATION_ERROR',
            userErrors: adjustmentData.userErrors,
          };
        }

        // Step 5: Update local database
        await tx.variant.update({
          where: { id: variantId },
          data: {
            inventoryQuantity: newQuantity,
            updatedAt: new Date(),
          }
        });

        // Step 6: Update inventory record
        const warehouse = await tx.warehouse.findFirst({
          where: { shopifyLocationGid: shopifyLocationGid }
        });

        if (warehouse) {
          await tx.inventory.upsert({
            where: {
              productId_warehouseId: {
                productId: product.id,
                warehouseId: warehouse.id,
              }
            },
            update: {
              quantity: newQuantity,
              updatedAt: new Date(),
            },
            create: {
              id: product.id,
              productId: product.id,
              warehouseId: warehouse.id,
              quantity: newQuantity,
              updatedAt: new Date(),
            }
          });
        }

        // Step 7: Recalculate product metrics
        const notificationSettings = product.Shop.NotificationSettings?.[0];
        const lowStockThreshold = notificationSettings?.lowStockThreshold ?? product.Shop.lowStockThreshold ?? 10;
        const criticalStockThreshold = notificationSettings?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThreshold * 0.3));

        let newStatus: ProductStatus = product.status || 'Unknown';
        if (newQuantity <= criticalStockThreshold) {
          newStatus = 'Critical';
        } else if (newQuantity <= lowStockThreshold) {
          newStatus = 'Low';
        } else {
          newStatus = 'OK';
        }

        // Update product with new status
        await tx.product.update({
          where: { id: product.id },
          data: {
            status: newStatus,
            updatedAt: new Date(),
          },
        });

        // Step 8: Check if alert should be generated
        const shouldGenerateAlert = newStatus === 'Critical' || newStatus === 'Low';
        let alertGenerated = false;

        if (shouldGenerateAlert) {
          const existingAlert = await tx.productAlert.findFirst({
            where: {
              productId: product.id,
              type: newStatus === 'Critical' ? 'CRITICAL_STOCK' : 'LOW_STOCK',
              isActive: true,
            }
          });

          if (!existingAlert) {
            await tx.productAlert.create({
              data: {
                id: product.id,
                productId: product.id,
                type: newStatus === 'Critical' ? 'CRITICAL_STOCK' : 'LOW_STOCK',
                message: `${product.title} stock level updated to ${newQuantity} units. This is considered ${newStatus.toLowerCase()} stock.`,
                updatedAt: new Date(),
              }
            });
            alertGenerated = true;
          }
        }

        // Step 9: Calculate restock suggestion
        const dailyVelocity = product.salesVelocityFloat || 0;
        const suggestedRestock = calculateRestock(
          newQuantity,
          dailyVelocity,
          Number(variant.price || 0)
        );

        return {
          success: true,
          message: `Successfully updated ${product.title} inventory to ${newQuantity} units.`,
          previousQuantity,
          newQuantity,
          product: {
            id: product.id,
            title: product.title,
            handle: product.handle || product.title.toLowerCase().replace(/\s+/g, '-')
          } as any,
          alertGenerated,
          suggestedRestock
        };
      });
    });

    return result;

  } catch (error) {
    console.error('❌ Inventory update failed:', error);
    
    // Provide user-friendly error messages
    let userMessage = 'Failed to update inventory. Please try again.';
    let errorCode = 'UNKNOWN_ERROR';
    
    if (error instanceof Error) {
      if (error.message.includes('VARIANT_NOT_FOUND')) {
        userMessage = 'Product variant not found in your inventory system. Please refresh the page and try again.';
        errorCode = 'VARIANT_NOT_FOUND';
      } else if (error.message.includes('INVENTORY_ITEM_MISSING')) {
        userMessage = 'This product is not set up for inventory tracking in Shopify. Please check your Shopify product settings.';
        errorCode = 'INVENTORY_ITEM_MISSING';
      } else if (error.message.includes('SHOPIFY_API_ERROR')) {
        userMessage = 'Shopify rejected the inventory update. Please check your permissions and try again.';
        errorCode = 'SHOPIFY_API_ERROR';
      } else if (error.message.includes('SHOP_SESSION_NOT_FOUND')) {
        userMessage = 'Unable to connect to your Shopify store. Please reinstall the app.';
        errorCode = 'SHOP_SESSION_NOT_FOUND';
      } else if (error.message.includes('timeout')) {
        userMessage = 'The update is taking longer than expected. Please check if it completed and try again if needed.';
        errorCode = 'TIMEOUT_ERROR';
      } else if (error.message.includes('rate limit')) {
        userMessage = 'Too many requests. Please wait a moment and try again.';
        errorCode = 'RATE_LIMIT_ERROR';
      }
    }

    return {
      success: false,
      message: userMessage,
      newQuantity: 0,
      error: errorCode,
    };
  }
}

// Bulk inventory operations with improved error handling
export async function bulkUpdateInventory(
  updates: Array<{
    variantId: string;
    newQuantity: number;
    shopifyLocationGid?: string;
  }>,
  shopDomain: string,
  context: { userId?: string; reason?: string } = {}
): Promise<BulkInventoryUpdateResult> {
  if (!updates || updates.length === 0) {
    return {
      success: false,
      results: [],
      summary: { totalUpdated: 0, alertsGenerated: 0, criticalItems: 0, failedUpdates: 0 },
      error: 'No updates provided'
    };
  }

  if (updates.length > 100) {
    return {
      success: false,
      results: [],
      summary: { totalUpdated: 0, alertsGenerated: 0, criticalItems: 0, failedUpdates: 0 },
      error: 'Cannot process more than 100 updates at once'
    };
  }

  const results: InventoryUpdateResult[] = [];
  let alertsGenerated = 0;
  let criticalItems = 0;
  let failedUpdates = 0;

  try {
    // Get default location if not provided
    const defaultLocation = await prisma.warehouse.findFirst({
      where: { Shop: { shop: shopDomain } }
    });

    // Process updates in batches of 10 for performance and rate limiting
    const batchSize = 10;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map((update) => 
          updateInventoryQuantityInShopifyAndDB(
            shopDomain,
            update.variantId,
            update.newQuantity,
            update.shopifyLocationGid || defaultLocation?.shopifyLocationGid || '',
            context
          )
        )
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          if (result.value.alertGenerated) alertsGenerated++;
          if (result.value.newQuantity <= 5) criticalItems++;
          if (!result.value.success) failedUpdates++;
        } else {
          results.push({
            success: false,
            message: 'Batch update failed for this item',
            newQuantity: 0,
            error: result.reason?.message || 'Unknown error'
          });
          failedUpdates++;
        }
      }

      // Add delay between batches to respect rate limits
      if (i + batchSize < updates.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return {
      success: failedUpdates < updates.length / 2, // Success if less than 50% failed
      results,
      summary: {
        totalUpdated: results.filter((r) => r.success).length,
        alertsGenerated,
        criticalItems,
        failedUpdates
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
        criticalItems: 0,
        failedUpdates: updates.length
      },
      error: 'Bulk update operation failed completely'
    };
  }
}

// Get comprehensive stock analysis for merchants
export async function getStockAnalysis(productId: string): Promise<StockAnalysis | null> {
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        AnalyticsData: {
          orderBy: { date: 'desc' },
          take: 30
        }
      }
    });

    if (!product) return null;

    const analytics = product.AnalyticsData;
    const recentVelocity = analytics.slice(0, 7); // Last 7 days
    const olderVelocity = analytics.slice(7, 14); // Previous 7 days

    const currentVelocity = recentVelocity.length > 0
      ? recentVelocity.reduce((sum: number, data: any) => sum + (data.salesVelocity || 0), 0) / recentVelocity.length
      : 0;

    const previousVelocity = olderVelocity.length > 0
      ? olderVelocity.reduce((sum: number, data: any) => sum + (data.salesVelocity || 0), 0) / olderVelocity.length
      : 0;

    // Determine trend
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (currentVelocity > previousVelocity * 1.2) {
      trend = 'increasing';
    } else if (currentVelocity < previousVelocity * 0.8) {
      trend = 'decreasing';
    }

    const daysOfStock = currentVelocity > 0 && product.quantity ? product.quantity / currentVelocity : 999;
    const reorderPoint = Math.max(currentVelocity * 7, 10); // 7 days buffer
    const suggestedOrderQuantity = Math.ceil(currentVelocity * 21); // 3 weeks supply

    return {
      daysOfStock,
      status: product.status || 'Unknown',
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