// app/components/common/Card.tsx
import { Card, CardProps } from "@shopify/polaris";
import { ReactNode } // ReactNode might still be useful if the goal is to allow more than just strings, but Polaris Card itself might be restrictive.
                   // For now, let's stick to user's simpler example.

/**
 * A custom Card component that standardizes usage.
 * Titles should be passed as children, for example:
 * <CustomCard>
 *   <BlockStack gap="400"> // Or appropriate spacing elements
 *     <Text as="h2" variant="headingMd">Card Title</Text>
 *     <p>Card content...</p>
 *   </BlockStack>
 * </CustomCard>
 */
export const CustomCard = (props: CardProps) => {
  // The sectioned prop is handled by default padding in the Polaris Card.
  // We just pass through the rest of the props.
  // If 'sectioned' behavior is explicitly desired to be controllable,
  // it can be added to CustomCardProps and passed to <Card sectioned={props.sectioned}>
  return <Card {...props} />;
};
