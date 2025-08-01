import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import type { PrismaClient } from "@prisma/client";
import { calculateProductMetrics } from "~/services/product.service";

interface VariantData {
  id: string;
  title?: string;
  sku?: string;
  price?: string;
  inventory_quantity?: number;
  inventory_item_id?: string;
}

enum ProductStatus {
  Unknown = "Unknown",
  OK = "OK",
  Low = "Low",
  Critical = "Critical",
  OutOfStock = "OutOfStock"
}

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log(`📦 Product Update webhook received for shop: ${shop}`);

    if (topic !== "PRODUCTS_UPDATE") {
      console.warn(`Unexpected topic: ${topic} for products/update webhook`);
      return new Response(null, { status: 200 });
    }

    // Find shop record
    const shopRecord = await prisma.shop.findUnique({
        where: { shop },
        include: { NotificationSetting: true }
    });

    if (!shopRecord) {
      console.error(`Shop ${shop} not found during product update webhook`);
      return new Response(null, { status: 200 });
    }

    // Extract product data from payload
    const productData = payload as {
      id: string;
      title: string;
      vendor?: string;
      product_type?: string;
      tags?: string;
      variants?: Array<VariantData>;
    };

    const productGid = `gid://shopify/Product/${productData.id}`;

    // Update product in local database with transaction
    await prisma.$transaction(async (tx) => {
      // Find existing product
      const existingProduct = await tx.product.findUnique({
        where: { shopifyId: productGid },
        include: { Variant: true }
      });

      if (!existingProduct) {
        console.warn(`Product ${productGid} not found during update, creating new record`);

        // Create new product if it doesn't exist
        const product = await tx.product.create({
          data: {
            id: productGid,
            shopifyId: productGid,
            title: productData.title,
            vendor: productData.vendor || 'Unknown',
            productType: productData.product_type || null,
            tags: productData.tags ? productData.tags.split(',').map(tag => tag.trim()) : [],
            shopId: shopRecord.id,
            status: ProductStatus.Unknown,
            trending: false,
            salesVelocityFloat: 0,
            stockoutDays: null,
            updatedAt: new Date(),
          },
        });

        // Create variants for new product
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
        }
      } else {
        // Update existing product
        await tx.product.update({
      where: { id: existingProduct.id },
      data: {
        title: productData.title,
        vendor: productData.vendor || existingProduct.vendor,
        productType: productData.product_type || null,
        tags: productData.tags ? productData.tags.split(',').map(tag => tag.trim()) : existingProduct.tags,
        updatedAt: new Date(),
      },
        });

        // Handle variant updates
        if (productData.variants && productData.variants.length > 0) {
          const existingVariantIds = existingProduct.Variant.map((v: any) => v.shopifyId);
          const incomingVariantIds = productData.variants.map((v: VariantData) => `gid://shopify/ProductVariant/${v.id}`);

          // Delete variants that no longer exist
          const variantsToDelete = existingVariantIds.filter((id: any) => !incomingVariantIds.includes(id));
          if (variantsToDelete.length > 0) {
            await tx.variant.deleteMany({
              where: {
                shopifyId: { in: variantsToDelete },
              },
            });
          }

          // Update or create variants
          for (const v of productData.variants) {
            const variantGid = `gid://shopify/ProductVariant/${v.id}`;
            const existingVariant = existingProduct.Variant.find((variant: any) => variant.shopifyId === variantGid);

            if (existingVariant) {
              // Update existing variant
              await tx.variant.update({
                where: { id: existingVariant.id },
                data: {
                  title: v.title || existingVariant.title,
                  sku: v.sku || existingVariant.sku,
                  price: v.price ? parseFloat(v.price) : existingVariant.price,
                  inventoryItemId: v.inventory_item_id
                    ? `gid://shopify/InventoryItem/${v.inventory_item_id}`
                    : existingVariant.inventoryItemId,
                  updatedAt: new Date(),
                },
              });
            } else {
              // Create new variant
              await tx.variant.create({
                data: {
                  id: variantGid,
                  shopifyId: variantGid,
                  productId: existingProduct.id,
                  title: v.title || 'Default',
                  sku: v.sku || null,
                  price: v.price ? parseFloat(v.price) : 0,
                  inventoryItemId: v.inventory_item_id ? `gid://shopify/InventoryItem/${v.inventory_item_id}` : null,
                  updatedAt: new Date(),
                },
              });
            }
          }
        }

        // Recalculate product metrics for updated product
        const notificationSetting = shopRecord.NotificationSetting;
        const lowStockThreshold = notificationSetting?.[0]?.lowStockThreshold ?? shopRecord.lowStockThreshold ?? 10;
        const criticalStockThreshold = notificationSetting?.[0]?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThreshold * 0.3));
        const criticalStockoutDays = notificationSetting?.[0]?.criticalStockoutDays ?? 3;

        const shopSettings = {
          lowStockThresholdUnits: lowStockThreshold,
          criticalStockThresholdUnits: criticalStockThreshold,
          criticalStockoutDays: criticalStockoutDays,
        };

        // Get updated variants for metrics calculation
        const allVariants = await tx.variant.findMany({
          where: { productId: existingProduct.id },
        });
        // Fetch all inventory for this product
        const allInventories = await tx.inventory.findMany({
          where: { productId: existingProduct.id },
        });
        // Attach Inventory to each variant
        const variantsWithInventory = allVariants.map((v: any) => ({
          ...v,
          Inventory: allInventories.filter(inv => inv.productId === v.productId)
        }));
        const productWithVariants = {
          ...existingProduct,
          Variant: variantsWithInventory,
        };
        const metrics = calculateProductMetrics(productWithVariants, shopSettings);
        
        // Update product with new metrics
        await tx.product.update({
            where: { id: existingProduct.id },
            data: {
                status: metrics.status,
                stockoutDays: metrics.stockoutDays,
            },
        });
      }

      console.log(`✅ Successfully updated product: ${productData.title} for shop: ${shop}`);
    });

    return new Response(null, { status: 200 });

  } catch (error) {
    console.error(`❌ Product update webhook failed:`, error);
    return new Response(null, { status: 200 });
  }
};
