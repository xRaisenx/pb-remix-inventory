import { Form as PolarisForm, FormProps } from '@shopify/polaris';
import React from 'react';

interface CustomFormProps extends Omit<FormProps, 'onSubmit' | 'children'> {
  onSubmit: () => void; // Or React.FormEventHandler<HTMLFormElement> if needed for event
  children: React.ReactNode;
}

export const Form: React.FC<CustomFormProps> = ({ onSubmit, children, ...rest }) => {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // Prevent default browser submission
    onSubmit();
  };

  return (
    <PolarisForm onSubmit={handleSubmit} {...rest}>
      {children}
    </PolarisForm>
  );
};
