import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import type { PrismaClient } from "@prisma/client";


export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);
    
    console.log(`🛒 Order Create webhook received for shop: ${shop}`);
    
    if (topic !== "ORDERS_CREATE") {
      console.warn(`Unexpected topic: ${topic} for orders/create webhook`);
      return new Response(null, { status: 200 });
    }

    // Find shop record
    const shopRecord = await prisma.shop.findUnique({
      where: { shop: shop }
    });

    if (!shopRecord) {
      console.error(`Shop ${shop} not found during order create webhook`);
      return new Response(null, { status: 200 });
    }

    // Extract order data from payload
    const orderData = payload as {
      id: string;
      name: string;
      email?: string;
      total_price: string;
      subtotal_price: string;
      created_at: string;
      financial_status: string;
      fulfillment_status?: string;
      line_items: Array<{
        id: string;
        product_id?: string;
        variant_id?: string;
        title: string;
        quantity: number;
        price: string;
        sku?: string;
      }>;
    };

    // Process order line items to update product sales data
await prisma.$transaction(async (prisma) => {
      // Process each line item to update product sales data
      for (const lineItem of orderData.line_items) {
        if (lineItem.product_id && lineItem.variant_id) {
          const productGid = `gid://shopify/Product/${lineItem.product_id}`;
          const variantGid = `gid://shopify/ProductVariant/${lineItem.variant_id}`;

          // Find the product and variant
          const product = await prisma.product.findUnique({
            where: { shopifyId: productGid }
          });

          const variant = await prisma.variant.findUnique({
            where: { shopifyId: variantGid }
          });

          if (product && variant) {
            // Update product sales velocity
            const currentSalesVelocity = product.salesVelocityFloat || 0;
            const newSalesVelocity = currentSalesVelocity + (lineItem.quantity / 30); // Daily velocity

            await prisma.product.update({
              where: { id: product.id },
              data: {
                salesVelocityFloat: newSalesVelocity,
                updatedAt: new Date(),
              },
            });

            // Create analytics data point for this sale
            await prisma.analyticsData.create({
              data: {
                id: product.id,
                productId: product.id,
                salesVelocity: newSalesVelocity,
                unitsSold: lineItem.quantity,
                revenue: lineItem.quantity * parseFloat(lineItem.price),
                date: new Date(orderData.created_at),
                updatedAt: new Date(),
              },
            });

            console.log(`📈 Updated sales data for product: ${product.title} (+${lineItem.quantity} units)`);
          } else {
            console.warn(`Product or variant not found for line item: ${lineItem.title}`);
          }
        }
      }

      console.log(`✅ Successfully processed order: ${orderData.name} with ${orderData.line_items.length} items`);
    });

    return new Response(null, { status: 200 });

  } catch (error) {
    console.error(`❌ Order create webhook failed:`, error);
    return new Response(null, { status: 200 });
  }
};
