import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
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
      include: { NotificationSetting: true }
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
          Product: true
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

      // Update or create inventory record for this variant/warehouse combination
      await tx.inventory.upsert({
        where: {
          productId_warehouseId: {
            productId: variant.productId,
            warehouseId: warehouse.id,
          }
        },
        update: {
          quantity: inventoryData.available,
          updatedAt: new Date(inventoryData.updated_at),
        },
        create: {
          id: `${variant.productId}_${warehouse.id}`,
          productId: variant.productId,
          warehouseId: warehouse.id,
          quantity: inventoryData.available,
          updatedAt: new Date(inventoryData.updated_at),
        }
      });

      // Recalculate product metrics with new inventory levels
      const notificationSettings = shopRecord.NotificationSetting?.[0];
      const lowStockThreshold = notificationSettings?.lowStockThreshold ?? shopRecord.lowStockThreshold ?? 10;
      const criticalStockThreshold = notificationSettings?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThreshold * 0.3));
      const criticalStockoutDays = notificationSettings?.criticalStockoutDays ?? 3;

      const shopSettings = {
        lowStockThresholdUnits: lowStockThreshold,
        criticalStockThresholdUnits: criticalStockThreshold,
        criticalStockoutDays: criticalStockoutDays,
      };

      // Get all inventory for this product's variants
      const allVariants = await tx.variant.findMany({
        where: { productId: variant.productId },
      });

      const productWithUpdatedVariants = {
        ...variant.Product,
        Variant: allVariants,
      };

      const metrics = calculateProductMetrics(productWithUpdatedVariants as any, shopSettings);

      // Update product with new metrics
      await tx.product.update({
        where: { id: variant.productId },
        data: {
          status: metrics.status,
          stockoutDays: metrics.stockoutDays,
          updatedAt: new Date(),
        },
      });

      // Log update
      console.log(`✅ Successfully updated inventory for ${variant.Product.title}: ${inventoryData.available} units at location ${locationGid}`);
    });

    return new Response(null, { status: 200 });

  } catch (error) {
    console.error(`❌ Inventory update webhook failed:`, error);
    return new Response(null, { status: 200 });
  }
};
