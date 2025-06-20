/**
 * Minimal interface representing a product variant for status calculation.
 */
export interface VariantForStatus {
  /** The current inventory quantity of the variant. Can be null if not set. */
  inventoryQuantity: number | null;
}

/**
 * Represents the calculated inventory status of a product.
 * - **Critical**: Inventory is very low (e.g., at or below half the low stock threshold).
 * - **Low**: Inventory is below the low stock threshold but not critical.
 * - **Healthy**: Inventory is above the low stock threshold.
 * - **Unknown**: Status cannot be determined (e.g., product has no variants with inventory).
 */
export type ProductStatus = "Critical" | "Low" | "Healthy" | "Unknown";

/**
 * Calculates the overall status of a product based on the inventory levels of its variants
 * and a given low stock threshold.
 *
 * @param productVariants An array of variants for the product.
 *                        Each variant must conform to the `VariantForStatus` interface.
 *                        If null, undefined, or empty, the status will be 'Unknown'.
 * @param lowStockThreshold The threshold below which inventory is considered low.
 *                          The function treats this as at least 1 (i.e., `Math.max(1, lowStockThreshold)`).
 * @returns The calculated `ProductStatus` ("Critical", "Low", "Healthy", or "Unknown").
 */
export function calculateProductStatus(
  productVariants: VariantForStatus[] | null | undefined,
  lowStockThreshold: number,
): ProductStatus {
  // Ensure lowStockThreshold is at least 1 for sensible calculations.
  // E.g. if threshold is 0, 0/2 = 0, so item with 0 quantity is critical.
  // If threshold is 1, 1/2 = 0.5, item with 0 quantity is critical.
  const effectiveThreshold = Math.max(1, lowStockThreshold);

  if (!productVariants || productVariants.length === 0) {
    return "Unknown";
  }

  let isCritical = false;
  let isLow = false;

  for (const variant of productVariants) {
    // Treat null or undefined inventoryQuantity as 0 for safety, or as per business rule.
    const quantity = variant.inventoryQuantity ?? 0;

    if (quantity <= effectiveThreshold / 2) {
      isCritical = true;
      break; // Product is critical, no need to check other variants
    }
    if (quantity <= effectiveThreshold) {
      isLow = true;
    }
  }

  if (isCritical) {
    return "Critical";
  }
  if (isLow) {
    return "Low";
  }
  return "Healthy";
}
