import { Badge as PolarisBadge, BadgeProps } from '@shopify/polaris';
import React from 'react';

/**
 * Represents the possible custom status values for a badge.
 * These statuses are typically related to inventory levels or other business logic.
 */
type CustomStatus = "Healthy" | "Low" | "Critical" | "Unknown";

/**
 * Props for the custom Badge component.
 * Extends Shopify Polaris BadgeProps but omits 'tone' to replace with 'customStatus'.
 */
interface CustomBadgeProps extends Omit<BadgeProps, 'tone'> {
  /** The content to display inside the badge. */
  children: React.ReactNode;
  /**
   * The custom status to determine the badge's appearance.
   * This will be mapped to a specific Polaris 'tone'.
   */
  customStatus?: CustomStatus;
  /**
   * Allows direct override of the Polaris 'tone' prop, bypassing 'customStatus' mapping.
   * Useful if a specific Polaris tone is needed that doesn't match a predefined custom status.
   */
  tone?: BadgeProps['tone'];
}

// Updated statusToToneMap keys and added 'Unknown'
const statusToToneMap: Record<CustomStatus, BadgeProps['tone'] | undefined> = {
  Healthy: 'success',  // Green
  Low: 'warning',    // Yellow/Orange
  Critical: 'critical',// Red
  Unknown: undefined,  // Default Polaris badge color (typically neutral/grey)
  // Could also use 'info' or 'attention' if a specific grey is desired and available,
  // or 'subdued' for a less prominent grey.
};

/**
 * A custom Badge component that wraps the Shopify Polaris Badge.
 * It allows setting the badge's tone based on a predefined set of custom statuses
 * (e.g., "Healthy", "Low", "Critical", "Unknown") or by directly providing a Polaris 'tone'.
 */
export const Badge: React.FC<CustomBadgeProps> = ({ children, customStatus, tone, ...rest }) => {
  // Determine the final Polaris tone:
  // 1. If a 'tone' prop is explicitly provided, use it directly.
  // 2. Else, if 'customStatus' is provided, map it to a Polaris tone using statusToToneMap.
  // 3. Otherwise, the tone will be undefined (Polaris default).
  const appliedTone = tone || (customStatus ? statusToToneMap[customStatus] : undefined);
  return <PolarisBadge tone={appliedTone} {...rest}>{children}</PolarisBadge>;
};
