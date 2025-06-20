import { Card as PolarisCard, CardProps } from '@shopify/polaris';
import React from 'react';

interface CustomCardProps extends Omit<CardProps, 'children'> {
  children: React.ReactNode;
}

export const Card: React.FC<CustomCardProps> = ({ title, children, sectioned = true, ...rest }) => {
  return (
    <PolarisCard title={title} sectioned={sectioned} {...rest}>
      {children}
    </PolarisCard>
  );
};
