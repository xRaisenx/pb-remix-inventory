#!/usr/bin/env node

/**
 * Shop Interaction Simulation Script
 * 
 * This script simulates real shop interactions by creating mock request objects
 * and testing various scenarios with a live shop environment.
 * 
 * Features:
 * - Mock Shopify API requests
 * - Product creation and updates
 * - Inventory management
 * - Webhook processing
 * - User session simulation
 * - Error scenario testing
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
// Services will be mocked for testing
// import { createSMSService } from '../app/services/sms.service.js';
// import { createWebhookService } from '../app/services/webhook.service.js';
import fs from 'fs';

const prisma = new PrismaClient();

// Mock shop configuration
const MOCK_SHOP_CONFIG = {
  shopDomain: 'planet-beauty-demo.myshopify.com',
  accessToken: 'mock-access-token-shpat_123456789',
  shopId: 'gid://shopify/Shop/123456789',
  locationId: 'gid://shopify/Location/987654321',
  apiVersion: '2025-07',
  scopes: ['read_products', 'write_products', 'read_inventory', 'write_inventory'],
};

// Sample product data
const SAMPLE_PRODUCTS = [
  {
    id: 'gid://shopify/Product/1001',
    title: 'Luxury Face Cream',
    handle: 'luxury-face-cream',
    vendor: 'Planet Beauty',
    productType: 'Skincare',
    price: 89.99,
    inventory: 25,
    sku: 'LFC-001',
    weight: 50,
    tags: ['skincare', 'luxury', 'face', 'cream'],
  },
  {
    id: 'gid://shopify/Product/1002',
    title: 'Moisturizing Serum',
    handle: 'moisturizing-serum',
    vendor: 'Planet Beauty',
    productType: 'Skincare',
    price: 65.00,
    inventory: 8,
    sku: 'MS-002',
    weight: 30,
    tags: ['skincare', 'serum', 'moisturizing'],
  },
  {
    id: 'gid://shopify/Product/1003',
    title: 'Anti-Aging Night Cream',
    handle: 'anti-aging-night-cream',
    vendor: 'Planet Beauty',
    productType: 'Skincare',
    price: 120.00,
    inventory: 0,
    sku: 'ANC-003',
    weight: 60,
    tags: ['skincare', 'anti-aging', 'night', 'cream'],
  },
  {
    id: 'gid://shopify/Product/1004',
    title: 'Vitamin C Cleanser',
    handle: 'vitamin-c-cleanser',
    vendor: 'Planet Beauty',
    productType: 'Skincare',
    price: 45.00,
    inventory: 50,
    sku: 'VCC-004',
    weight: 120,
    tags: ['skincare', 'cleanser', 'vitamin-c'],
  },
];

// Utility functions
const log = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  const icons = {
    info: '📝',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    shop: '🏪',
    product: '📦',
    inventory: '📊',
    webhook: '🔔',
    request: '📡',
  };
  
  console.log(`${icons[type] || '📝'} [${timestamp}] ${message}`);
};

// Mock request creators
function createMockShopifyRequest(endpoint, method = 'GET', body = null) {
  return {
    url: `https://${MOCK_SHOP_CONFIG.shopDomain}/admin/api/${MOCK_SHOP_CONFIG.apiVersion}/${endpoint}`,
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': MOCK_SHOP_CONFIG.accessToken,
      'X-Shopify-Shop-Domain': MOCK_SHOP_CONFIG.shopDomain,
      'User-Agent': 'Planet Beauty Inventory AI/1.0',
    },
    body: body ? JSON.stringify(body) : null,
  };
}

function createMockWebhookRequest(topic, payload) {
  return {
    url: `https://pb-inventory-ai-olive.vercel.app/webhooks/${topic.replace('/', '.')}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Topic': topic,
      'X-Shopify-Shop-Domain': MOCK_SHOP_CONFIG.shopDomain,
      'X-Shopify-Webhook-Id': `webhook-${Date.now()}`,
      'X-Shopify-Api-Version': MOCK_SHOP_CONFIG.apiVersion,
    },
    body: JSON.stringify(payload),
  };
}

function createMockAppRequest(path, method = 'GET', body = null) {
  return {
    url: `https://pb-inventory-ai-olive.vercel.app${path}`,
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Shop-Domain': MOCK_SHOP_CONFIG.shopDomain,
      'Cookie': 'shopify_session=mock_session_token',
    },
    body: body ? JSON.stringify(body) : null,
  };
}

// Shop setup simulation
async function simulateShopSetup() {
  log('Simulating shop setup and installation', 'shop');
  
  // Create or update shop record (using only required fields)
  const shopData = {
    shop: MOCK_SHOP_CONFIG.shopDomain,
  };

  // Check if shop exists
  let shop = await prisma.shop.findUnique({ where: { shop: MOCK_SHOP_CONFIG.shopDomain } });
  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        id: randomUUID(),
        ...shopData,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  } else {
    shop = await prisma.shop.update({
      where: { shop: MOCK_SHOP_CONFIG.shopDomain },
      data: shopData,
    });
  }

  // Create or update notification settings
  let notificationSetting = await prisma.notificationSetting.findFirst({ where: { shopId: shop.id } });
  if (notificationSetting) {
    await prisma.notificationSetting.update({
      where: { id: notificationSetting.id },
      data: {
        email: true,
        slack: false,
        telegram: false,
        mobilePush: false,
        emailAddress: 'alerts@planetbeauty.com',
        frequency: 'realtime',
        lowStockThreshold: 5,
        salesVelocityThreshold: 10.0,
        criticalStockThresholdUnits: 2,
        criticalStockoutDays: 1,
        syncEnabled: true,
        updatedAt: new Date(),
      },
    });
  } else {
    await prisma.notificationSetting.create({
      data: {
        id: randomUUID(),
        shopId: shop.id,
        email: true,
        slack: false,
        telegram: false,
        mobilePush: false,
        emailAddress: 'alerts@planetbeauty.com',
        frequency: 'realtime',
        lowStockThreshold: 5,
        salesVelocityThreshold: 10.0,
        criticalStockThresholdUnits: 2,
        criticalStockoutDays: 1,
        syncEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  log(`Shop setup completed for ${MOCK_SHOP_CONFIG.shopDomain}`, 'success');
  return shop;
}

// Product simulation
async function simulateProductOperations(shop) {
  log('Simulating product operations', 'product');
  
  const createdProducts = [];
  
  for (const productData of SAMPLE_PRODUCTS) {
    let product = await prisma.product.findUnique({ where: { shopifyId: productData.id } });
    if (product) {
      product = await prisma.product.update({
        where: { shopifyId: productData.id },
        data: {
          title: productData.title,
          handle: productData.handle,
          vendor: productData.vendor,
          productType: productData.productType,
          status: 'OK',
          price: productData.price,
          quantity: productData.inventory,
          sku: productData.sku,
          weight: productData.weight,
          tags: productData.tags,
          shopId: shop.id,
          updatedAt: new Date(),
        },
      });
    } else {
      product = await prisma.product.create({
        data: {
          id: randomUUID(),
          shopifyId: productData.id,
          title: productData.title,
          handle: productData.handle,
          vendor: productData.vendor,
          productType: productData.productType,
          status: 'OK',
          price: productData.price,
          quantity: productData.inventory,
          sku: productData.sku,
          weight: productData.weight,
          tags: productData.tags,
          shopId: shop.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }
    createdProducts.push(product);
  }

  log(`Created ${createdProducts.length} products`, 'success');
  return createdProducts;
}

// Inventory update simulation
async function simulateInventoryUpdates(products) {
  log('Simulating inventory updates', 'inventory');
  
  for (const product of products) {
    // Simulate random inventory changes
    const oldQuantity = product.quantity;
    const change = Math.floor(Math.random() * 20) - 10; // -10 to +10
    const newQuantity = Math.max(0, oldQuantity + change);
    
    // Update inventory request
    const updateInventoryRequest = createMockShopifyRequest(
      'inventory_levels/set.json',
      'POST',
      {
        location_id: MOCK_SHOP_CONFIG.locationId,
        inventory_item_id: `${product.shopifyId}_inventory`,
        available: newQuantity,
      }
    );

    log(`Mock API Request: ${updateInventoryRequest.method} ${updateInventoryRequest.url}`, 'request');

    // Update product in database
    await prisma.product.update({
      where: { id: product.id },
      data: {
        quantity: newQuantity,
        status: newQuantity > 10 ? 'OK' : newQuantity > 0 ? 'Low' : 'OutOfStock',
      },
    });

    // When updating inventory, use availableQuantity instead of available
    await prisma.inventory.updateMany({
      where: { productId: product.id },
      data: {
        quantity: newQuantity,
        availableQuantity: newQuantity,
        updatedAt: new Date(),
      },
    });

    // Simulate webhook for inventory update
    const webhookPayload = {
      inventory_item_id: `${product.shopifyId}_inventory`,
      location_id: MOCK_SHOP_CONFIG.locationId,
      available: newQuantity,
    };

    const webhookRequest = createMockWebhookRequest('inventory_levels/update', webhookPayload);
    log(`Mock Webhook: ${webhookRequest.method} ${webhookRequest.url}`, 'webhook');

    // Generate alerts for low stock
    if (newQuantity <= 5 && newQuantity > 0) {
      await generateLowStockAlert(product, newQuantity);
    } else if (newQuantity === 0) {
      await generateOutOfStockAlert(product);
    }
  }

  log('Inventory updates completed', 'success');
}

// Alert generation
async function generateLowStockAlert(product, quantity) {
  await prisma.productAlert.create({
    data: {
      id: randomUUID(),
      productId: product.id,
      type: 'LOW_STOCK',
      message: `${product.title} is running low!`,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  log(`Generated low stock alert for ${product.title}`, 'warning');
  
  // Simulate SMS notification
  await simulateSMSNotification(product, quantity, 'LOW_STOCK');
  
  // Simulate webhook notification
  await simulateWebhookNotification(product, quantity, 'LOW_STOCK');
}

async function generateOutOfStockAlert(product) {
  await prisma.productAlert.create({
    data: {
      id: randomUUID(),
      productId: product.id,
      type: 'OUT_OF_STOCK',
      message: `${product.title} is out of stock!`,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  log(`Generated out of stock alert for ${product.title}`, 'error');
  
  // Simulate SMS notification
  await simulateSMSNotification(product, 0, 'OUT_OF_STOCK');
  
  // Simulate webhook notification
  await simulateWebhookNotification(product, 0, 'OUT_OF_STOCK');
}

// Notification simulations
async function simulateSMSNotification(product, quantity, alertType) {
  // Mock SMS service for testing
  const mockSMSService = {
    sendSMS: async (message) => {
      log(`📱 SMS: ${message.message}`, 'info');
      return { success: true, messageId: `mock-${Date.now()}` };
    }
  };
  
  const message = alertType === 'OUT_OF_STOCK' 
    ? `🔴 OUT OF STOCK: ${product.title} is completely out of stock!`
    : `⚠️ LOW STOCK: ${product.title} is running low! Current: ${quantity} units`;

  const smsMessage = {
    to: '+1234567890',
    message,
    shopId: product.shopId,
    productId: product.id,
    productTitle: product.title,
    alertType,
  };

  try {
    const result = await mockSMSService.sendSMS(smsMessage);
    log(`SMS notification sent: ${result.success ? 'Success' : 'Failed'}`, result.success ? 'success' : 'error');
  } catch (error) {
    log(`SMS notification failed: ${error.message}`, 'error');
  }
}

async function simulateWebhookNotification(product, quantity, alertType) {
  // Mock webhook service for testing
  const mockWebhookService = {
    sendWebhook: async (message) => {
      log(`🔔 Webhook: ${message.payload.event} for ${message.payload.product.title}`, 'info');
      return { success: true, statusCode: 200, duration: 123 };
    }
  };

  const webhookMessage = {
    url: 'https://webhook.site/planet-beauty',
    shopId: product.shopId,
    productId: product.id,
    productTitle: product.title,
    alertType,
    payload: {
      event: alertType === 'OUT_OF_STOCK' ? 'inventory.out_of_stock' : 'inventory.low_stock',
      shop: {
        id: product.shopId,
        domain: MOCK_SHOP_CONFIG.shopDomain,
      },
      product: {
        id: product.id,
        title: product.title,
        currentQuantity: quantity,
        threshold: alertType === 'OUT_OF_STOCK' ? 1 : 10,
      },
      alert: {
        id: `alert-${Date.now()}`,
        type: alertType,
        severity: alertType === 'OUT_OF_STOCK' ? 'high' : 'medium',
        message: `${product.title} alert - quantity: ${quantity}`,
      },
      timestamp: new Date().toISOString(),
    },
  };

  try {
    const result = await mockWebhookService.sendWebhook(webhookMessage);
    log(`Webhook notification sent: ${result.success ? 'Success' : 'Failed'}`, result.success ? 'success' : 'error');
  } catch (error) {
    log(`Webhook notification failed: ${error.message}`, 'error');
  }
}

// User interface simulation
async function simulateUserInteractions(shop) {
  log('Simulating user interface interactions', 'info');
  
  // Simulate dashboard page request
  const dashboardRequest = createMockAppRequest('/app');
  log(`Mock App Request: ${dashboardRequest.method} ${dashboardRequest.url}`, 'request');

  // Simulate products page request
  const productsRequest = createMockAppRequest('/app/products');
  log(`Mock App Request: ${productsRequest.method} ${productsRequest.url}`, 'request');

  // Simulate inventory page request
  const inventoryRequest = createMockAppRequest('/app/inventory');
  log(`Mock App Request: ${inventoryRequest.method} ${inventoryRequest.url}`, 'request');
}

// Main simulation function
async function runShopSimulation() {
  log('🏪 Starting Shop Interaction Simulation', 'info');
  try {
    // Setup shop
    const shop = await simulateShopSetup();
    // Create products
    const products = await simulateProductOperations(shop);
    // Update inventory
    await simulateInventoryUpdates(products);
    // Simulate user interactions
    await simulateUserInteractions(shop);
    log('🎉 Shop simulation completed successfully!', 'success');
  } catch (error) {
    log(`💥 Simulation failed: ${error.message}`, 'error');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run simulation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runShopSimulation().catch(console.error);
}

export { runShopSimulation, createMockShopifyRequest, createMockWebhookRequest, createMockAppRequest };