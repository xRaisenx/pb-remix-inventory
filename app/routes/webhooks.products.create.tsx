import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

import { calculateProductMetrics } from "~/services/product.service";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);
    
    console.log(`📦 Product Create webhook received for shop: ${shop}`);
    
    if (topic !== "PRODUCTS_CREATE") {
      console.warn(`Unexpected topic: ${topic} for products/create webhook`);
      return new Response(null, { status: 200 });
    }

    // Find shop record
    const shopRecord = await prisma.shop.findUnique({
      where: { shop: shop },
      include: { NotificationSetting: true }
    });

    if (!shopRecord) {
      console.error(`Shop ${shop} not found during product create webhook`);
      return new Response(null, { status: 200 }); // Still return 200 to acknowledge
    }

    // Extract product data from payload
    const productData = payload as {
      id: string;
      title: string;
      vendor?: string;
      product_type?: string;
      tags?: string;
      variants?: Array<{
        id: string;
        title?: string;
        sku?: string;
        price?: string;
        inventory_quantity?: number;
        inventory_item_id?: string;
      }>;
    };

    // Create product in local database with transaction
    await prisma.$transaction(async (tx) => {
      // Create product
      const product = await tx.product.create({
        data: {
          id: productData.id,
          shopifyId: productData.id,
          title: productData.title,
          vendor: productData.vendor || 'Unknown',
          productType: productData.product_type,
          tags: productData.tags ? productData.tags.split(',').map(tag => tag.trim()) : [],
          shopId: shopRecord.id,
          status: "Unknown",
          trending: false,
          salesVelocityFloat: 0,
          stockoutDays: null,
          updatedAt: new Date(),
        },
      });

      // Create variants if they exist
      if (productData.variants && productData.variants.length > 0) {
        for (const variantData of productData.variants) {
          await tx.variant.create({
            data: {
              id: `gid://shopify/ProductVariant/${variantData.id}`,
              shopifyId: `gid://shopify/ProductVariant/${variantData.id}`,
              productId: product.id,
              title: variantData.title || 'Default',
              sku: variantData.sku || null,
              price: variantData.price ? parseFloat(variantData.price) : 0,
              inventoryItemId: variantData.inventory_item_id ? `gid://shopify/InventoryItem/${variantData.inventory_item_id}` : null,
              updatedAt: new Date(),
            },
          });
        }

        // Calculate initial product metrics
        const notificationSettings = shopRecord.NotificationSetting;
        const lowStockThreshold = notificationSettings?.[0]?.lowStockThreshold ?? shopRecord.lowStockThreshold ?? 10;
        const criticalStockThreshold = notificationSettings?.[0]?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThreshold * 0.3));
        const criticalStockoutDays = notificationSettings?.[0]?.criticalStockoutDays ?? 3;

        const shopSettings = {
          lowStockThresholdUnits: lowStockThreshold,
          criticalStockThresholdUnits: criticalStockThreshold,
          criticalStockoutDays: criticalStockoutDays,
        };

        // Fetch all variants with Inventory for metrics calculation
        const allVariants = await tx.variant.findMany({
          where: { productId: product.id },
          // No Inventory include, fetch separately if needed
        });

        const productWithVariants = {
          ...product,
          Variant: allVariants,
        };

        const metrics = calculateProductMetrics(productWithVariants as any, shopSettings);

        // Update product with calculated metrics
        await tx.product.update({
          where: { id: product.id },
          data: {
            status: metrics.status,
            stockoutDays: metrics.stockoutDays,
          },
        });
      }

      console.log(`✅ Successfully created product: ${productData.title} for shop: ${shop}`);
    });

    return new Response(null, { status: 200 });

  } catch (error) {
    console.error(`❌ Product create webhook failed:`, error);
    
    // Return 200 to prevent Shopify from retrying, but log the error
    // We don't want to cause Shopify to repeatedly retry on our errors
    return new Response(null, { status: 200 });
  }
};
