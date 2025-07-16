# ai_builder.md

# 🌟 Planet Beauty Inventory AI — End-to-End Technical Build Guide

---

## 1. Project Overview

This project is a full-stack, AI-powered Shopify inventory management app. It provides advanced analytics, real-time alerts, and predictive inventory intelligence for beauty retailers.

- **Frontend:** React + Remix.js (TypeScript)
- **Backend:** Node.js (Remix, Express-style API routes), Prisma ORM
- **Database:** PostgreSQL (managed via Prisma)
- **AI:** Gemini 2.0 Flash (default, can be configured for OpenAI/Gemini)
- **Shopify Integration:** OAuth, webhooks, GraphQL API
- **Hosting:** Vercel (recommended), supports local dev

---

## 2. Project Structure and Key Files

### Root Directory

- `package.json` — NPM dependencies, scripts, and project metadata.
- `README.md` — Project overview and basic instructions.
- `.env` — Environment variables (not committed; see below for details).
- `shopify.app.toml` — Shopify app configuration (OAuth, webhooks, scopes).
- `prisma/` — Database schema and migrations.
- `scripts/` — Utility scripts for seeding, testing, and setup.
- `app/` — Main application code (frontend and backend).

---

### /app Directory

#### Frontend (React + Remix)

- `app/root.tsx`  
  - **Purpose:** The root React component. Sets up global providers (e.g., Polaris), error boundaries, and document structure.
  - **Key Functions:**  
    - `App()`: Main app wrapper.
    - `HtmlDocument()`: Renders the HTML shell.
    - `meta`: Sets meta tags and Content Security Policy.

- `app/routes/`  
  - **Purpose:** All Remix routes (pages and API endpoints).
  - **Key Files:**
    - `app/routes/app.tsx` — Main app dashboard route.
    - `app/routes/app._index.tsx` — Index/landing page for the app.
    - `app/routes/api/` — API endpoints for AJAX/data requests.
    - `app/routes/auth.tsx` — Handles Shopify OAuth flow.
    - `app/routes/webhooks/` — Handles incoming Shopify webhooks.

- `app/components/`  
  - **Purpose:** Reusable React UI components (tables, forms, charts, etc.).

- `app/services/`  
  - **Purpose:** Business logic and integrations.
  - **Key Files:**
    - `ai.server.ts` — AI integration (Gemini/OpenAI).
    - `sms.service.ts` — SMS sending logic (Twilio).
    - `webhook.service.ts` — Outbound webhook logic.
    - `notification.service.ts` — Notification orchestration.

- `app/shopify.server.ts`  
  - **Purpose:** Shopify app configuration, session storage, and helpers.
  - **Key Functions:**  
    - `shopifyApp()`: Initializes Shopify app with API keys, session storage, and webhooks.
    - `EnhancedPrismaSessionStorage`: Custom session storage using Prisma.

- `app/db.server.ts`  
  - **Purpose:** Prisma client instance and DB helpers.

---

### /prisma Directory

- `prisma/schema.prisma`  
  - **Purpose:** Defines the entire database schema using Prisma's modeling language.
  - **Key Models:**  
    - `Shop`, `Product`, `Variant`, `Inventory`, `NotificationSetting`, `ProductAlert`, `Session`, `AnalyticsData`, `DemandForecast`, `Warehouse`, `NotificationLog`.
  - **How to Use:**  
    - Edit this file to change the DB schema.
    - Run `npx prisma migrate dev` to apply changes.

- `prisma/migrations/`  
  - **Purpose:** Auto-generated migration files for DB schema changes.

---

### /scripts Directory

- `db-init.js`  
  - **Purpose:** Validates environment, checks DB connection, runs migrations, and verifies schema.
  - **Key Functions:**  
    - `validateEnvironment()`, `checkDatabaseConnection()`, `runMigrations()`, `fixDatabaseSchema()`, `verifyShopifyIntegration()`, `performHealthCheck()`, `main()`.

- `simulate-shop-interactions.js`  
  - **Purpose:** Seeds the database with a test shop, products, variants, session, and notification settings.
  - **Key Functions:**  
    - `simulateShopSetup()`: Creates a shop and session.
    - `simulateProductOperations()`: Creates products and variants.
    - `simulateInventoryUpdates()`: Simulates inventory changes and alerts.
    - `generateLowStockAlert()`, `generateOutOfStockAlert()`: Creates product alerts.

- `comprehensive-app-test.js`, `comprehensive-functional-test.js`  
  - **Purpose:** Automated test suites for business logic, data integrity, and API endpoints.

---

### shopify.app.toml

- **Purpose:** Shopify CLI config for app name, client ID, OAuth, webhooks, and scopes.
- **Key Sections:**
  - `[webhooks]` — Defines webhook topics and endpoints.
  - `[access_scopes]` — Lists required Shopify API scopes.
  - `[auth]` — Redirect URLs for OAuth.

---

