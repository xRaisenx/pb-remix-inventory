import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import type { PrismaClient } from "@prisma/client";


export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);
    
    console.log(`💰 Order Paid webhook received for shop: ${shop}`);
    
    if (topic !== "ORDERS_PAID") {
      console.warn(`Unexpected topic: ${topic} for orders/paid webhook`);
      return new Response(null, { status: 200 });
    }

    // Find shop record
    const shopRecord = await prisma.shop.findUnique({
      where: { shop: shop },
      include: { NotificationSetting: true }
    });

    if (!shopRecord) {
      console.error(`Shop ${shop} not found during order paid webhook`);
      return new Response(null, { status: 200 });
    }

    // Extract order data from payload
    const orderData = payload as {
      id: string;
      name: string;
      total_price: string;
      created_at: string;
      line_items: Array<{
        id: string;
        product_id?: string;
        variant_id?: string;
        title: string;
        quantity: number;
        price: string;
      }>;
    };

    // Process paid order to update trending status
    await prisma.$transaction(async (tx) => {
      const notificationSetting = shopRecord.NotificationSetting;
      const salesVelocityThreshold = notificationSetting?.salesVelocityThreshold ?? 25.0;

      // Process each line item to check for trending products
      for (const lineItem of orderData.line_items) {
        if (lineItem.product_id) {
          const productGid = `gid://shopify/Product/${lineItem.product_id}`;

          // Find the product
          const product = await tx.product.findUnique({
            where: { shopifyId: productGid }
          });

          if (product) {
            // Check if product should be marked as trending based on sales velocity
            const shouldBeTrending = (product.salesVelocityFloat || 0) > salesVelocityThreshold;
            
            if (shouldBeTrending !== product.trending) {
              await tx.product.update({
                where: { id: product.id },
                data: {
                  trending: shouldBeTrending,
                  updatedAt: new Date(),
                },
              });

              if (shouldBeTrending) {
                console.log(`🔥 Product now trending: ${product.title} (velocity: ${product.salesVelocityFloat})`);
                
                // Create a trending alert if it's a significant trend
                if ((product.salesVelocityFloat || 0) > salesVelocityThreshold * 2) {
                  // Product alert logic removed; implement alerting as needed
                }
              }
            }

            // Update analytics with confirmed sale data
            await tx.analyticsData.create({
              data: {
                id: product.id,
                productId: product.id,
                salesVelocity: product.salesVelocityFloat || 0,
                unitsSold: lineItem.quantity,
                revenue: lineItem.quantity * parseFloat(lineItem.price),
                date: new Date(orderData.created_at),
                updatedAt: new Date(),
              } as any,
            });

            console.log(`✅ Updated trending status for product: ${product.title} (trending: ${shouldBeTrending})`);
          }
        }
      }

      console.log(`💰 Successfully processed paid order: ${orderData.name}`);
    });

    return new Response(null, { status: 200 });

  } catch (error) {
    console.error(`❌ Order paid webhook failed:`, error);
    return new Response(null, { status: 200 });
  }
};
