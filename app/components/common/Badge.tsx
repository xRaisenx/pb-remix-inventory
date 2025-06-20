import { Badge as PolarisBadge, BadgeProps } from '@shopify/polaris';
import React from 'react';

type CustomStatus = 'healthy' | 'low' | 'critical' | 'default';

interface CustomBadgeProps extends Omit<BadgeProps, 'tone'> {
  children: React.ReactNode;
  customStatus?: CustomStatus;
  tone?: BadgeProps['tone']; // Allow direct Polaris tone override
}

const statusToToneMap: Record<CustomStatus, BadgeProps['tone'] | undefined> = {
  healthy: 'success',
  low: 'warning',
  critical: 'critical',
  default: undefined,
};

export const Badge: React.FC<CustomBadgeProps> = ({ children, customStatus, tone, ...rest }) => {
  const appliedTone = tone || (customStatus ? statusToToneMap[customStatus] : undefined);
  return <PolarisBadge tone={appliedTone} {...rest}>{children}</PolarisBadge>;
};
