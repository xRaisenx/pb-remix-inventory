import { Modal, TextField, FormLayout, Select, Banner, Text, BlockStack } from "@shopify/polaris";
import { useCallback, useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import type { ProductForTable } from "~/routes/app.products"; // Adjust path as needed

interface ProductModalProps {
  open: boolean;
  onClose: () => void;
  product: ProductForTable | null;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  open,
  onClose,
  product,
}) => {
  const fetcher = useFetcher();
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<string>(""); // Store as string for TextField
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Effect to reset form when modal opens or product changes
  useEffect(() => {
    if (open && product && product.variantsForModal.length > 0) {
      // Default to first variant if available
      const firstVariant = product.variantsForModal[0];
      setSelectedVariantId(firstVariant.id);
      setQuantity((firstVariant.inventoryQuantity ?? 0).toString());
    } else if (!open) {
      setSelectedVariantId(null);
      setQuantity("");
      setError(null);
      setSuccess(null);
    }
  }, [open, product]);

  // Effect to handle fetcher state (e.g., after submission)
  useEffect(() => {
    if (fetcher.data) {
      if ((fetcher.data as any).error) {
        setError((fetcher.data as any).error);
        setSuccess(null);
      } else if ((fetcher.data as any).success) {
        setSuccess("Inventory updated successfully!");
        setError(null);
        // Optionally close modal on success, or keep it open
        // onClose();
      }
    }
  }, [fetcher.data, onClose]);


  const handleVariantChange = useCallback((variantId: string) => {
    setSelectedVariantId(variantId);
    const selectedVar = product?.variantsForModal.find(v => v.id === variantId);
    setQuantity((selectedVar?.inventoryQuantity ?? 0).toString());
    setError(null);
    setSuccess(null);
  }, [product]);

  const handleQuantityChange = useCallback((value: string) => {
    setQuantity(value);
    setError(null); // Clear error when user types
    setSuccess(null);
  }, []);

  const handleSubmit = () => {
    if (!selectedVariantId || quantity === "" ) {
        setError("Please select a variant and enter a quantity.");
        return;
    }
    const numQuantity = parseInt(quantity, 10);
    if (isNaN(numQuantity) || numQuantity < 0) {
        setError("Please enter a valid non-negative quantity.");
        return;
    }

    fetcher.submit(
      {
        intent: 'updateInventory',
        variantId: selectedVariantId,
        newQuantity: numQuantity.toString(), // Send as string, action will parse
      },
      { method: 'post', action: '/app/products' } // Action route
    );
  };

  const selectedVariantDetails = product?.variantsForModal.find(v => v.id === selectedVariantId);
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
        disabled: !selectedVariantId || quantity === "" || fetcher.state === "submitting",
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
            value={selectedVariantId || undefined} // Ensure value is string or undefined
            disabled={fetcher.state === "submitting"}
          />
          <TextField
            label="New Inventory Quantity"
            value={quantity}
            onChange={handleQuantityChange}
            type="number"
            min={0}
            disabled={fetcher.state === "submitting" || !selectedVariantId}
            autoComplete="off"
          />
        </FormLayout>
      </Modal.Section>
    </Modal>
  );
};