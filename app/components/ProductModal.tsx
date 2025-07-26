import { useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import type { ProductForTable } from "~/routes/app.products";
import { INTENT } from "~/utils/intents";

interface ProductModalProps {
  open: boolean;
  onClose: () => void;
  product: ProductForTable | null;
  warehouses: Array<{ id: string; name: string; shopifyLocationGid: string | null }>;
}

// Map product names to CSS classes for background colors (matching example)
const getProductClassName = (title: string): string => {
  const titleLower = title.toLowerCase();
  if (titleLower.includes('anastasia') && titleLower.includes('brow')) return 'anastasia-brow-gel';
  if (titleLower.includes('elta') && titleLower.includes('md')) return 'elta-md-sunscreen';
  if (titleLower.includes('borghese') && titleLower.includes('serum')) return 'borghese-serum';
  if (titleLower.includes('kerastase') && titleLower.includes('shampoo')) return 'kerastase-shampoo';
  if (titleLower.includes('mario') && titleLower.includes('badescu')) return 'mario-badescu-spray';
  if (titleLower.includes('t3') && titleLower.includes('hair')) return 't3-hair-dryer';
  return 'default-product';
};

export const ProductModal: React.FC<ProductModalProps> = ({
  open,
  onClose,
  product,
  warehouses,
}) => {
  const fetcher = useFetcher<any>();

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<string>("");
  const [restockQuantity, setRestockQuantity] = useState<string>("");
  const [currentQuantityAtLocation, setCurrentQuantityAtLocation] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (open && product && product.variantsForModal.length > 0) {
      const firstVariant = product.variantsForModal[0];
      setSelectedVariantId(firstVariant.id);

      if (warehouses && warehouses.length > 0) {
        const firstWarehouseId = warehouses[0].id;
        setSelectedWarehouseId(firstWarehouseId);
        const qty = product.inventoryByLocation?.[firstWarehouseId]?.quantity;
        setCurrentQuantityAtLocation(qty ?? 0);
        setQuantity((qty ?? 0).toString());
        
        // Set suggested restock quantity
        const restockSuggestion = Math.ceil((product.salesVelocity || 0) * 5);
        setRestockQuantity(restockSuggestion.toString());
      }
    } else if (!open) {
      // Reset state when modal closes
      setSelectedVariantId(null);
      setSelectedWarehouseId(null);
      setQuantity("");
      setRestockQuantity("");
      setCurrentQuantityAtLocation(null);
      setError(null);
      setSuccess(null);
    }
  }, [open, product, warehouses]);

  const handleRestock = () => {
    const restockQty = parseInt(restockQuantity, 10);
    if (!isNaN(restockQty) && restockQty > 0) {
      const currentQty = parseInt(quantity, 10) || 0;
      const newTotal = currentQty + restockQty;
      setQuantity(newTotal.toString());
      setError(null);
    }
  };

  const handleSubmit = () => {
    if (!selectedVariantId || !selectedWarehouseId || quantity === "") {
      setError("Please select a variant, a warehouse, and enter a quantity.");
      return;
    }

    const selectedWarehouse = warehouses.find(w => w.id === selectedWarehouseId);
    if (!selectedWarehouse?.shopifyLocationGid) {
      setError("Selected warehouse does not have a valid Shopify Location GID.");
      return;
    }

    const numQuantity = parseInt(quantity, 10);
    if (isNaN(numQuantity) || numQuantity < 0) {
      setError("Please enter a valid non-negative quantity.");
      return;
    }

    fetcher.submit(
      {
        intent: INTENT.UPDATE_INVENTORY,
        variantId: selectedVariantId,
        newQuantity: numQuantity.toString(),
        warehouseId: selectedWarehouseId,
        shopifyLocationGid: selectedWarehouse.shopifyLocationGid,
      },
      { method: 'post', action: '/app/products' }
    );
    
    setSuccess("Inventory updated successfully!");
    setTimeout(() => onClose(), 1500);
  };

  if (!open) return null;

  const selectedVariantDetails = product?.variantsForModal.find(v => v.id === selectedVariantId);
  const restockingSuggestion = product ? Math.ceil((product.salesVelocity || 0) * 5) : 0;

  return (
    <div className="pb-modal">
      <div className="pb-modal-content">
        <div className="pb-flex pb-justify-between pb-items-center pb-mb-4">
          <h2 className="pb-text-lg pb-font-medium">{product?.title || "Update Product Inventory"}</h2>
          <button className="text-gray-500" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Product Image and Details */}
        <div className="pb-mb-4">
          <div className={`pb-product-card ${getProductClassName(product?.title || '')} pb-w-full h-48 pb-mb-4`}></div>
          
          <div className="pb-grid pb-grid-cols-2 pb-gap-4 pb-text-sm">
            <div>
              <p><strong>SKU:</strong> {selectedVariantDetails?.sku || 'N/A'}</p>
              <p><strong>Vendor:</strong> {product?.vendor || 'N/A'}</p>
              {/* Category display removed to avoid missing property */}
            </div>
            <div>
              <p><strong>Price:</strong> ${selectedVariantDetails?.price?.toString() || '0.00'}</p>
              <p><strong>Inventory:</strong> {currentQuantityAtLocation ?? 0} units</p>
              <p><strong>Sales Velocity:</strong> {product?.salesVelocity?.toFixed(1) || '0.0'} units/day</p>
            </div>
          </div>
          
          <div className="pb-mt-3">
            <p><strong>Estimated Stockout:</strong> {product?.stockoutDays?.toFixed(2) || '0.00'} days</p>
            <p><strong>Description:</strong> High-quality beauty product from {product?.vendor || 'Planet Beauty'}. 
            Ideal for daily use.</p>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="pb-alert-critical pb-mb-4">
            <p>{error}</p>
          </div>
        )}
        
        {success && (
          <div className="pb-alert-high-sales pb-mb-4">
            <p>{success}</p>
          </div>
        )}

        {/* Form Section */}
        <div className="pb-space-y-4">
          {/* Variant Selection */}
          <div>
            <label className="pb-text-sm pb-font-medium pb-mb-2 block">Select Variant</label>
            <select 
              className="pb-select"
              value={selectedVariantId || ''}
              onChange={(e) => setSelectedVariantId(e.target.value)}
              disabled={fetcher.state === "submitting"}
            >
              {product?.variantsForModal.map(v => (
                <option key={v.id} value={v.id}>
                  {v.title || v.sku || 'N/A'}
                </option>
              ))}
            </select>
          </div>

          {/* Warehouse Selection */}
          <div>
            <label className="pb-text-sm pb-font-medium pb-mb-2 block">Select Warehouse Location</label>
            <select 
              className="pb-select"
              value={selectedWarehouseId || ''}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              disabled={fetcher.state === "submitting" || !selectedVariantId}
            >
              {warehouses.map(w => (
                <option key={w.id} value={w.id} disabled={!w.shopifyLocationGid}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* Current Inventory */}
          <div>
            <label className="pb-text-sm pb-font-medium pb-mb-2 block">
              Current Inventory Quantity 
              {currentQuantityAtLocation !== null && ` (Current: ${currentQuantityAtLocation})`}
            </label>
            <input
              type="number"
              className="pb-input"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min={0}
              disabled={fetcher.state === "submitting" || !selectedVariantId || !selectedWarehouseId}
            />
          </div>

          {/* Restocking Suggestion */}
          <div>
            <h3 className="pb-text-sm pb-font-medium pb-mb-2">Restocking Suggestion</h3>
            <p className="pb-text-sm pb-mb-2">
              Recommended: Reorder {restockingSuggestion} units to cover 5 days of sales.
            </p>
            <div className="pb-flex pb-space-x-2">
              <input
                type="number"
                className="pb-input pb-flex-1"
                placeholder="Restock quantity"
                value={restockQuantity}
                onChange={(e) => setRestockQuantity(e.target.value)}
                min={0}
              />
              <button 
                className="pb-btn-secondary"
                onClick={handleRestock}
                disabled={!restockQuantity || fetcher.state === "submitting"}
              >
                Add to Inventory
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pb-flex pb-justify-end pb-space-x-3 pb-mt-6">
          <button className="pb-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="pb-btn-primary" 
            onClick={handleSubmit}
            disabled={!selectedVariantId || !selectedWarehouseId || quantity === "" || fetcher.state === "submitting"}
          >
            {fetcher.state === "submitting" ? "Saving..." : "Save Inventory"}
          </button>
        </div>
      </div>
    </div>
  );
};
