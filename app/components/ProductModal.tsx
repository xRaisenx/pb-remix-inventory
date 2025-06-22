import { Modal, TextField, FormLayout, Select, Banner, Text, BlockStack } from "@shopify/polaris";
import { useCallback, useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { ProductForTable } from "~/routes/app.products";
import { INTENT } from "~/utils/intents";

interface ProductModalProps {
  open: boolean;
  onClose: () => void;
  product: ProductForTable | null;
  warehouses: Array<{ id: string; name: string; shopifyLocationGid: string | null }>;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  open,
  onClose,
  product,
  warehouses,
}) => {
  const fetcher = useFetcher<any>();
  const app = useAppBridge(); // Correct way to get App Bridge instance
  // const toast = useToast(); // This is deprecated

  const showToast = (content: string, isError = false) => {
    app.toast.show(content, { isError, duration: 3000 }); // Use app.toast.show()
  };

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<string>("");
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
        // Try to find quantity for the first variant at the first warehouse
        const qty = product.inventoryByLocation?.[firstWarehouseId]?.quantity;
        setCurrentQuantityAtLocation(qty ?? 0);
        setQuantity((qty ?? 0).toString());
      } else {
        // Fallback if no warehouses or no specific inventory for the first warehouse
        setSelectedWarehouseId(null);
        setCurrentQuantityAtLocation(0); // Or handle as appropriate
        setQuantity((firstVariant.inventoryQuantity ?? 0).toString());
      }
    } else if (!open) {
      // Reset state when modal closes
      setSelectedVariantId(null);
      setSelectedWarehouseId(null);
      setQuantity("");
      setCurrentQuantityAtLocation(null);
      setError(null);
      setSuccess(null);
    }
  }, [open, product, warehouses]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      if (fetcher.data.success) {
        showToast(fetcher.data.message || "Inventory updated!");
        setSuccess(fetcher.data.message || "Inventory updated successfully!");
        setError(null);
        onClose(); // Close modal on success
      } else if (fetcher.data.error) {
        // showToast(fetcher.data.error, true); // Optionally show toast for error too
        setError(fetcher.data.error);
        setSuccess(null);
      }
    }
  }, [fetcher.state, fetcher.data, showToast, onClose]);

  const handleVariantChange = useCallback((variantId: string) => {
    setSelectedVariantId(variantId);
    const selectedVar = product?.variantsForModal.find(v => v.id === variantId);

    if (selectedWarehouseId && product?.inventoryByLocation?.[selectedWarehouseId]) {
      // If a warehouse is selected, use its specific quantity for THIS variant
      // This part might need adjustment if inventoryByLocation is per product, not per variant-location
      const qtyAtLocation = product.inventoryByLocation[selectedWarehouseId].quantity;
      setQuantity((qtyAtLocation ?? 0).toString());
      setCurrentQuantityAtLocation(qtyAtLocation ?? 0);
    } else {
      // Fallback to total variant inventory if no specific location quantity is found/applicable
      setQuantity((selectedVar?.inventoryQuantity ?? 0).toString());
      setCurrentQuantityAtLocation(selectedVar?.inventoryQuantity ?? 0);
    }
    setError(null);
    setSuccess(null);
  }, [product, selectedWarehouseId]);

  const handleWarehouseChange = useCallback((warehouseId: string) => {
    setSelectedWarehouseId(warehouseId);
    // When warehouse changes, update quantity based on selected variant and new warehouse
    if (product?.inventoryByLocation?.[warehouseId]) {
      const qtyAtLocation = product.inventoryByLocation[warehouseId].quantity;
      setQuantity((qtyAtLocation ?? 0).toString());
      setCurrentQuantityAtLocation(qtyAtLocation ?? 0);
    } else {
      // If no specific inventory for this warehouse, fall back to variant's total or 0
      const selectedVar = product?.variantsForModal.find(v => v.id === selectedVariantId);
      setQuantity((selectedVar?.inventoryQuantity ?? 0).toString()); // Or set to 0 or prompt
      setCurrentQuantityAtLocation(null); // Indicate quantity is not specific to this location
    }
    setError(null);
    setSuccess(null);
  }, [product, selectedVariantId]);

  const handleQuantityChange = useCallback((value: string) => {
    setQuantity(value);
    setError(null); // Clear previous errors on new input
    setSuccess(null);
  }, []);

  const handleSubmit = () => {
    if (!selectedVariantId || !selectedWarehouseId || quantity === "") {
      setError("Please select a variant, a warehouse, and enter a quantity.");
      return;
    }

    const selectedWarehouse = warehouses.find(w => w.id === selectedWarehouseId);
    if (!selectedWarehouse?.shopifyLocationGid) {
      setError("Selected warehouse does not have a valid Shopify Location GID. Cannot update inventory.");
      return;
    }

    const numQuantity = parseInt(quantity, 10);
    if (isNaN(numQuantity) || numQuantity < 0) {
        setError("Please enter a valid non-negative quantity.");
        return;
    }

    // Use currentQuantityAtLocation to prevent submitting if the quantity hasn't changed
    if (currentQuantityAtLocation !== null && numQuantity === currentQuantityAtLocation) {
      setError("The new quantity is the same as the current quantity at this location. No changes made.");
      // Or, alternatively, show a success/info toast that no update was needed.
      // For now, setting an error to prevent submission.
      return;
    }

    fetcher.submit(
      {
        intent: INTENT.UPDATE_INVENTORY,
        variantId: selectedVariantId, // This should be the Prisma Variant ID
        newQuantity: numQuantity.toString(),
        warehouseId: selectedWarehouseId, // Prisma Warehouse ID
        shopifyLocationGid: selectedWarehouse.shopifyLocationGid, // Shopify Location GID
      },
      { method: 'post', action: '/app/products' } // Or your designated inventory update action route
    );
  };

  // UI display logic
  const selectedVariantDetails = product?.variantsForModal.find(v => v.id === selectedVariantId);
  const currentInventoryLabel = selectedWarehouseId && product?.inventoryByLocation?.[selectedWarehouseId] !== undefined
    ? `(Current at selected location: ${product.inventoryByLocation[selectedWarehouseId].quantity})`
    : selectedVariantId && selectedVariantDetails
    ? `(Variant total: ${selectedVariantDetails.inventoryQuantity ?? 0})`
    : '';
  const restockingSuggestion = product ? Math.ceil((product.salesVelocity || 0) * 5) : 0;


  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product?.title || "Update Product Inventory"}
      primaryAction={{
        content: "Save Inventory",
        onAction: handleSubmit,
        loading: fetcher.state === "submitting",
        disabled: !selectedVariantId || !selectedWarehouseId || quantity === "" || fetcher.state === "submitting" || !warehouses.find(w => w.id === selectedWarehouseId)?.shopifyLocationGid,
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        {error && <Banner tone="critical" onDismiss={() => setError(null)}>{error}</Banner>}
        {success && <Banner tone="success" onDismiss={() => setSuccess(null)}>{success}</Banner>}

        <BlockStack gap="300">
          <Text as="p" variant="bodyMd"><strong>Vendor:</strong> {product?.vendor}</Text>
          <Text as="p" variant="bodyMd"><strong>Status:</strong> {product?.status}</Text>
          <Text as="p" variant="bodyMd"><strong>Sales Velocity:</strong> {product?.salesVelocity?.toFixed(2)} units/day</Text>
          <Text as="p" variant="bodyMd"><strong>Est. Stockout:</strong> {product?.stockoutDays?.toFixed(0)} days</Text>
          <Text as="p" variant="bodyMd"><strong>Restocking Suggestion (5 days):</strong> {restockingSuggestion} units</Text>
          <hr/>
        </BlockStack>

        <FormLayout>
          <Select
            label="Select Variant"
            options={
              product?.variantsForModal.map(v => ({
                label: `${v.title || v.sku || 'N/A'} (Current: ${v.inventoryQuantity ?? 0})`, // Display variant title or SKU
                value: v.id // This should be Prisma Variant ID
              })) || []
            }
            onChange={handleVariantChange}
            value={selectedVariantId || undefined} // Ensure value is string or undefined
            disabled={fetcher.state === "submitting"}
          />
          <Select
            label="Select Warehouse Location"
            options={
              warehouses.map(w => ({
                label: w.name,
                value: w.id, // This is Prisma Warehouse ID
                disabled: !w.shopifyLocationGid, // Disable if no Shopify GID
              })) || []
            }
            onChange={handleWarehouseChange}
            value={selectedWarehouseId || undefined} // Ensure value is string or undefined
            disabled={fetcher.state === "submitting" || !selectedVariantId}
            helpText={!selectedWarehouseId && warehouses.length > 0 ? "Please select a warehouse." : warehouses.find(w => w.id === selectedWarehouseId && !w.shopifyLocationGid) ? "This warehouse is missing its Shopify Location GID and cannot be updated." : ""}
          />
          <TextField
            label={`New Inventory Quantity ${currentInventoryLabel}`}
            value={quantity}
            onChange={handleQuantityChange}
            type="number"
            min={0}
            disabled={fetcher.state === "submitting" || !selectedVariantId || !selectedWarehouseId || !warehouses.find(w => w.id === selectedWarehouseId)?.shopifyLocationGid}
            autoComplete="off"
          />
        </FormLayout>
      </Modal.Section>
    </Modal>
  );
};