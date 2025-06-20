// app/components/ProductModal.tsx
import { Modal, Text, BlockStack, TextField, Button, Grid, FormLayout, Select, Spinner, Banner, InlineStack } from "@shopify/polaris";
import { useCallback, useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import type { ShopifyProduct } from "~/types"; // Import updated type

interface ProductDetailsFetcherData {
  product?: {
    id: string; // Product GID
    title: string;
    variants: {
      edges: Array<{ 
        node: {
          id: string; // Variant GID
          title: string;
          sku: string | null;
          price: string;
          inventoryQuantity: number | null;
          inventoryItem: {
            id: string; // InventoryItem GID
          };
        }
      }>;
    };
  };
  error?: string;
  details?: any; // For GraphQL errors
}

interface ProductModalProps {
  open: boolean;
  onClose: () => void;
  product: ShopifyProduct | null; // Using the updated type definition
  warehouseShopifyLocationGid: string | null; // Shopify Location GID of the selected warehouse
  onUpdateInventoryAction: (data: {
    productId: string; // Shopify Product GID
    variantId: string; // Shopify Variant GID
    inventoryItemId: string; // Shopify InventoryItem GID
    shopifyLocationGid: string; // Shopify Location GID (from warehouse context)
    quantity: number;
  }) => void;
  isUpdating: boolean; // Indicates if an update is in progress
}

export default function ProductModal({
  open,
  onClose,
  product,
  warehouseShopifyLocationGid,
  onUpdateInventoryAction,
  isUpdating,
}: ProductModalProps) {
  const fetcher = useFetcher<ProductDetailsFetcherData>();
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleVariantChange = useCallback((variantId: string) => {
    setSelectedVariantId(variantId);
    setError(null);
  }, []);

  const handleQuantityChange = useCallback((value: string) => {
    const parsedValue = parseInt(value, 10);
    setQuantity(isNaN(parsedValue) ? null : parsedValue);
  }, []);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (!selectedVariantId || quantity === null) return;

      setIsLoading(true);
      setError(null);
      setSuccess(false);

      const variant = product?.variants.find(
        (v) => v.id === selectedVariantId
      );

      if (!variant) {
        setError("Selected variant not found.");
        setIsLoading(false);
        return;
      }

      const productId = product?.id ?? "";
      const variantId = variant.id;
      const inventoryItemId = variant.inventoryItem?.id ?? "";

      onUpdateInventoryAction({
        productId,
        variantId,
        inventoryItemId,
        shopifyLocationGid: warehouseShopifyLocationGid!,
        quantity,
      }); // Remove .then/.catch/.finally, assume onUpdateInventoryAction is sync or handle async outside
    },
    [
      selectedVariantId,
      quantity,
      product,
      onUpdateInventoryAction,
      warehouseShopifyLocationGid,
    ]
  );

  useEffect(() => {
    if (!open) {
      setSelectedVariantId(null);
      setQuantity(null);
      setError(null);
      setSuccess(false);
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Update Product Inventory"
      primaryAction={{
        content: "Save",
        onAction: () => handleSubmit({ preventDefault: () => {} } as React.FormEvent),
        loading: isLoading,
        disabled: isLoading || !selectedVariantId || quantity === null,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        {error && (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}
        {success && (
          <Banner tone="success" onDismiss={() => setSuccess(false)}>
            Inventory updated successfully!
          </Banner>
        )}
        <FormLayout>
          <Select
            label="Variant"
            options={
              product?.variants.map((v) => ({
                label: v.title ?? v.id,
                value: v.id,
              })) || []
            }
            onChange={handleVariantChange}
            value={selectedVariantId ?? undefined}
            disabled={isLoading}
          />
          <TextField
            label="Quantity"
            value={quantity !== null ? quantity.toString() : ""}
            onChange={handleQuantityChange}
            type="number"
            min={0}
            disabled={isLoading}
            autoComplete="off"
          />
        </FormLayout>
      </Modal.Section>
    </Modal>
  );
}