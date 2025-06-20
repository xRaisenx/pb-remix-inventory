import type { ActionFunctionArgs } from "@remix-run/node";
// Update the import path below if your shopify.server file is in a different directory
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export async function action({ request }: ActionFunctionArgs) {
  // The `authenticate.webhook` method verifies the HMAC signature of the incoming webhook
  // and extracts the topic, shop domain, and webhook ID.
  // It will throw an error if the webhook is invalid (e.g., HMAC mismatch),
  // which will result in Shopify attempting to resend the webhook.
  const { topic, shop, webhookId /*, payload, apiVersion */ } = await authenticate.webhook(request);
  // `payload` and `apiVersion` are also available if needed.

  // Log the incoming webhook for observability and debugging
  console.log(`Webhook received: topic=${topic}, shop=${shop}, webhookId=${webhookId}`);

  try {
    // Handle specific webhook topics. It's crucial to compare topics carefully.
    // Shopify sends topics like 'APP_UNINSTALLED'.
    if (topic === "APP_UNINSTALLED") {
      // Find the shop record in your database using the shop domain
      const shopRecord = await prisma.shop.findUnique({
        where: { shop: shop },
      });

      if (shopRecord) {
        // If the shop exists, delete its data.
        // Depending on your schema, you might also need to delete related data
        // (e.g., sessions, products, inventory) or rely on cascading deletes.
        await prisma.shop.delete({
          where: { shop: shop },
        });
        console.log(`Shop data deleted for ${shop} due to app uninstall.`);

        // Additionally, if you store sessions in Prisma, you might want to clean them up too,
        // though `PrismaSessionStorage` might handle this if shopId is part of the session ID
        // or if you have cascading deletes. For explicit cleanup:
        // await prisma.session.deleteMany({ where: { shop: shop } });
        // console.log(`Sessions deleted for ${shop}.`);

      } else {
        console.log(`Shop ${shop} not found in database during APP_UNINSTALLED webhook processing.`);
      }
    } else {
      // Log unhandled topics, but still acknowledge receipt to Shopify.
      console.log(`Received webhook for unhandled topic '${topic}' for shop ${shop}.`);
    }

    // Always return a 200 OK response to Shopify to acknowledge receipt of the webhook.
    // Failure to do so will cause Shopify to retry sending the webhook.
    return new Response(null, { status: 200 });

  } catch (error: any) {
    // Log any errors that occur during webhook processing.
    console.error(`Error processing '${topic}' webhook for shop ${shop}:`, error.message, error.stack);

    // Return a 500 Internal Server Error. Shopify will likely retry sending the webhook.
    // Avoid returning a 401 Unauthorized unless the error is specifically about
    // the webhook's authentication failing at a deeper level than HMAC (which
    // `authenticate.webhook` already handles).
    return new Response(
      JSON.stringify({
        message: "Error processing webhook",
        errorDetail: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// Note: A webhook route typically does not need a `loader` function
// as it's not meant to be accessed via GET requests by a browser.
// If you had a loader from the NEW file:
//
// import type { LoaderFunctionArgs } from "@remix-run/node";
// export const loader = async ({ request }: LoaderFunctionArgs) => {
//   // This would typically be for a UI page, not a webhook endpoint.
//   // If this route *only* handles webhooks, this loader is not needed
//   // and might even cause issues if Shopify attempts a GET request here.
//   console.log("GET request to webhook endpoint, this is unusual.");
//   // await authenticate.admin(request); // Not applicable for webhook verification
//   return new Response("This endpoint is for Shopify webhooks (POST requests).", { status: 405 }); // Method Not Allowed
// };