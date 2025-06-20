import { describe, it, expect } from 'vitest';
import { calculateProductStatus, type VariantForStatus, type ProductStatus } from './product-status.server';

describe('calculateProductStatus', () => {
  const threshold = 10;

  it('should return Unknown for products with no variants', () => {
    expect(calculateProductStatus([], threshold)).toBe<ProductStatus>('Unknown');
    expect(calculateProductStatus(null, threshold)).toBe<ProductStatus>('Unknown');
    expect(calculateProductStatus(undefined, threshold)).toBe<ProductStatus>('Unknown');
  });

  describe('Single Variant Products', () => {
    it('should be Critical if quantity <= threshold / 2', () => {
      const variants: VariantForStatus[] = [{ inventoryQuantity: threshold / 2 }];
      expect(calculateProductStatus(variants, threshold)).toBe<ProductStatus>('Critical');
      const variants2: VariantForStatus[] = [{ inventoryQuantity: 0 }];
      expect(calculateProductStatus(variants2, threshold)).toBe<ProductStatus>('Critical');
      const variants3: VariantForStatus[] = [{ inventoryQuantity: threshold / 2 - 1 }];
      expect(calculateProductStatus(variants3, threshold)).toBe<ProductStatus>('Critical');
    });

    it('should be Low if quantity > threshold / 2 and <= threshold', () => {
      const variants: VariantForStatus[] = [{ inventoryQuantity: threshold }];
      expect(calculateProductStatus(variants, threshold)).toBe<ProductStatus>('Low');
      const variants2: VariantForStatus[] = [{ inventoryQuantity: threshold / 2 + 1 }];
      expect(calculateProductStatus(variants2, threshold)).toBe<ProductStatus>('Low');
    });

    it('should be Healthy if quantity > threshold', () => {
      const variants: VariantForStatus[] = [{ inventoryQuantity: threshold + 1 }];
      expect(calculateProductStatus(variants, threshold)).toBe<ProductStatus>('Healthy');
      const variants2: VariantForStatus[] = [{ inventoryQuantity: 100 }];
      expect(calculateProductStatus(variants2, threshold)).toBe<ProductStatus>('Healthy');
    });

    it('should handle null inventoryQuantity as 0 (Critical)', () => {
      const variants: VariantForStatus[] = [{ inventoryQuantity: null }];
      // Assuming threshold is 10, null (0) <= 10/2 (5) is true
      expect(calculateProductStatus(variants, threshold)).toBe<ProductStatus>('Critical');
    });
  });

  describe('Multiple Variant Products', () => {
    it('should be Critical if any variant is Critical', () => {
      const variants: VariantForStatus[] = [
        { inventoryQuantity: threshold + 5 }, // Healthy
        { inventoryQuantity: threshold / 2 },   // Critical
        { inventoryQuantity: threshold },     // Low
      ];
      expect(calculateProductStatus(variants, threshold)).toBe<ProductStatus>('Critical');
    });

    it('should be Low if no variant is Critical but at least one is Low', () => {
      const variants: VariantForStatus[] = [
        { inventoryQuantity: threshold + 5 }, // Healthy
        { inventoryQuantity: threshold },     // Low
        { inventoryQuantity: threshold / 2 + 1}, // Low
      ];
      expect(calculateProductStatus(variants, threshold)).toBe<ProductStatus>('Low');
    });

    it('should be Healthy if all variants are Healthy', () => {
      const variants: VariantForStatus[] = [
        { inventoryQuantity: threshold + 1 },
        { inventoryQuantity: threshold + 5 },
        { inventoryQuantity: threshold * 2 },
      ];
      expect(calculateProductStatus(variants, threshold)).toBe<ProductStatus>('Healthy');
    });

    it('should correctly prioritize Critical over Low', () => {
       const variants: VariantForStatus[] = [
        { inventoryQuantity: threshold },     // Low
        { inventoryQuantity: threshold / 2 },   // Critical
      ];
      expect(calculateProductStatus(variants, threshold)).toBe<ProductStatus>('Critical');
    });
  });

  describe('Edge Case Thresholds', () => {
    it('should work with threshold of 1', () => {
      // Crit: qty <= 0.5 (so 0); Low: qty <= 1 (and > 0.5, so 1); Healthy: qty > 1
      expect(calculateProductStatus([{ inventoryQuantity: 0 }], 1)).toBe<ProductStatus>('Critical');
      expect(calculateProductStatus([{ inventoryQuantity: 0.5 }], 1)).toBe<ProductStatus>('Critical'); // quantity <= 0.5
      expect(calculateProductStatus([{ inventoryQuantity: 1 }], 1)).toBe<ProductStatus>('Low');
      expect(calculateProductStatus([{ inventoryQuantity: 2 }], 1)).toBe<ProductStatus>('Healthy');
    });

    it('should treat inventoryQuantity of null as 0', () => {
        const variants: VariantForStatus[] = [{ inventoryQuantity: null }];
        // With threshold 10, null (0) is Critical (0 <= 10/2)
        expect(calculateProductStatus(variants, 10)).toBe<ProductStatus>("Critical");
    });

    it('should treat negative inventory as Critical', () => {
        const variants: VariantForStatus[] = [{ inventoryQuantity: -5 }];
         // With threshold 10, -5 is Critical (-5 <= 10/2)
        expect(calculateProductStatus(variants, 10)).toBe<ProductStatus>("Critical");
    });

    // The function currently has `Math.max(1, lowStockThreshold)`.
    // This means a threshold of 0 or negative will be treated as 1.
    it('should handle threshold of 0 as if it is 1', () => {
      // Crit: qty <= 0.5 (so 0); Low: qty <= 1 (and > 0.5, so 1); Healthy: qty > 1
      expect(calculateProductStatus([{ inventoryQuantity: 0 }], 0)).toBe<ProductStatus>('Critical');
      expect(calculateProductStatus([{ inventoryQuantity: 1 }], 0)).toBe<ProductStatus>('Low');
      expect(calculateProductStatus([{ inventoryQuantity: 2 }], 0)).toBe<ProductStatus>('Healthy');
    });

    it('should handle negative threshold as if it is 1', () => {
      expect(calculateProductStatus([{ inventoryQuantity: 0 }], -5)).toBe<ProductStatus>('Critical');
      expect(calculateProductStatus([{ inventoryQuantity: 1 }], -5)).toBe<ProductStatus>('Low');
      expect(calculateProductStatus([{ inventoryQuantity: 2 }], -5)).toBe<ProductStatus>('Healthy');
    });
  });
});
