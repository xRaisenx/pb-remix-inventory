// app/components/common/Card.tsx
import { Card, type CardProps } from "@shopify/polaris";
import React from "react";

/**
 * A custom Card component that standardizes usage.
 * It passes all props to the underlying Polaris Card.
 * Using this wrapper ensures consistency if we decide to add custom logic later.
 */
export const CustomCard: React.FC<CardProps> = (props) => {
  return <Card {...props} />;
};
