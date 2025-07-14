// app/components/common/Badge.tsx
import { Badge, type BadgeProps } from "@shopify/polaris";

// Define and export a set of custom statuses that map to Polaris tones
export type CustomStatus = "positive" | "negative" | "warning" | "info" | "critical" | "attention" | "new" | "default";

interface CustomBadgeProps {
  customStatus?: CustomStatus;
  children: string; // Enforce string children to match Polaris Badge
  // Removed accessibilityLabel and other Polaris BadgeProps from here
  // as they are not directly used or modified by this wrapper.
  // If they were needed, they should be explicitly defined.
}

const statusToneMap: Record<CustomStatus, BadgeProps['tone']> = {
  positive: "success",
  negative: "critical",
  warning: "warning",
  info: "info",
  critical: "critical",
  attention: "attention",
  new: "new",
  default: undefined, // Polaris Badge tone is optional, undefined means default
};

export const CustomBadge = ({ customStatus = "default", children }: CustomBadgeProps) => {
  const tone = statusToneMap[customStatus];
  // Pass only the mapped tone and children.
  // If other BadgeProps like 'progress' or 'size' were needed,
  // they would need to be added to CustomBadgeProps and passed explicitly.
  return (
    <Badge tone={tone}>
      {children}
    </Badge>
  );
};
