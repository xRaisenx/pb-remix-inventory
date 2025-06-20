import { Modal as PolarisModal, ModalProps } from '@shopify/polaris';
import React from 'react';

interface CustomModalProps extends Omit<ModalProps, 'open' | 'onClose' | 'title' | 'children'> {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  primaryAction?: ModalProps['primaryAction'];
  secondaryActions?: ModalProps['secondaryActions'];
}

export const Modal: React.FC<CustomModalProps> = ({
  open,
  onClose,
  title,
  children,
  primaryAction,
  secondaryActions,
  ...rest
}) => {
  return (
    <PolarisModal
      open={open}
      onClose={onClose}
      title={title}
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
      {...rest}
    >
      <PolarisModal.Section>
        {children}
      </PolarisModal.Section>
    </PolarisModal>
  );
};
