```markdown
# Database Queries

This document lists notable database queries found in the codebase, primarily using Prisma.

## app/cron/dailyAnalysis.ts

- Fetch shops for daily tasks:
  ```typescript
  await prisma.shop.findMany({
    where: { initialSyncCompleted: true },
    include: { notificationSettings: true },
  });
  ```

- Fetch offline session for a shop:
  ```typescript
  await prisma.session.findFirst({
    where: { shop: shop.shop, isOnline: false, accessToken: { not: null } },
    orderBy: { expires: 'desc' },
  });
  ```

## app/dailyAnalysis.ts

- Fetch shop ID:
  ```typescript
  await prisma.shop.findUnique({ where: { shop: shopDomain } })
  ```

- Upsert product during sync:
  ```typescript
  await prisma.product.upsert({
    where: { shopifyId: sp.id },
    create: {
      shopifyId: sp.id,
      title: sp.title,
      vendor: sp.vendor ?? 'Unknown Vendor',
      shopId: shopId,
    },
    update: {
      title: sp.title,
      vendor: sp.vendor ?? 'Unknown Vendor',
    },
  });
  ```

## app/routes/api.product-details.$productId.ts

- Fetch product details by Shopify Product ID:
  ```typescript
  await prisma.product.findUnique({
    where: { shopifyId: shopifyProductId },
    include: {
      variants: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, shopifyId: true, title: true, sku: true, price: true, inventoryQuantity: true, inventoryItemId: true }
      },
      inventory: {
        select: { quantity: true, warehouseId: true, warehouse: { select: { shopifyLocationGid: true } } }
      },
    },
  });
  ```

## app/routes/app._index.tsx

- Fetch shop record:
  ```typescript
  await prisma.shop.findUnique({ where: { shop: shopDomain } });
  ```

- Count total products for a shop:
  ```typescript
  await prisma.product.count({ where: { shopId } });
  ```

- Count low stock items:
  ```typescript
  await prisma.product.count({
    where: { shopId, status: { in: ["Low", "Critical"] } },
  });
  ```

- Fetch variants for inventory calculation:
  ```typescript
  await prisma.variant.findMany({
    where: { product: { shopId } },
    select: { inventoryQuantity: true },
  });
  ```

- Fetch trending products:
  ```typescript
  await prisma.product.findMany({
    where: { shopId, trending: true },
    take: 3,
    select: {
      id: true, title: true, vendor: true, shopifyId: true, salesVelocityFloat: true, status: true, trending: true,
      variants: { select: { sku: true, price: true }, take: 1 },
    },
  })
  ```

- Fetch low stock products for alerts:
  ```typescript
  await prisma.product.findMany({
    where: { shopId, status: { in: ['Low', 'Critical'] } },
    select: { id: true, title: true, status: true, variants: { select: { inventoryQuantity: true } } },
    take: 3,
  })
  ```

- Fetch high sales trend products:
  ```typescript
  await prisma.product.findMany({
    where: { shopId, trending: true },
    select: { id: true, title: true, salesVelocityFloat: true, stockoutDays: true },
    take: 3,
    orderBy: { salesVelocityFloat: 'desc' }
  })
  ```
- Update shop after initial sync:
  ```typescript
  await prisma.shop.update({
    where: { shop: session.shop },
    data: { initialSyncCompleted: true },
  });
  ```

## app/routes/app.actions.send-alert-notification.tsx

- Fetch shop with notification settings:
  ```typescript
  await prisma.shop.findUnique({
    where: { shop: session.shop },
    include: { notificationSettings: true },
  });
  ```

- Create notification log (example for email):
  ```typescript
  await prisma.notificationLog.create({
    data: {
      shopId: shopRecord.id,
      channel: "Email",
      recipient: logRecipient,
      message: message,
      status: logStatus,
      productId: productId,
      productTitle: productTitle,
      alertType: alertType,
    },
  });
  ```
- Create notification log (example for Slack):
  ```typescript
    await prisma.notificationLog.create({
        data: {
          shopId: shopRecord.id,
          channel: "Slack",
          recipient: notificationSettings.slackWebhookUrl,
          message: message,
          status: "Simulated",
          productId: productId,
          productTitle: productTitle,
          alertType: alertType,
        },
      });
  ```
- Create notification log (general failure):
  ```typescript
    await prisma.notificationLog.create({
        data: {
          shopId: shopRecord.id,
          channel: "System",
          message: `No notification channels configured or enabled for alert type: ${alertType} for product: ${productTitle}`,
          status: "FailedConfiguration",
          productId: productId,
          productTitle: productTitle,
          alertType: alertType,
        },
      });
  ```
- Find shop to log error:
  ```typescript
  await prisma.shop.findUnique({ where: { shop: session.shop } });
  ```
- Create notification log for error:
  ```typescript
  await prisma.notificationLog.create({
    data: {
      shopId: shop.id,
      channel: "System",
      message: `Error processing notification: ${error instanceof Error ? error.message : String(error)}`,
      status: "Error",
      productId: productId,
      productTitle: productTitle,
      alertType: alertType,
    },
  });
  ```

## app/routes/app.aiQuery.tsx

- Fetch shop record:
  ```typescript
  await prisma.shop.findUnique({ where: { shop: session.shop } });
  ```

## app/routes/app.alerts.tsx

- Fetch shop with notification settings:
  ```typescript
  await prisma.shop.findUnique({
    where: { shop: session.shop },
    include: { NotificationSettings: true }
  });
  ```

- Fetch notification history:
  ```typescript
  await prisma.notificationLog.findMany({
    where: { shopId: shopId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  ```

- Fetch critical status products for alerts:
  ```typescript
  await prisma.product.findMany({
    where: { shopId, status: 'Critical' },
    select: { id: true, title: true, variants: { select: { inventoryQuantity: true } } },
    take: 10,
  });
  ```

- Fetch low status products for alerts:
  ```typescript
  await prisma.product.findMany({
    where: { shopId, status: 'Low' },
    select: { id: true, title: true, variants: { select: { inventoryQuantity: true } } },
    take: 10,
  });
  ```

- Fetch high sales products for alerts:
  ```typescript
  await prisma.product.findMany({
    where: { shopId, salesVelocityFloat: { gt: highSalesVelocityThreshold } },
    select: { id: true, title: true, salesVelocityFloat: true, stockoutDays: true },
    take: 10,
    orderBy: { salesVelocityFloat: 'desc' }
  });
  ```

## app/routes/app.inventory.tsx

- Find unique variant (after update):
  ```typescript
  await prisma.variant.findUnique({
    where: { id: variantId },
    select: { productId: true }
  });
  ```

- Find unique product to update metrics:
  ```typescript
  await prisma.product.findUnique({
    where: { id: updatedVariant.productId },
    include: {
      variants: { select: { inventoryQuantity: true } },
      shop: { include: { NotificationSettings: true } }
    }
  });
  ```

- Update product metrics:
  ```typescript
  await prisma.product.update({
    where: { id: productToUpdate.id },
    data: {
      stockoutDays: metrics.stockoutDays,
      status: metrics.status,
      trending: trending,
    },
  });
  ```

- Fetch shop record:
  ```typescript
  await prisma.shop.findUnique({ where: { shop: shopDomain } });
  ```

- Fetch inventory records:
  ```typescript
  prisma.inventory.findMany({
    where: { warehouse: { shopId: shop.id } },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          shopifyId: true,
          variants: {
            select: { id: true, shopifyId: true, inventoryItemId: true, sku: true, title: true, price: true, inventoryQuantity: true },
            orderBy: { createdAt: 'asc' },
            take: 1
          }
        }
      },
      warehouse: { select: { id: true, name: true, shopifyLocationGid: true } },
    },
    orderBy: [{ product: { title: 'asc' } }, { warehouse: { name: 'asc' } }]
  })
  ```

- Fetch warehouses:
  ```typescript
  prisma.warehouse.findMany({ where: { shopId: shop.id }, select: { id: true, name: true, shopifyLocationGid: true } })
  ```

## app/routes/app.products.tsx

- Fetch shop record:
  ```typescript
  await prisma.shop.findUnique({ where: { shop: session.shop } });
  ```

- Fetch products with pagination and includes:
  ```typescript
  prisma.product.findMany({
    where: { shopId: shopRecord.id },
    orderBy: { title: 'asc' },
    include: {
      variants: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, shopifyId: true, title: true, sku: true, price: true, inventoryQuantity: true, inventoryItemId: true,
        }
      },
      inventory: {
        select: { quantity: true, warehouseId: true, warehouse: { select: { shopifyLocationGid: true } } }
      },
    },
    take: PRODUCTS_PER_PAGE,
    skip: skip,
  })
  ```

- Count total products for pagination:
  ```typescript
  prisma.product.count({ where: { shopId: shopRecord.id } })
  ```

- Fetch all warehouses for a shop:
  ```typescript
  prisma.warehouse.findMany({
    where: { shopId: shopRecord.id },
    select: { id: true, name: true, shopifyLocationGid: true }
  })
  ```
- Find variant after inventory update (action):
  ```typescript
    await prisma.variant.findUnique({
        where: { id: variantId },
        select: { productId: true }
      });
  ```
- Find product to update metrics (action):
  ```typescript
    await prisma.product.findUnique({
        where: { id: updatedVariant.productId },
        include: {
          variants: { select: { inventoryQuantity: true } },
          shop: { include: { NotificationSettings: true } }
        }
      });
  ```
- Update product metrics (action):
  ```typescript
    await prisma.product.update({
        where: { id: productToUpdate.id },
        data: {
          stockoutDays: metrics.stockoutDays,
          status: metrics.status,
          trending: trending,
        },
      });
  ```

## app/routes/app.reports.tsx

- Fetch shop record:
  ```typescript
  await prisma.shop.findUnique({ where: { shop: session.shop } });
  ```

- Fetch products for summary report:
  ```typescript
  await prisma.product.findMany({
    where: { shopId },
    select: {
      id: true,
      title: true,
      status: true,
      category: true,
      trending: true,
      stockoutDays: true,
      salesVelocityFloat: true,
      variants: {
        select: {
          price: true,
          inventoryQuantity: true,
        }
      }
    }
  });
  ```
- Fetch shop for CSV export (action):
  ```typescript
  await prisma.shop.findUnique({ where: { shop: shopDomain } });
  ```
- Fetch products for CSV export (action):
  ```typescript
  await prisma.product.findMany({
    where: { shopId: shop.id },
    select: {
      title: true,
      vendor: true,
      status: true,
      category: true,
      trending: true,
      stockoutDays: true,
      salesVelocityFloat: true,
      lastRestockedDate: true,
      variants: {
        select: { sku: true, price: true, inventoryQuantity: true }
      },
      inventory: {
        select: { warehouse: { select: { name: true, } }, quantity: true, }
      }
    },
    orderBy: { title: 'asc' }
  });
  ```

## app/routes/app.settings.tsx

- Fetch shop record (loader):
  ```typescript
  await prisma.shop.findUnique({ where: { shop: session.shop } });
  ```

- Fetch notification settings (loader):
  ```typescript
  await prisma.notificationSettings.findUnique({
    where: { shopId: shopRecord.id },
  });
  ```
- Fetch shop record (action):
  ```typescript
  await prisma.shop.findUnique({ where: { shop: session.shop } });
  ```
- Update shop-level low stock threshold (action):
  ```typescript
  await prisma.shop.update({
    where: { id: shopRecord.id },
    data: { lowStockThreshold: dataToSave.shopLowStockThreshold }
  });
  ```

- Upsert notification settings (action):
  ```typescript
  await prisma.notificationSettings.upsert({
    where: { shopId: shopRecord.id },
    create: { shopId: shopRecord.id, ...notificationSpecificData },
    update: notificationSpecificData,
  });
  ```

## app/routes/app.warehouses.$warehouseId.edit.tsx

- Fetch warehouse to edit (loader):
  ```typescript
  await prisma.warehouse.findUnique({
    where: { id: warehouseId },
  });
  ```
- Fetch shop (action):
  ```typescript
  await prisma.shop.findUnique({ where: { shop: shopDomain } });
  ```
- Find warehouse to ensure it belongs to the shop (action):
  ```typescript
  await prisma.warehouse.findFirst({
      where: { id: warehouseId, shopId: shop.id }
    });
  ```
- Check for existing warehouse by name (action):
  ```typescript
  await prisma.warehouse.findFirst({
    where: {
      shopId: shop.id,
      name: validatedName,
      NOT: { id: warehouseId }
    }
  });
  ```
- Check for existing warehouse by Shopify Location GID (action):
  ```typescript
  await prisma.warehouse.findFirst({
      where: {
          shopifyLocationGid: validatedShopifyLocationGid,
          NOT: { id: warehouseId }
      }
  });
  ```
- Update warehouse (action):
  ```typescript
  await prisma.warehouse.update({
    where: { id: warehouseId },
    data: {
      name: validatedName,
      location: validatedLocation,
      shopifyLocationGid: (validatedShopifyLocationGid === "" || validatedShopifyLocationGid === undefined) ? null : validatedShopifyLocationGid,
    },
  });
  ```

## app/routes/app.warehouses.new.tsx

- Fetch shop (action):
  ```typescript
  await prisma.shop.findUnique({ where: { shop: shopDomain } });
  ```

- Check for existing warehouse by name (action):
  ```typescript
  await prisma.warehouse.findFirst({
    where: { shopId: shop.id, name: validatedName }
  });
  ```
- Check for existing warehouse by Shopify Location GID (action):
  ```typescript
  await prisma.warehouse.findFirst({
    where: { shopifyLocationGid: validatedShopifyLocationGid, shopId: shop.id }
  });
  ```
- Create new warehouse (action):
  ```typescript
  await prisma.warehouse.create({
    data: {
      shopId: shop.id,
      name: validatedName,
      location: validatedLocation,
      shopifyLocationGid: validatedShopifyLocationGid === "" ? null : validatedShopifyLocationGid,
    },
  });
  ```

## app/routes/webhooks.app.uninstalled.tsx

- Fetch shop record on app uninstall:
  ```typescript
  await prisma.shop.findUnique({
    where: { shop: shop },
  });
  ```

- Delete shop record on app uninstall:
  ```typescript
  await prisma.shop.delete({
    where: { shop: shop },
  });
  ```

- Delete sessions for the shop on app uninstall:
  ```typescript
  await prisma.session.deleteMany({ where: { shop: shop } });
  ```

## app/services/ai.server.ts

- Fetch product for demand forecast:
  ```typescript
  await prisma.product.findUnique({
    where: { id: productId },
  });
  ```
- Fetch shop for AI chat response:
  ```typescript
  await prisma.shop.findUnique({
    where: { id: shopId },
    include: { notificationSettings: true }
  });
  ```
- Fetch low/critical stock products for AI chat:
  ```typescript
  await prisma.product.findMany({
    where: {
      shopId: shop.id,
      OR: [ { status: 'Low' }, { status: 'Critical' } ]
    },
    take: 10,
    include: { variants: { select: { inventoryQuantity: true }}},
    orderBy: { status: 'asc' }
  });
  ```
- Fetch products for inventory summary for AI chat:
  ```typescript
  await prisma.product.findMany({
    where: { shopId },
    select: { status: true, variants: { select: { price: true, inventoryQuantity: true } } }
  });
  ```
- Fetch specific product by name for AI chat:
  ```typescript
  await prisma.product.findFirst({
      where: { shopId: shop.id, title: { contains: productNameQuery, mode: 'insensitive' } },
      include: { variants: { select: { price: true, inventoryQuantity: true, sku: true }}}
  });
  ```

## app/services/inventory.service.ts

- Fetch variant details:
  ```typescript
  await prisma.variant.findUnique({
    where: { id: variantId },
    select: { shopifyInventoryItemId: true, sku: true, productId: true },
  });
  ```

- Fetch offline session for Shopify API calls:
  ```typescript
  await prisma.session.findFirst({
    where: { shop: shopDomain, isOnline: false, accessToken: { not: null } },
    orderBy: { expires: 'desc' },
  });
  ```

- Find warehouse by Shopify Location GID:
  ```typescript
  await prisma.warehouse.findUnique({ where: { shopifyLocationGid } });
  ```

- Upsert inventory record:
  ```typescript
  await prisma.inventory.upsert({
    where: { productId_warehouseId: { productId: variant.productId, warehouseId: warehouse.id } },
    update: { quantity: newQuantity },
    create: { productId: variant.productId, warehouseId: warehouse.id, quantity: newQuantity },
  });
  ```

## app/services/product.service.ts

- Fetch shop with notification settings for metric updates:
  ```typescript
  await prisma.shop.findUnique({
    where: { id: shopId },
    include: { NotificationSettings: true }
  });
  ```

- Fetch products in batches for metric updates:
  ```typescript
  await prisma.product.findMany({
    where: { shopId },
    include: { variants: { select: { inventoryQuantity: true } } },
    take: BATCH_SIZE,
    skip: skip,
    orderBy: { id: 'asc' }
  });
  ```

- Update product metrics (stockoutDays, status, trending):
  ```typescript
  await prisma.product.update({
    where: { id: product.id },
    data: {
      stockoutDays: metrics.stockoutDays,
      status: metrics.status,
      trending: trending,
    },
  });
  ```

## app/services/shopify.sync.server.ts

- Fetch shop ID:
  ```typescript
  await prisma.shop.findUnique({ where: { shop: shopDomain }, select: { id: true } });
  ```

- Upsert warehouse during location sync:
  ```typescript
  await prisma.warehouse.upsert({
    where: { shopifyLocationGid: loc.id },
    update: { name: loc.name },
    create: { name: loc.name, shopifyLocationGid: loc.id, shopId: shopId, location: loc.name },
  });
  ```

- Upsert product during product sync:
  ```typescript
  await prisma.product.upsert({
    where: { shopifyId: sp.id },
    update: { title: sp.title, vendor: sp.vendor || 'Unknown', productType: sp.productType, tags: sp.tags },
    create: {
      shopifyId: sp.id, title: sp.title, vendor: sp.vendor || 'Unknown',
      productType: sp.productType, tags: sp.tags, shopId: shopId,
      status: 'Unknown', trending: false,
    },
  });
  ```

- Upsert variant during product sync:
  ```typescript
  await prisma.variant.upsert({
    where: { shopifyId: v.id },
    update: { title: v.title, sku: v.sku, price: parseFloat(v.price) || 0, inventoryQuantity: v.inventoryQuantity, inventoryItemId: v.inventoryItem?.id },
    create: {
      shopifyId: v.id, productId: productRecord.id, title: v.title, sku: v.sku,
      price: parseFloat(v.price) || 0, inventoryQuantity: v.inventoryQuantity, inventoryItemId: v.inventoryItem?.id,
    },
  });
  ```

- Upsert inventory record during product sync:
  ```typescript
  await prisma.inventory.upsert({
    where: { productId_warehouseId: { productId: productRecord.id, warehouseId: prismaWarehouseId } },
    update: { quantity: invLevel.available },
    create: { productId: productRecord.id, warehouseId: prismaWarehouseId, quantity: invLevel.available },
  });
  ```

## app/shopify.server.ts

- Upsert shop after authentication:
  ```typescript
  await prisma.shop.upsert({
    where: { shop: session.shop },
    update: {},
    create: { shop: session.shop },
  });
  ```
```
