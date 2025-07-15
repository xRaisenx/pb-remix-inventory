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
  apiVersion: '2025-04',
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

  const shop = await prisma.shop.upsert({
    where: { shop: MOCK_SHOP_CONFIG.shopDomain },
    update: shopData,
    create: shopData,
  });

  // Create notification settings
  await prisma.notificationSetting.upsert({
    where: { shopId: shop.id },
    update: {
      email: true,
      sms: true,
      webhook: true,
      emailAddress: 'alerts@planetbeauty.com',
      smsNumber: '+1234567890',
      webhookUrl: 'https://webhook.site/planet-beauty',
      frequency: 'realtime',
      alertsEnabled: true,
    },
    create: {
      shopId: shop.id,
      email: true,
      sms: true,
      webhook: true,
      emailAddress: 'alerts@planetbeauty.com',
      smsNumber: '+1234567890',
      webhookUrl: 'https://webhook.site/planet-beauty',
      frequency: 'realtime',
      alertsEnabled: true,
    },
  });

  log(`Shop setup completed for ${MOCK_SHOP_CONFIG.shopDomain}`, 'success');
  return shop;
}

// Product simulation
async function simulateProductOperations(shop) {
  log('Simulating product operations', 'product');
  
  const createdProducts = [];
  
  for (const productData of SAMPLE_PRODUCTS) {
    // Create product request
    const createProductRequest = createMockShopifyRequest('products.json', 'POST', {
      product: {
        title: productData.title,
        handle: productData.handle,
        vendor: productData.vendor,
        product_type: productData.productType,
        tags: productData.tags.join(', '),
        variants: [
          {
            price: productData.price,
            inventory_quantity: productData.inventory,
            sku: productData.sku,
            weight: productData.weight,
            weight_unit: 'g',
          },
        ],
      },
    });

    log(`Mock API Request: ${createProductRequest.method} ${createProductRequest.url}`, 'request');

    // Create product in database
    const product = await prisma.product.create({
      data: {
        shopifyId: productData.id,
        title: productData.title,
        handle: productData.handle,
        vendor: productData.vendor,
        productType: productData.productType,
        status: productData.inventory > 10 ? 'OK' : productData.inventory > 0 ? 'Low' : 'OutOfStock',
        price: productData.price,
        quantity: productData.inventory,
        sku: productData.sku,
        weight: productData.weight,
        tags: productData.tags,
        shopId: shop.id,
      },
    });

    // Create inventory record
    await prisma.inventory.create({
      data: {
        productId: product.id,
        quantity: productData.inventory,
        available: productData.inventory,
        reserved: 0,
        shopId: shop.id,
      },
    });

    createdProducts.push(product);
    
    // Simulate webhook for product creation
    const webhookPayload = {
      id: productData.id,
      title: productData.title,
      handle: productData.handle,
      vendor: productData.vendor,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      variants: [
        {
          id: `${productData.id}_variant`,
          inventory_quantity: productData.inventory,
          price: productData.price,
          sku: productData.sku,
        },
      ],
    };

    const webhookRequest = createMockWebhookRequest('products/create', webhookPayload);
    log(`Mock Webhook: ${webhookRequest.method} ${webhookRequest.url}`, 'webhook');
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

    // Update inventory record
    await prisma.inventory.updateMany({
      where: { productId: product.id },
      data: {
        quantity: newQuantity,
        available: newQuantity,
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
      productId: product.id,
      shopId: product.shopId,
      type: 'LOW_STOCK',
      severity: 'Medium',
      message: `${product.title} is running low on stock. Current quantity: ${quantity}`,
      threshold: 10,
      currentValue: quantity,
      isActive: true,
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
      productId: product.id,
      shopId: product.shopId,
      type: 'OUT_OF_STOCK',
      severity: 'High',
      message: `${product.title} is out of stock!`,
      threshold: 1,
      currentValue: 0,
      isActive: true,
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

  // Simulate alerts page request
  const alertsRequest = createMockAppRequest('/app/alerts');
  log(`Mock App Request: ${alertsRequest.method} ${alertsRequest.url}`, 'request');

  // Simulate settings update
  const settingsRequest = createMockAppRequest('/app/settings', 'POST', {
    sms: true,
    email: true,
    webhook: true,
    smsNumber: '+1234567890',
    emailAddress: 'alerts@planetbeauty.com',
    webhookUrl: 'https://webhook.site/planet-beauty',
  });
  log(`Mock App Request: ${settingsRequest.method} ${settingsRequest.url}`, 'request');

  log('User interface interactions completed', 'success');
}

// Generate simulation report
function generateSimulationReport(shop, products) {
  const report = {
    simulation: {
      timestamp: new Date().toISOString(),
      shop: {
        domain: shop.shop,
        id: shop.id,
        productsCreated: products.length,
      },
      products: products.map(p => ({
        id: p.id,
        title: p.title,
        quantity: p.quantity,
        status: p.status,
      })),
      mockRequests: {
        shopifyAPI: products.length * 2, // Create + update for each product
        webhooks: products.length * 2, // Create + update for each product
        appRequests: 5, // Dashboard, products, inventory, alerts, settings
      },
    },
    nextSteps: [
      'Review generated alerts in the dashboard',
      'Test notification settings',
      'Verify webhook deliveries',
      'Check SMS delivery status',
      'Monitor inventory levels',
    ],
  };

  fs.writeFileSync('simulation-report.json', JSON.stringify(report, null, 2));
  log('Simulation report saved to simulation-report.json', 'success');
  
  return report;
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
    
    // Generate report
    const report = generateSimulationReport(shop, products);
    
    log('📊 Simulation Summary:', 'info');
    log(`Shop: ${report.simulation.shop.domain}`, 'info');
    log(`Products Created: ${report.simulation.shop.productsCreated}`, 'info');
    log(`Mock Requests Generated: ${Object.values(report.simulation.mockRequests).reduce((a, b) => a + b, 0)}`, 'info');
    
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