export interface Product {
  id: string; // Shopify GID (e.g., gid://shopify/Product/123)
  title: string;
  vendor: string;
  variants: {
    id: string; // Variant GID
    sku: string;
    price: string;
    inventoryQuantity: number;
    inventoryItem: { // Added inventoryItem
      id: string;    // InventoryItem GID
      locationId?: string; // Added locationId, make it optional for now
    };
  }[];
  salesVelocity: number;
  stockoutDays: number;
  status: 'Healthy' | 'Low' | 'Critical';
  trending: boolean;
}

export interface NotificationChannelSettings {
  enabled: boolean;
  [key: string]: any; // For additional channel-specific fields like address, webhook, etc.
}

export interface EmailChannelSettings extends NotificationChannelSettings {
  address: string;
}

export interface SlackChannelSettings extends NotificationChannelSettings {
  webhook: string;
}

export interface TelegramChannelSettings extends NotificationChannelSettings {
  botToken: string;
  chatId: string;
}

export interface MobilePushChannelSettings extends NotificationChannelSettings {
  service: string; // Placeholder for specific service details/tokens
}

export type NotificationFrequency = 'realtime' | 'hourly' | 'daily';

export interface NotificationSettingsType {
  email: EmailChannelSettings;
  slack: SlackChannelSettings;
  telegram: TelegramChannelSettings;
  mobilePush: MobilePushChannelSettings;
  salesThreshold: number;
  stockoutThreshold: number;
  notificationFrequency: NotificationFrequency;
  syncEnabled: boolean;
}

// Warehouse Types
export interface Warehouse {
  id: string;
  name: string;
  location: string;
  shopifyLocationGid?: string | null;
  shopId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Shop type - adding this as we need it in settings
export interface Shop extends Warehouse {
  emailForNotifications?: string | null;
  lowStockThreshold?: number | null;
  slackWebhookUrl?: string | null;
  telegramBotToken?: string | null;
  telegramChatId?: string | null;
  whatsAppApiCredentialsJson?: string | null;
}

// Inventory Types
export interface Inventory {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

// Product Types
// (Using the newly defined ShopifyProduct interface above)

// Notification Types
// (Existing notification interfaces remain unchanged)

// ShopifyProduct type for use across the app
export interface ShopifyProduct {
  id: string;
  title: string;
  vendor?: string;
  productType?: string;
  shopifyId?: string;
  variants: Array<{
    id: string;
    title?: string;
    sku?: string | null;
    price?: string | number;
    inventoryQuantity?: number | null;
    inventory_management?: string;
    inventoryItem?: { id: string };
  }>;
}

// Types for app._index.tsx loader data and component props

// For ProductAlerts component
export interface DashboardAlertProduct {
  id: string; // Internal App Product ID
  title: string;
  // [FIX] inventory was missing but is used in ProductAlerts. Add as optional number.
  inventory?: number; // Current inventory for alert display
  status?: string | null; // 'Low', 'Critical'
  salesVelocityFloat?: number | null; // For high sales trend alerts
  stockoutDays?: number | null;       // For high sales trend alerts
}

// For TrendingProducts component
export interface DashboardProductVariant {
  sku: string | null;
  price: string; // Assuming price is string after formatting
}

export interface DashboardTrendingProduct {
  id: string; // Internal App Product ID
  title: string;
  vendor: string;
  shopifyId: string; // Shopify Product GID
  salesVelocityFloat: number | null;
  status: string | null;
  trending: boolean | null;
  variants: Array<DashboardProductVariant> | null; // Expecting only one variant for display
}
