import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { type PrismaClient as _PrismaClient } from "@prisma/client";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);
    
    console.log(`🗑️ Product Delete webhook received for shop: ${shop}`);
    
    if (topic !== "PRODUCTS_DELETE") {
      console.warn(`Unexpected topic: ${topic} for products/delete webhook`);
      return new Response(null, { status: 200 });
    }

    // Find shop record
    const shopRecord = await prisma.shop.findUnique({
      where: { shop: shop }
    });

    if (!shopRecord) {
      console.error(`Shop ${shop} not found during product delete webhook`);
      return new Response(null, { status: 200 });
    }

    // Extract product data from payload
    const productData = payload as {
      id: string;
      title?: string;
    };

    const productGid = `gid://shopify/Product/${productData.id}`;

    // Delete product and all related data with transaction
    await prisma.$transaction(async (tx) => {
      // Find the product to be deleted
      const productToDelete = await tx.product.findUnique({
        where: { shopifyId: productGid },
        include: {
          variants: true,
          inventory: true,
        }
      });

      if (!productToDelete) {
        console.warn(`Product ${productGid} not found for deletion`);
        return;
      }

      // Delete related data in correct order (to respect foreign key constraints)
      
      // 1. Delete inventory records
      if (productToDelete.inventory.length > 0) {
        await tx.inventory.deleteMany({
          where: { productId: productToDelete.id }
        });
        console.log(`🗑️ Deleted ${productToDelete.inventory.length} inventory records`);
      }

      // 2. Delete product alerts
      const deletedAlerts = await tx.productAlert.deleteMany({
        where: { productId: productToDelete.id }
      });
      if (deletedAlerts.count > 0) {
        console.log(`🗑️ Deleted ${deletedAlerts.count} product alerts`);
      }

      // 3. Delete notification logs related to this product
      const deletedNotifications = await tx.notificationLog.deleteMany({
        where: { productId: productToDelete.id }
      });
      if (deletedNotifications.count > 0) {
        console.log(`🗑️ Deleted ${deletedNotifications.count} notification logs`);
      }

      // 4. Delete analytics data
      const deletedAnalytics = await tx.analyticsData.deleteMany({
        where: { productId: productToDelete.id }
      });
      if (deletedAnalytics.count > 0) {
        console.log(`🗑️ Deleted ${deletedAnalytics.count} analytics records`);
      }

      // 5. Delete variants
      if (productToDelete.variants.length > 0) {
        await tx.variant.deleteMany({
          where: { productId: productToDelete.id }
        });
        console.log(`🗑️ Deleted ${productToDelete.variants.length} variants`);
      }

      // 6. Finally delete the product
      await tx.product.delete({
        where: { id: productToDelete.id }
      });

      console.log(`✅ Successfully deleted product: ${productToDelete.title} (${productGid}) for shop: ${shop}`);
    });

    return new Response(null, { status: 200 });

  } catch (error) {
    console.error(`❌ Product delete webhook failed:`, error);
    
    // Log the error but still return 200 to prevent Shopify retries
    return new Response(null, { status: 200 });
  }
};