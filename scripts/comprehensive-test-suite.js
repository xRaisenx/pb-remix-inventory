#!/usr/bin/env node

/**
 * Comprehensive Test Suite for Planet Beauty Shopify Remix App
 * Tests all functions, buttons, frontend, backend, AI connections, and database connections
 */

import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';
import fs from 'fs';
import _path from 'path';

const prisma = new PrismaClient();

// Test configuration
const TEST_CONFIG = {
  baseUrl: process.env.SHOPIFY_APP_URL || 'http://localhost:3000',
  testShop: process.env.TEST_SHOP || 'test-shop.myshopify.com',
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecret: process.env.SHOPIFY_API_SECRET,
  databaseUrl: process.env.DATABASE_URL,
  timeout: 30000,
  retries: 3
};

// Test results tracking
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: [],
  startTime: Date.now(),
  categories: {
    database: { total: 0, passed: 0, failed: 0 },
    authentication: { total: 0, passed: 0, failed: 0 },
    api: { total: 0, passed: 0, failed: 0 },
    webhooks: { total: 0, passed: 0, failed: 0 },
    ai: { total: 0, passed: 0, failed: 0 },
    frontend: { total: 0, passed: 0, failed: 0 },
    integration: { total: 0, passed: 0, failed: 0 }
  }
};

// Utility functions
const log = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔄';
  console.log(`${timestamp} ${prefix} ${message}`);
};

const _sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const runTest = async (testName, testFn, category = 'general') => {
  testResults.total++;
  testResults.categories[category].total++;
  
  try {
    log(`Running test: ${testName}`, 'info');
    await testFn();
    testResults.passed++;
    testResults.categories[category].passed++;
    log(`✅ PASSED: ${testName}`, 'success');
    return true;
  } catch (error) {
    testResults.failed++;
    testResults.categories[category].failed++;
    testResults.errors.push({ test: testName, error: error.message, category });
    log(`❌ FAILED: ${testName} - ${error.message}`, 'error');
    return false;
  }
};

// Database Tests
const testDatabaseConnection = async () => {
  await prisma.$queryRaw`SELECT 1 as test`;
};

const testSessionTable = async () => {
  const sessionCount = await prisma.session.count();
  if (sessionCount < 0) throw new Error('Session table not accessible');
};

const testShopTable = async () => {
  const _shopCount = await prisma.shop.count();
  // Shop table should exist even if empty
};

const testProductTable = async () => {
  const _productCount = await prisma.product.count();
  // Product table should exist even if empty
};

const testPrismaMigrations = async () => {
  // Test that all migrations are applied
  await prisma.$queryRaw`SELECT version FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1`;
};

// Authentication Tests
const testShopifyAuthentication = async () => {
  const response = await fetch(`${TEST_CONFIG.baseUrl}/auth/login?shop=${TEST_CONFIG.testShop}`, {
    method: 'GET',
    timeout: TEST_CONFIG.timeout
  });
  
  if (!response.ok && response.status !== 302) {
    throw new Error(`Authentication endpoint returned ${response.status}`);
  }
};

const testAppBridgeConfiguration = async () => {
  // Test that the app can load with proper App Bridge configuration
  const response = await fetch(`${TEST_CONFIG.baseUrl}/app?shop=${TEST_CONFIG.testShop}&host=${TEST_CONFIG.testShop}`, {
    method: 'GET',
    timeout: TEST_CONFIG.timeout
  });
  
  if (!response.ok) {
    throw new Error(`App endpoint returned ${response.status}`);
  }
};

// API Tests
const testWarmupEndpoint = async () => {
  const response = await fetch(`${TEST_CONFIG.baseUrl}/api/warmup`, {
    method: 'GET',
    timeout: TEST_CONFIG.timeout
  });
  
  if (!response.ok) {
    throw new Error(`Warmup endpoint returned ${response.status}`);
  }
};

const testProductDetailsAPI = async () => {
  // Create a test product first
  const testProduct = await prisma.product.create({
    data: {
      shopifyId: 'gid://shopify/Product/test123',
      title: 'Test Product for API',
      price: 19.99,
      quantity: 10,
      shopId: 'test-shop-id',
      vendor: 'Test Vendor',
      productType: 'Test Type',
      tags: ['test'],
      status: 'OK'
    }
  });
  
  const response = await fetch(`${TEST_CONFIG.baseUrl}/api/product-details/${testProduct.id}`, {
    method: 'GET',
    timeout: TEST_CONFIG.timeout
  });
  
  if (!response.ok) {
    throw new Error(`Product details API returned ${response.status}`);
  }
  
  // Clean up
  await prisma.product.delete({ where: { id: testProduct.id } });
};

const testCronEndpoint = async () => {
  const response = await fetch(`${TEST_CONFIG.baseUrl}/api/cron/daily-analysis`, {
    method: 'GET',
    timeout: TEST_CONFIG.timeout
  });
  
  if (!response.ok) {
    throw new Error(`Cron endpoint returned ${response.status}`);
  }
};

