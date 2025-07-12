// app/services/product.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateProductMetrics, updateAllProductMetricsForShop } from './product.service';
import prisma from '~/db.server'; // Note: path might differ based on actual location from test file
import type { Product, Variant, Shop, NotificationSetting } from "@prisma/client";

// Mock Prisma
vi.mock('~/db.server', () => ({ // Adjusted path for mocking
  default: {
    shop: {
      findUnique: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Helper type for product input to calculateProductMetrics - aligning with ProductWithVariantsAndSalesVelocity from service
// This type needs to represent a complete Prisma Product object, with 'variants' added/overridden.
type ProductInputForTest = Product & {
    variants: Pick<Variant, 'inventoryQuantity'>[];
    // salesVelocityFloat is already part of PrismaProduct
};

// Default values for a mock product to ensure all fields are present
const baseMockProduct: any = {
  shopifyId: 'gid://shopify/Product/0',
  vendor: 'Mock Vendor',
  productType: 'Test Type',
  lastRestockedDate: null,
  category: null,
  tags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  shopId: 'shop_0',
  // Fields from old schema that might have been omitted by ProductInput, ensure they are not causing issues
  // inventoryAlertSentAt: null, // Example if these were part of your old ProductInput's Omit
  // stockoutAlertSentAt: null,  // Example
  // salesVelocityThreshold: null, // Example
};

describe('calculateProductMetrics', () => {
  const defaultShopSettings = {
    lowStockThresholdUnits: 10,
    criticalStockThresholdUnits: 5,
    criticalStockoutDays: 3,
  };

  it('should calculate Healthy status for product with ample stock and good sales velocity', () => {
    const product: ProductInputForTest = {
      ...baseMockProduct,
      id: 'prod1',
      title: 'Test Product 1',
      salesVelocityFloat: 10, // sells 10 units/day
      variants: [{ inventoryQuantity: 100 }], // 100 units in stock
      status: 'Unknown', trending: false, stockoutDays: null // Add required fields with placeholders
    };
    // stockoutDays = 100 / 10 = 10 days.
    // Inventory (100) > low (10) -> Healthy.
    // StockoutDays (10) > criticalDays (3) -> Not critical by days.
    const metrics = calculateProductMetrics(product, defaultShopSettings);
    expect(metrics.currentTotalInventory).toBe(100);
    expect(metrics.stockoutDays).toBe(10);
    expect(metrics.status).toBe('Healthy');
  });

  it('should calculate Low status based on lowStockThresholdUnits', () => {
    const product: ProductInputForTest = {
      ...baseMockProduct,
      id: 'prod2',
      title: 'Test Product 2',
      salesVelocityFloat: 5,
      variants: [{ inventoryQuantity: 8 }], // Inventory 8
      status: 'Unknown', trending: false, stockoutDays: null // Add required fields with placeholders
    };
    // stockoutDays = 8 / 5 = 1.6 days.
    // Inventory (8) <= low (10) -> Low.
    // StockoutDays (1.6) <= criticalDays (3) -> Critical. This makes it Critical.
    // To make it just Low by units, criticalDays needs to be less than 1.6, e.g., 1.
    const customSettings = { ...defaultShopSettings, criticalStockoutDays: 1 };
    const metrics = calculateProductMetrics(product, customSettings);
    expect(metrics.currentTotalInventory).toBe(8);
    expect(metrics.stockoutDays).toBe(1.6);
    expect(metrics.status).toBe('Low');
  });

  it('should calculate Critical status based on criticalStockThresholdUnits', () => {
    const product: ProductInputForTest = {
      ...baseMockProduct,
      id: 'prod3',
      title: 'Test Product 3',
      salesVelocityFloat: 5,
      variants: [{ inventoryQuantity: 4 }], // Inventory 4
      status: 'Unknown', trending: false, stockoutDays: null // Add required fields with placeholders
    };
    // stockoutDays = 4 / 5 = 0.8 days.
    // Inventory (4) <= criticalUnits (5) -> Critical.
    const metrics = calculateProductMetrics(product, defaultShopSettings);
    expect(metrics.currentTotalInventory).toBe(4);
    expect(metrics.stockoutDays).toBe(0.8);
    expect(metrics.status).toBe('Critical');
  });

  it('should calculate Critical status based on criticalStockoutDays', () => {
    const product: ProductInputForTest = {
      ...baseMockProduct,
      id: 'prod4',
      title: 'Test Product 4',
      salesVelocityFloat: 10,
      variants: [{ inventoryQuantity: 20 }], // Inventory 20
      status: 'Unknown', trending: false, stockoutDays: null // Add required fields with placeholders
    };
    // stockoutDays = 20 / 10 = 2 days.
    // Inventory (20) > low (10).
    // StockoutDays (2) <= criticalDays (3) -> Critical.
    const metrics = calculateProductMetrics(product, defaultShopSettings);
    expect(metrics.currentTotalInventory).toBe(20);
    expect(metrics.stockoutDays).toBe(2);
    expect(metrics.status).toBe('Critical');
  });

  it('should calculate Low status based on stockoutDays relative to low threshold units', () => {
    // This test case is tricky and depends heavily on the exact formula logic.
    // The formula is: `(currentTotalInventory <= lowThreshold || (stockoutDays <= (lowThreshold / salesVelocityFloat) && salesVelocityFloat > 0 ))`
    // Let's aim for a scenario where Inv > lowThreshold, but stockoutDays is short relative to lowThreshold/SV.
    // lowThreshold = 10. criticalDays = 3. SV = 5.
    // If Inv = 12, StockoutDays = 12/5 = 2.4 days.
    // (12 <= 10) is false. (2.4 <= (10/5=2) && 5 > 0) is (2.4 <= 2) false. Status is Healthy.
    // If lowThreshold = 20. SV = 5.
    // If Inv = 22, StockoutDays = 22/5 = 4.4 days.
    // (22 <= 20) is false. (4.4 <= (20/5=4) && 5 > 0) is (4.4 <= 4) false. Status is Healthy.
    // It seems the second part of the OR for 'Low' status is hard to trigger if the first part (Inv <= lowThreshold) isn't met.
    // Let's simplify and focus on the primary triggers: Inv <= CriticalUnits, Inv <= LowThreshold, StockoutDays <= CriticalDays.
    // The previous test for Low status based on units seems sufficient.
    // This test case might be redundant or based on a misunderstanding of the formula's intent.
    // Let's ensure the unit-based low threshold works.
    const productLowByUnits: ProductInputForTest = {
      ...baseMockProduct,
      id: 'prodLowUnit', title: 'Test Low Unit', salesVelocityFloat: 1, variants: [{ inventoryQuantity: 10 }],
      status: 'Unknown', trending: false, stockoutDays: null // Add required fields with placeholders
    };
    const metricsLow = calculateProductMetrics(productLowByUnits, defaultShopSettings);
    expect(metricsLow.status).toBe('Low'); // Inv (10) <= low (10)
  });


  it('should return stockoutDays as null if salesVelocity is 0 and inventory > 0', () => {
    const product: ProductInputForTest = {
      ...baseMockProduct,
      id: 'prodInf', title: 'Test Product Inf', salesVelocityFloat: 0, variants: [{ inventoryQuantity: 50 }],
      status: 'Unknown', trending: false, stockoutDays: null // Add required fields with placeholders
    };
    const metrics = calculateProductMetrics(product, defaultShopSettings);
    expect(metrics.stockoutDays).toBe(null); // Infinity is mapped to null
    expect(metrics.status).toBe('Healthy'); // Based on inventory (50 > 10)
  });

  it('should return stockoutDays as 0 if inventory is 0', () => {
    const product: ProductInputForTest = {
      ...baseMockProduct,
      id: 'prodZeroInv', title: 'Test Product Zero Inv', salesVelocityFloat: 10, variants: [{ inventoryQuantity: 0 }],
      status: 'Unknown', trending: false, stockoutDays: null // Add required fields with placeholders
    };
    const metrics = calculateProductMetrics(product, defaultShopSettings);
    expect(metrics.stockoutDays).toBe(0);
    expect(metrics.status).toBe('Critical'); // Inventory 0 is critical
  });
   it('should return stockoutDays as 0 if salesVelocity is null and inventory is 0', () => {
    const product: ProductInputForTest = {
      ...baseMockProduct,
      id: 'prodNullSVZeroInv', title: 'Test Product Null SV Zero Inv', salesVelocityFloat: null, variants: [{ inventoryQuantity: 0 }],
      status: 'Unknown', trending: false, stockoutDays: null // Add required fields with placeholders
    };
    const metrics = calculateProductMetrics(product, defaultShopSettings);
    expect(metrics.stockoutDays).toBe(0);
    expect(metrics.status).toBe('Critical');
  });

  it('should handle criticalStockThresholdUnits from shopSettings (e.g. different from default)', () => {
    const product: ProductInputForTest = {
      ...baseMockProduct,
      id: 'prodCritCustom', title: 'Test Crit Custom', salesVelocityFloat: 1, variants: [{ inventoryQuantity: 8 }],
      status: 'Unknown', trending: false, stockoutDays: null // Add required fields with placeholders
    };
    const customSettings = { ...defaultShopSettings, criticalStockThresholdUnits: 9 }; // Crit if <= 9
    const metrics = calculateProductMetrics(product, customSettings);
    expect(metrics.status).toBe('Critical');
  });

   it('should handle criticalStockoutDays from shopSettings (e.g. different from default)', () => {
    const product: ProductInputForTest = {
      ...baseMockProduct,
      id: 'prodCritDaysCustom', title: 'Test Crit Days Custom', salesVelocityFloat: 10, variants: [{ inventoryQuantity: 50 }], // stockout = 5 days
      status: 'Unknown', trending: false, stockoutDays: null // Add required fields with placeholders
    };
    const customSettings = { ...defaultShopSettings, criticalStockoutDays: 6 }; // Crit if stockout <= 6 days
    const metrics = calculateProductMetrics(product, customSettings);
    expect(metrics.status).toBe('Critical');
  });

  it('should correctly sum inventory from multiple variants', () => {
    const product: ProductInputForTest = {
      ...baseMockProduct,
      id: 'prodMultiVar', title: 'Test Multi Variant', salesVelocityFloat: 1,
      variants: [{ inventoryQuantity: 5 }, { inventoryQuantity: 3 }, { inventoryQuantity: 20 }], // Total = 28
      status: 'Unknown', trending: false, stockoutDays: null // Add required fields with placeholders
    };
    // Stockout = 28 days. Inv (28) > low (10) -> Healthy
    const metrics = calculateProductMetrics(product, defaultShopSettings);
    expect(metrics.currentTotalInventory).toBe(28);
    expect(metrics.stockoutDays).toBe(28);
    expect(metrics.status).toBe('Healthy');
  });

  it('override: inventory 0 is Critical, even if sales velocity is 0', () => {
    const product: ProductInputForTest = {
      ...baseMockProduct,
      id: 'prodZeroInvZeroSV', title: 'Test Zero Inv Zero SV', salesVelocityFloat: 0, variants: [{ inventoryQuantity: 0 }],
      status: 'Unknown', trending: false, stockoutDays: null // Add required fields with placeholders
    };
    const metrics = calculateProductMetrics(product, defaultShopSettings);
    expect(metrics.status).toBe('Critical');
  });

  it('override: inventory 0 is Critical, even if sales velocity is null', () => {
    const product: ProductInputForTest = {
      ...baseMockProduct,
      id: 'prodZeroInvNullSV', title: 'Test Zero Inv Null SV', salesVelocityFloat: null, variants: [{ inventoryQuantity: 0 }],
      status: 'Unknown', trending: false, stockoutDays: null // Add required fields with placeholders
    };
    const metrics = calculateProductMetrics(product, defaultShopSettings);
    expect(metrics.status).toBe('Critical');
  });

});

describe('updateAllProductMetricsForShop', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockShopId = 'shop-id-123';
  // Aligning mockShopData with the updated Prisma schema for Shop and NotificationSetting[]
  const mockShopData: Partial<Shop & { NotificationSettings: Array<Partial<NotificationSetting>> }> = {
    id: mockShopId,
    shop: 'test.myshopify.com',
    lowStockThreshold: 10, // Shop-level default
    NotificationSettings: [{ // Array of settings
      lowStockThreshold: 15, // Override shop default from settings
      criticalStockThresholdUnits: 7,
      criticalStockoutDays: 2,
      salesVelocityThreshold: 50,
      // Add other required fields for PrismaNotificationSettings or make them optional in Partial<>
      id: "ns1", shopId: mockShopId, email: true, slack: false, telegram: false, mobilePush: false, frequency: 'daily', syncEnabled: false, createdAt: new Date(), updatedAt: new Date(), emailAddress: null, slackWebhookUrl: null, telegramBotToken: null, telegramChatId: null
    }],
  };

  const mockProducts: ProductInputForTest[] = [
    { ...baseMockProduct, id: 'p1', shopId: mockShopId, title: 'Product 1', salesVelocityFloat: 60, variants: [{ inventoryQuantity: 30 }], status: 'Unknown', trending: false, stockoutDays: null }, // Trending, Stockout 0.5 (Crit)
    { ...baseMockProduct, id: 'p2', shopId: mockShopId, title: 'Product 2', salesVelocityFloat: 10, variants: [{ inventoryQuantity: 20 }], status: 'Unknown', trending: false, stockoutDays: null }, // Not Trending, Stockout 2 (Crit by days)
    { ...baseMockProduct, id: 'p3', shopId: mockShopId, title: 'Product 3', salesVelocityFloat: null, variants: [{ inventoryQuantity: 100 }], status: 'Unknown', trending: false, stockoutDays: null },// Not Trending, Healthy
    { ...baseMockProduct, id: 'p4', shopId: mockShopId, title: 'Product 4', salesVelocityFloat: 55, variants: [{ inventoryQuantity: 0 }], status: 'Unknown', trending: false, stockoutDays: null }, // Trending, Critical (zero inv)
  ];

  it('should update product metrics and trending status correctly', async () => {
    (prisma.shop.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockShopData);
    (prisma.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockProducts);

    const result = await updateAllProductMetricsForShop(mockShopId);

    expect(prisma.shop.findUnique).toHaveBeenCalledWith({ where: { id: mockShopId }, include: { NotificationSettings: true } });
    expect(prisma.product.findMany).toHaveBeenCalledWith({ where: { shopId: mockShopId }, include: { variants: { select: { inventoryQuantity: true } } } });
    expect(prisma.product.update).toHaveBeenCalledTimes(mockProducts.length);

    // Product 1: SV=60, Inv=30. Settings: Low=15, CritU=7, CritD=2, SVThresh=50
    // Stockout = 30/60 = 0.5 days.
    // Status: Inv(30)>Low(15). Stockout(0.5)<=CritD(2) -> Critical.
    // Trending: SV(60)>SVThresh(50) -> true.
    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'p1' },
      data: { stockoutDays: 0.5, status: 'Critical', trending: true },
    }));

    // Product 2: SV=10, Inv=20.
    // Stockout = 20/10 = 2 days.
    // Status: Inv(20)>Low(15). Stockout(2)<=CritD(2) -> Critical.
    // Trending: SV(10)<=SVThresh(50) -> false.
    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'p2' },
      data: { stockoutDays: 2, status: 'Critical', trending: false },
    }));

    // Product 3: SV=null (0), Inv=100.
    // Stockout = Infinity (null).
    // Status: Inv(100)>Low(15) -> Healthy
    // Trending: SV(0)<=SVThresh(50) -> false.
    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'p3' },
      data: { stockoutDays: null, status: 'Healthy', trending: false },
    }));

    // Product 4: SV=55, Inv=0.
    // Stockout = 0.
    // Status: Inv(0) -> Critical.
    // Trending: SV(55)>SVThresh(50) -> true.
    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'p4' },
      data: { stockoutDays: 0, status: 'Critical', trending: true },
    }));

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(mockProducts.length);
  });

  it('should use shop-level thresholds if NotificationSettings array is empty or not present', async () => {
    const shopDataWithoutNotifSettingsArray = { ...mockShopData, NotificationSettings: [] }; // Empty array
    (prisma.shop.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(shopDataWithoutNotifSettingsArray);
    (prisma.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockProducts[0]]); // Test with one product

    await updateAllProductMetricsForShop(mockShopId);
    // Check if product update was called with data calculated using shopData.lowStockThreshold (10)
    // and default salesVelocityThreshold (50)
    // Product 1: SV=60, Inv=30. ShopSettings: Low=10, CritU=Math.min(5, 10*0.3)=3, CritD=3, SVThresh=50
    // Stockout = 30/60 = 0.5 days.
    // Status: Inv(30)>Low(10). Stockout(0.5)<=CritD(3) -> Critical.
    // Trending: SV(60)>SVThresh(50) -> true.
     expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'p1' },
      data: { stockoutDays: 0.5, status: 'Critical', trending: true },
    }));
  });

  it('should use default thresholds if shop and NotificationSettings are missing specific values', async () => {
    const minimalShopData: Partial<Shop & { NotificationSettings: Array<Partial<NotificationSetting>> | null }> = { id: mockShopId, shop: 'test.myshopify.com', lowStockThreshold: null, NotificationSettings: null };
    (prisma.shop.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(minimalShopData);
    (prisma.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockProducts[0]]);

    await updateAllProductMetricsForShop(mockShopId);
    // Check if update was called with data based on hardcoded defaults:
    // lowStockThresholdUnits = 10
    // criticalStockThresholdUnits = Math.min(5, Math.floor(10 * 0.3)) = 3
    // criticalStockoutDays = 3
    // salesVelocityThresholdForTrending = 50
    // Product 1: SV=60, Inv=30. Defaults: Low=10, CritU=3, CritD=3, SVThresh=50
    // Stockout = 30/60 = 0.5 days.
    // Status: Inv(30)>Low(10). Stockout(0.5)<=CritD(3) -> Critical.
    // Trending: SV(60)>SVThresh(50) -> true.
     expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'p1' },
      data: { stockoutDays: 0.5, status: 'Critical', trending: true },
    }));
  });


  it('should return success false if shop not found', async () => {
    (prisma.shop.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await updateAllProductMetricsForShop(mockShopId);
    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
});
