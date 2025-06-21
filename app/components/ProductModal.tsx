import { Modal, TextField, FormLayout, Select, Banner, Text, BlockStack } from "@shopify/polaris";
import { useCallback, useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import { useToast } from "@shopify/app-bridge-react";
import type { ProductForTable } from "~/routes/app.products"; // Adjust path as needed
import { INTENT } from "~/utils/intents";

interface ProductModalProps {
  open: boolean;
  onClose: () => void;
  product: ProductForTable | null;
  warehouses: Array<{ id: string; name: string; shopifyLocationGid: string | null }>; // Added warehouses
}

export const ProductModal: React.FC<ProductModalProps> = ({
  open,
  onClose,
  product,
  warehouses, // Added warehouses
}) => {
  const fetcher = useFetcher<any>();
  const { show: showToast } = useToast();
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null); // Added
  const [quantity, setQuantity] = useState<string>("");
  const [currentQuantityAtLocation, setCurrentQuantityAtLocation] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Effect to reset form when modal opens or product/warehouses change
  useEffect(() => {
    if (open && product && product.variantsForModal.length > 0) {
      const firstVariant = product.variantsForModal[0];
      setSelectedVariantId(firstVariant.id);
      // setQuantity((firstVariant.inventoryQuantity ?? 0).toString()); // Total quantity for variant

      // If warehouses are available, pre-select the first one
      if (warehouses && warehouses.length > 0) {
        const firstWarehouseId = warehouses[0].id;
        setSelectedWarehouseId(firstWarehouseId);
        // Update current quantity display for this variant at this warehouse
        const qty = product.inventoryByLocation?.[firstWarehouseId]?.quantity;
        setCurrentQuantityAtLocation(qty ?? 0);
        setQuantity((qty ?? 0).toString()); // Set initial quantity input to current at location
      } else {
        setSelectedWarehouseId(null);
        setCurrentQuantityAtLocation(0);
        // Fallback if no warehouses or inventoryByLocation not populated for the first warehouse
        setQuantity((firstVariant.inventoryQuantity ?? 0).toString());
      }
    } else if (!open) {
      setSelectedVariantId(null);
      setSelectedWarehouseId(null);
      setQuantity("");
      setCurrentQuantityAtLocation(null);
      setError(null);
      setSuccess(null);
    }
  }, [open, product, warehouses]);

  // Effect to handle fetcher state (e.g., after submission)
  useEffect(() => {
    // This effect handles in-modal banners
    if (fetcher.state === 'idle' && fetcher.data && !fetcher.data.success && fetcher.data.error) {
      setError(fetcher.data.error);
      setSuccess(null);
    }
    // The success case for in-modal banner is handled below with toast
    // to avoid showing banner and toast for the same success.
  }, [fetcher.state, fetcher.data]);

  // Effect for showing toasts based on fetcher result
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      if (fetcher.data.success) {
        // Show success toast
        showToast(fetcher.data.message || "Inventory updated!", { duration: 3000 });
        // Set internal success message for banner (optional, if modal doesn't close immediately)
        setSuccess(fetcher.data.message || "Inventory updated successfully!");
        setError(null);
        onClose(); // Close modal on success
      } else if (fetcher.data.error) {
        // Error toast is shown if not handled by the banner effect above,
        // or if you want both banner and toast for errors.
        // For now, relying on the banner for detailed errors within modal.
        // If the modal were to close on error too, a toast here would be good.
        // showToast(fetcher.data.error, { duration: 5000, isError: true });
      }
    }
  }, [fetcher.state, fetcher.data, showToast, onClose]);


  const handleVariantChange = useCallback((variantId: string) => {
    setSelectedVariantId(variantId);
    const selectedVar = product?.variantsForModal.find(v => v.id === variantId);
    // When variant changes, if a warehouse is already selected, update quantity field
    // with that warehouse's current product inventory. Otherwise, use variant's total.
    if (selectedWarehouseId && product?.inventoryByLocation?.[selectedWarehouseId]) {
      const qtyAtLocation = product.inventoryByLocation[selectedWarehouseId].quantity;
      setQuantity((qtyAtLocation ?? 0).toString());
      setCurrentQuantityAtLocation(qtyAtLocation ?? 0);
    } else {
      setQuantity((selectedVar?.inventoryQuantity ?? 0).toString()); // Fallback to variant's total
      setCurrentQuantityAtLocation(selectedVar?.inventoryQuantity ?? 0); // Or null if more appropriate
    }
    setError(null);
    setSuccess(null);
  }, [product, selectedWarehouseId]);

  const handleWarehouseChange = useCallback((warehouseId: string) => {
    setSelectedWarehouseId(warehouseId);
    // When warehouse changes, update quantity field with its current product inventory
    if (product?.inventoryByLocation?.[warehouseId]) {
      const qtyAtLocation = product.inventoryByLocation[warehouseId].quantity;
      setQuantity((qtyAtLocation ?? 0).toString());
      setCurrentQuantityAtLocation(qtyAtLocation ?? 0);
    } else {
      // Fallback if inventory data for this warehouse isn't available for the product
      // This might mean setting quantity to 0 or to the selected variant's total quantity
      const selectedVar = product?.variantsForModal.find(v => v.id === selectedVariantId);
      setQuantity((selectedVar?.inventoryQuantity ?? 0).toString()); // Or "0"
      setCurrentQuantityAtLocation(null); // Indicate N/A
    }
    setError(null);
    setSuccess(null);
  }, [product, selectedVariantId]);

  const handleQuantityChange = useCallback((value: string) => {
    setQuantity(value);
    setError(null); // Clear error when user types
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

    fetcher.submit(
      {
        intent: INTENT.UPDATE_INVENTORY,
        variantId: selectedVariantId,
        newQuantity: numQuantity.toString(),
        warehouseId: selectedWarehouseId, // Prisma Warehouse ID
        shopifyLocationGid: selectedWarehouse.shopifyLocationGid, // Shopify Location GID
      },
      { method: 'post', action: '/app/products' }
    );
  };

  const selectedVariantDetails = product?.variantsForModal.find(v => v.id === selectedVariantId);
  const currentInventoryLabel = selectedWarehouseId && product?.inventoryByLocation?.[selectedWarehouseId] !== undefined
    ? `(Current at selected location: ${product.inventoryByLocation[selectedWarehouseId].quantity})`
    : selectedVariantId && selectedVariantDetails
    ? `(Variant total: ${selectedVariantDetails.inventoryQuantity ?? 0})`
    : '';
  const restockingSuggestion = product ? Math.ceil((product.salesVelocity || 0) * 5) : 0; // 5 days of sales

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
                label: `${v.sku || 'N/A'} (Current: ${v.inventoryQuantity ?? 0})`,
                value: v.id
              })) || []
            }
            onChange={handleVariantChange}
            value={selectedVariantId || undefined}
            disabled={fetcher.state === "submitting"}
          />
          <Select
            label="Select Warehouse Location"
            options={
              warehouses.map(w => ({
                label: w.name,
                value: w.id,
                disabled: !w.shopifyLocationGid, // Disable if no GID
              })) || []
            }
            onChange={handleWarehouseChange}
            value={selectedWarehouseId || undefined}
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