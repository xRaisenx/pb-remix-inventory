import { Button as PolarisButton, ButtonProps } from '@shopify/polaris';
import React from 'react';

export type CommonButtonProps = ButtonProps;

export const Button: React.FC<CommonButtonProps> = ({ children, onClick, ...rest }) => {
  return <PolarisButton onClick={onClick} {...rest}>{children}</PolarisButton>;
};
