// app/components/common/Badge.tsx
import { Badge, type BadgeProps } from "@shopify/polaris";

// Define a set of custom statuses that map to Polaris tones
type CustomStatus = "positive" | "negative" | "warning" | "info" | "critical" | "attention" | "new" | "default";

interface CustomBadgeProps extends Omit<BadgeProps, "tone" | "children"> {
  customStatus?: CustomStatus;
  children: string; // Enforce string children to match Polaris Badge
}

const statusToneMap: Record<CustomStatus, BadgeProps['tone'] | undefined> = { // Ensure undefined is a possible tone value for 'default'
  positive: "success",
  negative: "critical",
  warning: "warning",
  info: "info",
  critical: "critical",
  attention: "attention",
  new: "new",
  default: undefined, // Default has no specific tone, so Polaris default will apply
};

export const CustomBadge = ({ customStatus = "default", children, ...rest }: CustomBadgeProps) => {
  const tone = statusToneMap[customStatus];
  return (
    <Badge tone={tone} {...rest}>
      {children}
    </Badge>
  );
};
