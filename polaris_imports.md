```typescript
// ./app/components/TrendingProducts.tsx
import { Grid, BlockStack } from '@shopify/polaris';
// ./app/components/common/Form.tsx
import { Form as PolarisForm, FormProps } from '@shopify/polaris';
// ./app/components/common/Badge.tsx
import { Badge, type BadgeProps } from "@shopify/polaris";
// ./app/components/common/Card.tsx
import { Card, type CardProps } from "@shopify/polaris";
// ./app/components/common/Text.tsx
import { Text as PolarisText, TextProps } from '@shopify/polaris';
// ./app/components/common/ResourceListTable.tsx
import { IndexTable, IndexTableProps, Card as PolarisCard } from '@shopify/polaris';
// ./app/components/common/Button.tsx
import { Button as PolarisButton, ButtonProps } from '@shopify/polaris';
// ./app/components/common/Modal.tsx
import { Modal as PolarisModal, ModalProps } from '@shopify/polaris';
// ./app/components/ProductAlerts.tsx
import { Banner, BlockStack, Button, Text } from '@shopify/polaris';
// ./app/components/DashboardVisualizations.tsx
import { Card, Grid, Text, BlockStack } from "@shopify/polaris";
// ./app/components/AIAssistant.tsx
import { BlockStack, TextField, Text, Spinner, LegacyCard, ButtonGroup, Link as PolarisLink } from '@shopify/polaris';
// ./app/components/AppLayout.tsx
import { Frame, TopBar, Navigation } from '@shopify/polaris';
// ./app/components/Settings.tsx
import {
  AppProvider,
  Card,
  TextField,
  Button,
  Select,
  InlineStack,
  BlockStack,
  Checkbox,
  Frame,
  Toast,
  Text,
} from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
// ./app/components/Metrics.tsx
import { Icon, Grid, Box, Text, BlockStack } from '@shopify/polaris';
// ./app/components/ProductModal.tsx
import { Modal, TextField, FormLayout, Select, Banner, Text, BlockStack } from "@shopify/polaris";
// ./app/components/QuickActions.tsx
import { Card, ButtonGroup, Button, BlockStack, Text } from "@shopify/polaris";
// ./app/components/Alerts.tsx
import { Banner, Text, Link, BlockStack, Button } from "@shopify/polaris";
// ./app/root.tsx
import { AppProvider as PolarisAppProvider } from "@shopify/polaris"; // Renamed to avoid conflict
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url"; // Ensure ?url suffix
import enTranslations from "@shopify/polaris/locales/en.json";
// ./app/routes/notifications.tsx
import { Page, Card, Text, ResourceList, ResourceItem, Avatar, BlockStack } from "@shopify/polaris";
// ./app/routes/app._index.tsx
import { Page, BlockStack, Grid, Card, Banner, Button, Text, Spinner } from "@shopify/polaris";
// ./app/routes/app.additional.tsx
import {
  Box,
  Card,
  Layout,
  Link,
  List,
  Page,
  Text,
  BlockStack,
} from "@shopify/polaris";
// ./app/routes/app.reports.tsx
import { Page, Card, Text, Button, BlockStack } from "@shopify/polaris"; // Replaced AlphaCard with Card
// ./app/routes/app.settings.tsx
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Checkbox,
  Button,
  Select,
  BlockStack,
  Text,
  Banner,
  Divider,
} from "@shopify/polaris";
// ./app/routes/app.inventory.tsx
import { Page, Card, DataTable, Text, BlockStack, Spinner, Button, Banner } from "@shopify/polaris";
// ./app/routes/app.warehouses.tsx
import { Page, Card, DataTable, Text, Button, EmptyState, InlineStack } from "@shopify/polaris"; // Added InlineStack
// ./app/routes/app.warehouses.$warehouseId.edit.tsx
import { Page, Card, TextField, Button, Banner, BlockStack, Text, Select } from "@shopify/polaris"; // Added Select
// ./app/routes/app.warehouses.new.tsx
import { Page, Card, TextField, Button, BlockStack, Banner, Select } from "@shopify/polaris";
// ./app/routes/app.alerts.tsx
import { Page, Card, Text, EmptyState, BlockStack, Link as PolarisLink, Banner, DataTable } from "@shopify/polaris";
// ./app/routes/app.tsx
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
// ./app/routes/app.products.tsx
import { Page, BlockStack, Card, Text, TextField, Icon, Banner, IndexTable, type IndexTableProps, Pagination } from "@shopify/polaris";
// ./app/routes/auth.login/route.tsx
import { AppProvider, Page, Card, Text, BlockStack, FormLayout, TextField, Button } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url"; // Ensure ?url suffix
// ./app/routes/_index/route.tsx
import { Text } from "@shopify/polaris";
```
