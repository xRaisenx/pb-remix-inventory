// app/routes/api.product-details.$productId.ts
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import type { ProductForTable } from "~/routes/app.products"; // Import the target type

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request); // Ensures the request is authenticated
  const shopifyProductId = params.productId;

  if (!shopifyProductId || !shopifyProductId.startsWith("gid://shopify/Product/")) {
    return json({ error: "Invalid Shopify Product ID format." }, { status: 400 });
  }

  try {
    // Fetch the product from your local database using the unique Shopify ID
    const productFromDB = await prisma.product.findUnique({
      where: { shopifyId: shopifyProductId },
      include: {
        variants: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, shopifyId: true, title: true, sku: true, price: true, inventoryQuantity: true, inventoryItemId: true }
        },
        inventory: {
          select: { quantity: true, warehouseId: true, warehouse: { select: { shopifyLocationGid: true } } }
        },
        // Assuming shop relation is not needed here as authenticate.admin(request) handles shop context
        // If shop-specific settings are needed (e.g. for metric calculation context not done here), include shop.
      },
    });

    if (!productFromDB) {
      return json({ error: "Product not found in local database." }, { status: 404 });
    }

    // Construct the full ProductForTable object, similar to the app.products loader
    // This logic should ideally be shared or kept consistent with how ProductForTable is constructed elsewhere.
    const totalInventory = productFromDB.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
    const firstVariant = productFromDB.variants?.[0];

    const inventoryByLocation = productFromDB.inventory.reduce((acc, inv) => {
      // Ensure warehouse and shopifyLocationGid exist to prevent runtime errors
      if (inv.warehouse && inv.warehouse.shopifyLocationGid) {
        acc[inv.warehouseId] = {
          quantity: inv.quantity,
          shopifyLocationGid: inv.warehouse.shopifyLocationGid
        };
      } else if (inv.warehouse) { // Local warehouse without Shopify link
         acc[inv.warehouseId] = {
           quantity: inv.quantity,
           shopifyLocationGid: null // Explicitly null
         };
      }
      return acc;
    }, {} as ProductForTable['inventoryByLocation']);

    const productForTable: ProductForTable = {
      id: productFromDB.id, // Prisma Product ID
      shopifyId: productFromDB.shopifyId, // Shopify Product GID
      title: productFromDB.title,
      vendor: productFromDB.vendor || "",
      price: firstVariant?.price?.toString() ?? '0.00',
      sku: firstVariant?.sku ?? 'N/A',
      inventory: totalInventory, // This is total across locations IF 'inventory' field means that.
                                 // Or it could be total of variant.inventoryQuantity if that's the source of truth for "overall"
      salesVelocity: productFromDB.salesVelocityFloat, // From Prisma model
      stockoutDays: productFromDB.stockoutDays,       // From Prisma model
      status: productFromDB.status,                   // From Prisma model
      variantsForModal: productFromDB.variants.map(v => ({
        id: v.id, // Prisma Variant ID
        shopifyVariantId: v.shopifyId ?? '', // Shopify Variant GID
        title: v.title ?? v.sku ?? 'Variant', // Fallback for variant title
        sku: v.sku,
        price: v.price?.toString(),
        inventoryQuantity: v.inventoryQuantity, // Total for this variant
        inventoryItemId: v.inventoryItemId,     // Shopify InventoryItem GID
      })),
      inventoryByLocation: inventoryByLocation,
    };

    // Return the complete object under the "product" key as per user's last snippet for app.inventory.tsx
    return json({ product: productForTable });

  } catch (error) {
    console.error("Error fetching product details for modal:", error);
    // It's good practice to not expose raw error messages in production if they might contain sensitive info
    return json({ error: "An unexpected error occurred while fetching product details." }, { status: 500 });
  }
};