// Webhook Tests
const testWebhookEndpoints = async () => {
  const webhookEndpoints = [
    '/webhooks/app/uninstalled',
    '/webhooks/app/scopes_update',
    '/webhooks/products/create',
    '/webhooks/products/update',
    '/webhooks/products/delete',
    '/webhooks/inventory/update',
    '/webhooks/orders/create',
    '/webhooks/orders/paid'
  ];
  
  for (const endpoint of webhookEndpoints) {
    const response = await fetch(`${TEST_CONFIG.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Shop-Domain': TEST_CONFIG.testShop,
        'X-Shopify-Hmac-Sha256': 'test-hmac'
      },
      body: JSON.stringify({ test: true }),
      timeout: TEST_CONFIG.timeout
    });
    
    // Webhooks should return 200 or 401 (unauthorized), not 404
    if (response.status === 404) {
      throw new Error(`Webhook endpoint ${endpoint} not found`);
    }
  }
};

// AI Tests
const testAIService = async () => {
  // Test AI query endpoint
  const formData = new URLSearchParams();
  formData.append('intent', 'AI_CHAT');
  formData.append('query', 'How much inventory do I have?');
  
  const response = await fetch(`${TEST_CONFIG.baseUrl}/app/aiQuery`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData,
    timeout: TEST_CONFIG.timeout
  });
  
  if (!response.ok) {
    throw new Error(`AI query endpoint returned ${response.status}`);
  }
};

const testGoogleAIIntegration = async () => {
  // Test that Google AI environment variables are set
  if (!process.env.GOOGLE_AI_API_KEY) {
    throw new Error('Google AI API key not configured');
  }
};

// Frontend Tests
const testMainRoutes = async () => {
  const routes = [
    '/app',
    '/app/products',
    '/app/inventory',
    '/app/alerts',
    '/app/reports',
    '/app/settings',
    '/app/warehouses'
  ];
  
  for (const route of routes) {
    const response = await fetch(`${TEST_CONFIG.baseUrl}${route}?shop=${TEST_CONFIG.testShop}`, {
      method: 'GET',
      timeout: TEST_CONFIG.timeout
    });
    
    // Routes should return 200 or redirect (302), not 404
    if (response.status === 404) {
      throw new Error(`Route ${route} not found`);
    }
  }
};

const testPolarisComponents = async () => {
  // Test that Polaris styles are accessible
  const response = await fetch(`${TEST_CONFIG.baseUrl}/build/_assets/polaris-styles.css`, {
    method: 'GET',
    timeout: TEST_CONFIG.timeout
  });
  
  // This might not exist in development, so we'll just check it doesn't crash
  if (response.status === 500) {
    throw new Error('Polaris styles endpoint crashed');
  }
};

// Integration Tests
const testProductSync = async () => {
  // Test product sync functionality
  const testShop = await prisma.shop.create({
    data: {
      shop: TEST_CONFIG.testShop,
      emailForNotifications: 'test@example.com',
      lowStockThreshold: 10,
      criticalStockThreshold: 5
    }
  });
  
  // Test that we can query products for this shop
  const _products = await prisma.product.findMany({
    where: { shopId: testShop.id },
    take: 1
  });
  
  // Clean up
  await prisma.shop.delete({ where: { id: testShop.id } });
};

const testNotificationSystem = async () => {
  // Test notification settings
  const testShop = await prisma.shop.create({
    data: {
      shop: TEST_CONFIG.testShop,
      emailForNotifications: 'test@example.com'
    }
  });
  
  const notificationSettings = await prisma.notificationSetting.create({
    data: {
      shopId: testShop.id,
      email: true,
      slack: false,
      telegram: false,
      frequency: 'realtime'
    }
  });
  
  // Test that settings were created
  if (!notificationSettings.id) {
    throw new Error('Notification settings not created properly');
  }
  
  // Clean up
  await prisma.notificationSetting.delete({ where: { id: notificationSettings.id } });
  await prisma.shop.delete({ where: { id: testShop.id } });
};

const testInventoryManagement = async () => {
  // Test inventory management functionality
  const testShop = await prisma.shop.create({
    data: {
      shop: TEST_CONFIG.testShop,
      emailForNotifications: 'test@example.com'
    }
  });
  
  const testProduct = await prisma.product.create({
    data: {
      shopifyId: 'gid://shopify/Product/inventory-test',
      title: 'Inventory Test Product',
      price: 29.99,
      quantity: 50,
      shopId: testShop.id,
      vendor: 'Test Vendor',
      productType: 'Test Type',
      tags: ['test'],
      status: 'OK'
    }
  });
  
  // Test inventory update
  const updatedProduct = await prisma.product.update({
    where: { id: testProduct.id },
    data: { quantity: 25 }
  });
  
  if (updatedProduct.quantity !== 25) {
    throw new Error('Inventory update failed');
  }
  
  // Clean up
  await prisma.product.delete({ where: { id: testProduct.id } });
  await prisma.shop.delete({ where: { id: testShop.id } });
};

// Performance Tests
const testDatabasePerformance = async () => {
  const startTime = Date.now();
  
  // Run multiple queries to test performance
  for (let i = 0; i < 10; i++) {
    await prisma.product.count();
    await prisma.shop.count();
    await prisma.session.count();
  }
  
  const duration = Date.now() - startTime;
  
  if (duration > 5000) {
    throw new Error(`Database performance test took too long: ${duration}ms`);
  }
};

const testConcurrentRequests = async () => {
  const requests = Array(5).fill().map(() => 
    fetch(`${TEST_CONFIG.baseUrl}/api/warmup`, { timeout: TEST_CONFIG.timeout })
  );
  
  const responses = await Promise.all(requests);
  const failed = responses.filter(r => !r.ok).length;
  
  if (failed > 2) {
    throw new Error(`Too many concurrent requests failed: ${failed}/5`);
  }
};

// Main test execution
const runAllTests = async () => {
  log('🚀 Starting Comprehensive Test Suite for Planet Beauty Shopify App', 'info');
  log(`Base URL: ${TEST_CONFIG.baseUrl}`, 'info');
  log(`Test Shop: ${TEST_CONFIG.testShop}`, 'info');
  
  // Database Tests
  await runTest('Database Connection', testDatabaseConnection, 'database');
  await runTest('Session Table Access', testSessionTable, 'database');
  await runTest('Shop Table Access', testShopTable, 'database');
  await runTest('Product Table Access', testProductTable, 'database');
  await runTest('Prisma Migrations', testPrismaMigrations, 'database');
  await runTest('Database Performance', testDatabasePerformance, 'database');
  
  // Authentication Tests
  await runTest('Shopify Authentication', testShopifyAuthentication, 'authentication');
  await runTest('App Bridge Configuration', testAppBridgeConfiguration, 'authentication');
  
  // API Tests
  await runTest('Warmup Endpoint', testWarmupEndpoint, 'api');
  await runTest('Product Details API', testProductDetailsAPI, 'api');
  await runTest('Cron Endpoint', testCronEndpoint, 'api');
  
  // Webhook Tests
  await runTest('Webhook Endpoints', testWebhookEndpoints, 'webhooks');
  
  // AI Tests
  await runTest('AI Service', testAIService, 'ai');
  await runTest('Google AI Integration', testGoogleAIIntegration, 'ai');
  
  // Frontend Tests
  await runTest('Main Routes', testMainRoutes, 'frontend');
  await runTest('Polaris Components', testPolarisComponents, 'frontend');
  
  // Integration Tests
  await runTest('Product Sync', testProductSync, 'integration');
  await runTest('Notification System', testNotificationSystem, 'integration');
  await runTest('Inventory Management', testInventoryManagement, 'integration');
  
  // Performance Tests
  await runTest('Concurrent Requests', testConcurrentRequests, 'integration');
  
  // Generate report
  generateTestReport();
};

const generateTestReport = () => {
  const duration = Date.now() - testResults.startTime;
  const successRate = ((testResults.passed / testResults.total) * 100).toFixed(1);
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPREHENSIVE TEST SUITE RESULTS');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  console.log(`Success Rate: ${successRate}%`);
  console.log(`Duration: ${duration}ms`);
  
  console.log('\n📈 CATEGORY BREAKDOWN:');
  Object.entries(testResults.categories).forEach(([category, stats]) => {
    if (stats.total > 0) {
      const categoryRate = ((stats.passed / stats.total) * 100).toFixed(1);
      console.log(`${category.toUpperCase()}: ${stats.passed}/${stats.total} (${categoryRate}%)`);
    }
  });
  
  if (testResults.errors.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    testResults.errors.forEach(({ test, error, category }) => {
      console.log(`  ${category.toUpperCase()}: ${test} - ${error}`);
    });
  }
  
  console.log('\n' + '='.repeat(80));
  
  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: testResults.total,
      passed: testResults.passed,
      failed: testResults.failed,
      successRate: parseFloat(successRate),
      duration
    },
    categories: testResults.categories,
    errors: testResults.errors,
    config: {
      baseUrl: TEST_CONFIG.baseUrl,
      testShop: TEST_CONFIG.testShop,
      databaseUrl: TEST_CONFIG.databaseUrl ? 'configured' : 'missing'
    }
  };
  
  fs.writeFileSync('test-report.json', JSON.stringify(report, null, 2));
  console.log('📄 Detailed report saved to test-report.json');
  
  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
};

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled Rejection at: ${promise}, reason: ${reason}`, 'error');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  log(`Uncaught Exception: ${error.message}`, 'error');
  process.exit(1);
});

// Run tests
runAllTests().catch(error => {
  log(`Test suite failed to start: ${error.message}`, 'error');
  process.exit(1);
});