## 3. How Each Major Function Works

### Frontend

- **Remix Loaders/Actions:**  
  - Each route file (e.g., `app/routes/app.tsx`) exports a `loader` (for GET/data) and/or `action` (for POST/mutations).
  - Loaders fetch data from the DB or Shopify API and pass it to React components.
  - Actions handle form submissions, mutations, and side effects.

- **Polaris UI:**  
  - All UI is built with Shopify Polaris components for a native Shopify look and feel.

### Backend

- **Shopify OAuth:**  
  - Handled in `app/routes/auth.tsx` and `app/shopify.server.ts`.
  - Uses `@shopify/shopify-app-remix` for secure authentication and session management.

- **Webhooks:**  
  - Handled in `app/routes/webhooks/`.
  - Each webhook topic (e.g., `products/create`) has a corresponding handler that updates the DB and triggers notifications.

- **AI Service:**  
  - `app/services/ai.server.ts` integrates with Gemini or OpenAI.
  - Functions: `analyzeInventory()`, `generateRestockRecommendation()`, etc.

- **Notification System:**  
  - `app/services/notification.service.ts` orchestrates sending alerts via email, SMS, Slack, Telegram, and webhooks.
  - Uses settings from the `NotificationSetting` model.

- **Database Access:**  
  - All DB queries use Prisma (`app/db.server.ts`).
  - Example: `prisma.product.findMany({ where: { shopId } })`

---

## 4. Database Schema (Prisma)

**See `prisma/schema.prisma` for full details.**  
**Key Models:**

- **Shop:**  
  - Fields: `id`, `shop` (domain), notification settings, etc.
  - Relations: Products, Sessions, NotificationSettings, Warehouses.

- **Product:**  
  - Fields: `id`, `shopifyId`, `title`, `vendor`, `status`, `quantity`, etc.
  - Relations: Shop, Variants, Inventory, ProductAlerts.

- **Variant:**  
  - Fields: `id`, `shopifyId`, `title`, `sku`, `price`, `inventoryQuantity`, etc.
  - Relations: Product.

- **Inventory:**  
  - Fields: `id`, `quantity`, `warehouseId`, `productId`, etc.
  - Relations: Product, Warehouse.

- **NotificationSetting:**  
  - Fields: `id`, `shopId`, `email`, `slack`, `telegram`, `mobilePush`, etc.
  - Relations: Shop.

- **ProductAlert:**  
  - Fields: `id`, `productId`, `type`, `message`, `isActive`, etc.
  - Relations: Product.

- **Session:**  
  - Fields: `id`, `shopId`, `state`, `isOnline`, `scope`, `accessToken`, etc.
  - Relations: Shop.

---

## 5. Environment Variables (.env)

**Example:**

```env
# Database
DATABASE_URL="postgresql://user:password@host:port/dbname"
DIRECT_DATABASE_URL="postgresql://user:password@host:port/dbname"

# Shopify App
SHOPIFY_API_KEY="your-shopify-app-api-key"
SHOPIFY_API_SECRET="your-shopify-app-api-secret"
SHOPIFY_APP_URL="https://your-app-url.com"

# AI (Gemini/OpenAI)
GEMINI_API_KEY="your-gemini-api-key" # or OPENAI_API_KEY

# Notification Services (optional)
SENDGRID_API_KEY="your-sendgrid-api-key"
TWILIO_ACCOUNT_SID="your-twilio-sid"
TWILIO_AUTH_TOKEN="your-twilio-auth-token"
```

---

## 6. How to Build This Project from Scratch

### A. Install Dependencies

```bash
npm install
```

### B. Set Up Environment Variables

Create a `.env` file as shown above.

### C. Initialize the Database

1. Generate Prisma client and run migrations:
   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```
2. (Optional) Seed the database with test data:
   ```bash
   npm run simulate:shop
   ```

### D. Start the App

- For development:
  ```bash
  npm run dev
  ```
- For production:
  ```bash
  npm run build
  npm start
  ```

### E. Run Tests

- Functional tests:
  ```bash
  npm run test:functional
  ```
- Comprehensive tests:
  ```bash
  npm run test:comprehensive
  ```
- All tests:
  ```bash
  npm run test:all
  ```

---

## 7. Extending and Customizing

- **Add new models:** Edit `prisma/schema.prisma`, then run `npx prisma migrate dev`.
- **Add new API routes:** Create new files in `app/routes/`.
- **Customize AI:** Swap out Gemini API key or add OpenAI support in the AI service.
- **Change notification channels:** Update `NotificationSetting` and related services.

---

## 8. Troubleshooting

- **Prisma errors:** Check your database connection and run `npm run db:setup`.
- **Shopify OAuth issues:** Ensure your app URL and redirect URLs are correct in both `.env` and Shopify Partner dashboard.
- **Vercel deployment:** Set all environment variables in the Vercel dashboard.

---

**For more details, see the README.md and prisma/schema.prisma in your repo.**