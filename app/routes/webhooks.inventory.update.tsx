import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { type PrismaClient as _PrismaClient } from "@prisma/client";
import { calculateProductMetrics } from "~/services/product.service";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);
    
    console.log(`📦 Inventory Update webhook received for shop: ${shop}`);
    
    if (topic !== "INVENTORY_LEVELS_UPDATE") {
      console.warn(`Unexpected topic: ${topic} for inventory/update webhook`);
      return new Response(null, { status: 200 });
    }

    // Find shop record
    const shopRecord = await prisma.shop.findUnique({
      where: { shop: shop },
      include: { NotificationSettings: true }
    });

    if (!shopRecord) {
      console.error(`Shop ${shop} not found during inventory update webhook`);
      return new Response(null, { status: 200 });
    }

    // Extract inventory data from payload
    const inventoryData = payload as {
      inventory_item_id: string;
      location_id: string;
      available: number;
      updated_at: string;
    };

    const inventoryItemGid = `gid://shopify/InventoryItem/${inventoryData.inventory_item_id}`;
    const locationGid = `gid://shopify/Location/${inventoryData.location_id}`;

    // Update inventory in local database with transaction
    await prisma.$transaction(async (tx) => {
      // Find the variant associated with this inventory item
      const variant = await tx.variant.findFirst({
        where: { inventoryItemId: inventoryItemGid },
        include: {
          product: {
            include: {
              variants: { select: { inventoryQuantity: true } }
            }
          }
        }
      });

      if (!variant) {
        console.warn(`Variant with inventory item ${inventoryItemGid} not found`);
        return;
      }

      // Find the warehouse/location
      const warehouse = await tx.warehouse.findFirst({
        where: { shopifyLocationGid: locationGid }
      });

      if (!warehouse) {
        console.warn(`Warehouse with location ${locationGid} not found`);
        return;
      }

      // Update variant inventory quantity
      await tx.variant.update({
        where: { id: variant.id },
        data: {
          inventoryQuantity: inventoryData.available,
          updatedAt: new Date(inventoryData.updated_at),
        }
      });

      // Update or create inventory record for this product/warehouse combination
      await tx.inventory.upsert({
        where: {
          productId_warehouseId: {
            productId: variant.product.id,
            warehouseId: warehouse.id,
          }
        },
        update: {
          quantity: inventoryData.available,
          updatedAt: new Date(inventoryData.updated_at),
        },
        create: {
          productId: variant.product.id,
          warehouseId: warehouse.id,
          quantity: inventoryData.available,
        }
      });

      // Recalculate product metrics with new inventory levels
      const notificationSettings = shopRecord.NotificationSettings;
      const lowStockThreshold = notificationSettings?.lowStockThreshold ?? shopRecord.lowStockThreshold ?? 10;
      const criticalStockThreshold = notificationSettings?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThreshold * 0.3));
      const criticalStockoutDays = notificationSettings?.criticalStockoutDays ?? 3;

      const shopSettings = {
        lowStockThresholdUnits: lowStockThreshold,
        criticalStockThresholdUnits: criticalStockThreshold,
        criticalStockoutDays: criticalStockoutDays,
      };

      // Get all variants for this product to calculate total inventory
      const allVariants = await tx.variant.findMany({
        where: { productId: variant.product.id },
        select: { inventoryQuantity: true }
      });

      const productWithUpdatedVariants = {
        ...variant.product,
        variants: allVariants,
      };

      const metrics = calculateProductMetrics(productWithUpdatedVariants, shopSettings);
      const previousStatus = variant.product.status;
      
      // Update product with new metrics
      await tx.product.update({
        where: { id: variant.product.id },
        data: {
          status: metrics.status,
          stockoutDays: metrics.stockoutDays,
          updatedAt: new Date(),
        },
      });

      // Check if we need to create an alert for status change
      if (previousStatus !== metrics.status && 
          (metrics.status === 'Low' || metrics.status === 'Critical')) {
        
        const alertType = metrics.status === 'Critical' ? 'CRITICAL_STOCK' : 'LOW_STOCK';
        const _severity = metrics.status === 'Critical' ? 'CRITICAL' : 'MEDIUM';
        
        // Check if similar alert already exists and is active
        const existingAlert = await tx.productAlert.findFirst({
          where: {
            productId: variant.product.id,
            alertType: alertType,
            isActive: true,
          }
        });

        if (!existingAlert) {
          await tx.productAlert.create({
            data: {
              productId: variant.product.id,
              alertType: alertType,
              message: `${variant.product.title} stock level is now ${metrics.status.toLowerCase()}. Current inventory: ${inventoryData.available} units.`,
              isActive: true,
            }
          });
          
          console.log(`🚨 Created ${alertType} alert for product: ${variant.product.title}`);
        }
      }

      console.log(`✅ Successfully updated inventory for ${variant.product.title}: ${inventoryData.available} units at location ${locationGid}`);
    });

    return new Response(null, { status: 200 });

  } catch (error) {
    console.error(`❌ Inventory update webhook failed:`, error);
    return new Response(null, { status: 200 });
  }
};