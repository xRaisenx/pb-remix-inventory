import { Text as PolarisText, TextProps } from '@shopify/polaris';
import React from 'react';

// Re-exporting Polaris TextProps for convenience if needed elsewhere
export type CommonTextProps = TextProps;

export const Text: React.FC<CommonTextProps> = ({ children, ...rest }) => {
  return <PolarisText {...rest}>{children}</PolarisText>;
};
