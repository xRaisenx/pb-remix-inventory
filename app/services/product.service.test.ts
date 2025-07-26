// app/services/product.service.test.ts

import { describe, it, expect } from 'vitest';
import { calculateProductMetrics } from './product.service';
// After running `npx prisma generate`, this import will work correctly.
import { ProductStatus } from '@prisma/client';

// Mock data for testing
const mockShopSettings = {
  lowStockThresholdUnits: 10,
  criticalStockThresholdUnits: 5,
  criticalStockoutDays: 3,
};

describe('calculateProductMetrics', () => {
  it('should return status OK for a healthy product', () => {
    const mockProduct = {
      // Provide necessary fields from the ProductWithVariants type
      id: 'prod_1',
      salesVelocityFloat: 10,
      Variant: [{ inventoryQuantity: 100 }],
      // Add other required Product fields with dummy data
      shopifyId: 'sh_1',
      title: 'Test Product',
      vendor: 'Test Vendor',
      tags: [],
      shopId: 'shop_1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const metrics = calculateProductMetrics(mockProduct as any, mockShopSettings);
    expect(metrics.status).toBe(ProductStatus.OK);
    expect(metrics.currentTotalInventory).toBe(100);
    expect(metrics.stockoutDays).toBe(10);
  });

  it('should return status Low when inventory is below the low threshold', () => {
    const mockProduct = {
      id: 'prod_2',
      salesVelocityFloat: 2,
      Variant: [{ inventoryQuantity: 8 }], // 8 is <= 10 (low) but > 5 (critical)
      // Add other required Product fields
      shopifyId: 'sh_2',
      title: 'Low Stock Product',
      vendor: 'Test Vendor',
      tags: [],
      shopId: 'shop_1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const metrics = calculateProductMetrics(mockProduct as any, mockShopSettings);
    expect(metrics.status).toBe(ProductStatus.Low);
    expect(metrics.currentTotalInventory).toBe(8);
  });

  it('should return status Critical when inventory is below the critical threshold', () => {
    const mockProduct = {
      id: 'prod_3',
      salesVelocityFloat: 5,
      Variant: [{ inventoryQuantity: 4 }], // 4 is <= 5 (critical)
      // Add other required Product fields
      shopifyId: 'sh_3',
      title: 'Critical Stock Product',
      vendor: 'Test Vendor',
      tags: [],
      shopId: 'shop_1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const metrics = calculateProductMetrics(mockProduct as any, mockShopSettings);
    expect(metrics.status).toBe(ProductStatus.Critical);
  });

  it('should return status Critical when stockout days are below the critical threshold', () => {
    const mockProduct = {
      id: 'prod_4',
      salesVelocityFloat: 5, // Sells 5 per day
      Variant: [{ inventoryQuantity: 15 }], // 15 units / 5 per day = 3 days until stockout
      // Add other required Product fields
      shopifyId: 'sh_4',
      title: 'Fast Selling Product',
      vendor: 'Test Vendor',
      tags: [],
      shopId: 'shop_1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const metrics = calculateProductMetrics(mockProduct as any, mockShopSettings);
    // Stocks out in 3 days, which is <= the criticalStockoutDays threshold of 3
    expect(metrics.status).toBe(ProductStatus.Critical);
    expect(metrics.stockoutDays).toBe(3);
  });

  it('should return status Critical for zero inventory', () => {
    const mockProduct = {
      id: 'prod_5',
      salesVelocityFloat: 1,
      Variant: [{ inventoryQuantity: 0 }],
      // Add other required Product fields
      shopifyId: 'sh_5',
      title: 'Out of Stock Product',
      vendor: 'Test Vendor',
      tags: [],
      shopId: 'shop_1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const metrics = calculateProductMetrics(mockProduct as any, mockShopSettings);
    expect(metrics.status).toBe(ProductStatus.Critical);
    expect(metrics.stockoutDays).toBe(0);
  });
});