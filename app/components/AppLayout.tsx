import { useAppBridge } from '@shopify/app-bridge-react';
import { Frame } from '@shopify/polaris';
import React from 'react';

interface Props {
  children: React.ReactNode;
}

const AppLayout: React.FC<Props> = ({ children }) => {

  return (
      <Frame>
        {children}
      </Frame>
  );
};

export default AppLayout;
