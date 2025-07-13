import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { calculateProductMetrics, updateAllProductMetricsForShop } from './product.service';
import prisma from '~/db.server';
import { ProductStatus } from '@prisma/client';

// Mock the database
jest.mock('~/db.server', () => ({
  __esModule: true,
  default: {
    product: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
    },
    shop: {
      findUnique: jest.fn(),
    },
  },
}));

// Type the mocked prisma client
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Helper function to create a mock product with all required fields
const createMockProduct = (overrides: any = {}) => ({
  id: '1',
  shopifyId: 'shopify_1',
  shopifyInventoryItemId: null,
  title: 'Test Product',
  handle: 'test-product',
  vendor: null,
  productType: null,
  status: ProductStatus.OK,
  trending: false,
  salesVelocityFloat: 2.5,
  stockoutDays: null,
  lastRestockedDate: null,
  category: null,
  tags: [],
  price: 29.99,
  quantity: 100,
  sku: null,
  imageUrl: null,
  description: null,
  weight: null,
  dimensions: null,
  lastUpdated: new Date(),
  lastUpdatedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  shopId: 'test-shop',
  variants: [
    { inventoryQuantity: 100 },
    { inventoryQuantity: 50 },
  ],
  ...overrides,
});

describe('Product Service', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateProductMetrics', () => {
    it('should calculate metrics for product with good stock', () => {
      const product = createMockProduct({
        salesVelocityFloat: 2.5,
        variants: [
          { inventoryQuantity: 100 },
          { inventoryQuantity: 50 },
        ],
      });

      const shopSettings = {
        lowStockThresholdUnits: 20,
        criticalStockThresholdUnits: 10,
        criticalStockoutDays: 7,
      };

      const result = calculateProductMetrics(product, shopSettings);

      expect(result.currentTotalInventory).toBe(150);
      expect(result.stockoutDays).toBe(60); // 150 / 2.5
      expect(result.status).toBe(ProductStatus.OK);
    });

    it('should calculate metrics for product with low stock', () => {
      const product = createMockProduct({
        salesVelocityFloat: 10,
        variants: [
          { inventoryQuantity: 15 },
        ],
      });

      const shopSettings = {
        lowStockThresholdUnits: 20,
        criticalStockThresholdUnits: 10,
        criticalStockoutDays: 7,
      };

      const result = calculateProductMetrics(product, shopSettings);

      expect(result.currentTotalInventory).toBe(15);
      expect(result.stockoutDays).toBe(1.5); // 15 / 10
      expect(result.status).toBe(ProductStatus.Low);
    });

    it('should calculate metrics for product with critical stock', () => {
      const product = createMockProduct({
        salesVelocityFloat: 5,
        variants: [
          { inventoryQuantity: 5 },
        ],
      });

      const shopSettings = {
        lowStockThresholdUnits: 20,
        criticalStockThresholdUnits: 10,
        criticalStockoutDays: 7,
      };

      const result = calculateProductMetrics(product, shopSettings);

      expect(result.currentTotalInventory).toBe(5);
      expect(result.stockoutDays).toBe(1); // 5 / 5
      expect(result.status).toBe(ProductStatus.Critical);
    });

    it('should handle zero inventory', () => {
      const product = createMockProduct({
        salesVelocityFloat: 5,
        variants: [
          { inventoryQuantity: 0 },
        ],
      });

      const shopSettings = {
        lowStockThresholdUnits: 20,
        criticalStockThresholdUnits: 10,
        criticalStockoutDays: 7,
      };

      const result = calculateProductMetrics(product, shopSettings);

      expect(result.currentTotalInventory).toBe(0);
      expect(result.stockoutDays).toBe(0);
      expect(result.status).toBe(ProductStatus.Critical);
    });

    it('should handle zero sales velocity', () => {
      const product = createMockProduct({
        salesVelocityFloat: 0,
        variants: [
          { inventoryQuantity: 100 },
        ],
      });

      const shopSettings = {
        lowStockThresholdUnits: 20,
        criticalStockThresholdUnits: 10,
        criticalStockoutDays: 7,
      };

      const result = calculateProductMetrics(product, shopSettings);

      expect(result.currentTotalInventory).toBe(100);
      expect(result.stockoutDays).toBe(Infinity);
      expect(result.status).toBe(ProductStatus.OK);
    });

    it('should handle null sales velocity', () => {
      const product = createMockProduct({
        salesVelocityFloat: null,
        variants: [
          { inventoryQuantity: 50 },
        ],
      });

      const shopSettings = {
        lowStockThresholdUnits: 20,
        criticalStockThresholdUnits: 10,
        criticalStockoutDays: 7,
      };

      const result = calculateProductMetrics(product, shopSettings);

      expect(result.currentTotalInventory).toBe(50);
      expect(result.stockoutDays).toBe(Infinity);
      expect(result.status).toBe(ProductStatus.OK);
    });
  });

  describe('updateAllProductMetricsForShop', () => {
    it('should update all product metrics for a shop', async () => {
      const mockShop = {
        id: 'test-shop',
        shop: 'test-shop.myshopify.com',
        emailForNotifications: null,
        slackWebhookUrl: null,
        telegramBotToken: null,
        telegramChatId: null,
        whatsAppApiCredentialsJson: null,
        lowStockThreshold: 20,
        criticalStockThreshold: 10,
        highDemandThreshold: 50.0,
        initialSyncCompleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockProducts = [
        createMockProduct({
          id: '1',
          salesVelocityFloat: 2.5,
          variants: [{ inventoryQuantity: 100 }],
        }),
        createMockProduct({
          id: '2',
          salesVelocityFloat: 1.0,
          variants: [{ inventoryQuantity: 5 }],
        }),
      ];

      const mockUpdatedProduct = createMockProduct({
        id: '1',
        status: ProductStatus.OK,
      });

      mockPrisma.shop.findUnique.mockResolvedValue(mockShop);
      mockPrisma.product.findMany.mockResolvedValue(mockProducts);
      mockPrisma.product.update.mockResolvedValue(mockUpdatedProduct);

      const result = await updateAllProductMetricsForShop('test-shop');

      expect(result.success).toBe(true);
      expect(result.updatedCount).toBeGreaterThan(0);
      expect(prisma.shop.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-shop' },
      });
      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { shopId: 'test-shop' },
        include: { variants: true },
      });
    });

    it('should handle shop not found', async () => {
      mockPrisma.shop.findUnique.mockResolvedValue(null);

      const result = await updateAllProductMetricsForShop('non-existent-shop');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Shop not found');
      expect(result.updatedCount).toBe(0);
    });

    it('should handle database errors', async () => {
      mockPrisma.shop.findUnique.mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await updateAllProductMetricsForShop('test-shop');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Database connection failed');
      expect(result.updatedCount).toBe(0);
    });
  });
});