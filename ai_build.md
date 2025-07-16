# ai_build.md

# 🌟 Planet Beauty Inventory AI — End-to-End Project Guide

## 1. Project Overview

This project is a full-stack, AI-powered Shopify inventory management app. It provides advanced analytics, real-time alerts, and predictive inventory intelligence for beauty retailers.

- **Frontend:** React + Remix.js (TypeScript)
- **Backend:** Node.js (Remix, Express-style API routes), Prisma ORM
- **Database:** PostgreSQL (managed via Prisma)
- **AI:** Gemini 2.0 Flash (default, can be configured for OpenAI/Gemini)
- **Shopify Integration:** OAuth, webhooks, GraphQL API
- **Hosting:** Vercel (recommended), supports local dev

---

## 2. Architecture Overview

### Frontend
- Built with React and Remix.js.
- Uses Shopify Polaris for UI components.
- Handles all user interactions, dashboards, and settings.
- Communicates with backend via Remix loaders/actions and API routes.

### Backend
- Node.js server (Remix app server).
- Handles Shopify OAuth, webhooks, and all business logic.
- Uses Prisma ORM for all database access.
- Integrates with external services (AI, SMS, email, webhooks).

### Database
- PostgreSQL, managed via Prisma.
- Schema includes: Shop, Product, Variant, Inventory, NotificationSetting, ProductAlert, Session, AnalyticsData, DemandForecast, Warehouse, NotificationLog, etc.
- See `prisma/schema.prisma` for full schema.

### Dependencies
- See `package.json` for all dependencies.
- Key packages:
  - `@remix-run/*`, `react`, `@shopify/polaris`, `@shopify/shopify-app-remix`, `@prisma/client`, `prisma`, `@google/generative-ai`, `@shopify/shopify-app-session-storage-prisma`, etc.

---

## 3. How to Recreate This Project

### A. Prerequisites
- Node.js 18+ (or 20+)
- PostgreSQL database (local or managed, e.g., Neon, Supabase, AWS RDS)
- Shopify Partner account and a development store
- Vercel account (for deployment, optional)

### B. Clone and Install
```bash
git clone <repository-url>
cd planet-beauty-inventory-ai
npm install
```

### C. Environment Variables

Create a `.env` file in the root directory. Example:

```env
# Database
DATABASE_URL="postgresql://user:password@host:port/dbname"
DIRECT_DATABASE_URL="postgresql://user:password@host:port/dbname"

# Shopify App
SHOPIFY_API_KEY="your-shopify-app-api-key"
SHOPIFY_API_SECRET="your-shopify-app-api-secret"
SHOPIFY_APP_URL="https://your-app-url.com" # e.g., Vercel deployment URL

# AI (Gemini/OpenAI)
GEMINI_API_KEY="your-gemini-api-key" # or OPENAI_API_KEY

# Notification Services (optional, for production)
SENDGRID_API_KEY="your-sendgrid-api-key"
TWILIO_ACCOUNT_SID="your-twilio-sid"
TWILIO_AUTH_TOKEN="your-twilio-auth-token"
```

**Note:** You can find your Shopify API keys in your Partner dashboard. For local dev, use a local Postgres instance or a free Neon/Supabase DB.

### D. Database Setup

1. **Generate Prisma client and run migrations:**
   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```

2. **(Optional) Seed the database with test data:**
   ```bash
   npm run simulate:shop
   ```

### E. Running the App

- **Development:**
  ```bash
  npm run dev
  ```
  This starts the Remix dev server and the Shopify app in development mode.

- **Production Build:**
  ```bash
  npm run build
  npm start
  ```

- **Vercel Deployment:**
  - Push to GitHub and connect the repo to Vercel.
  - Set all environment variables in the Vercel dashboard.
  - Vercel will run `npm run vercel-build` automatically.

---

## 4. Shopify App Configuration

- The app is configured as **non-embedded** (`embedded = false` in `shopify.app.toml`).
- All OAuth, webhooks, and API scopes are set in `shopify.app.toml`.
- Webhook endpoints are defined for product, inventory, and order events.

---

## 5. Database Schema (Prisma)

See `prisma/schema.prisma` for the full schema. Key models:

- **Shop:** Stores info about each connected Shopify store.
- **Product:** All products, linked to Shop.
- **Variant:** Product variants (SKU, price, inventory, etc.).
- **Inventory:** Inventory records per product/warehouse.
- **NotificationSetting:** Per-shop notification preferences.
- **ProductAlert:** Alerts for low/out-of-stock, etc.
- **Session:** Shopify app sessions for OAuth.
- **AnalyticsData, DemandForecast, Warehouse, NotificationLog:** Advanced analytics and integrations.

---

## 6. Key NPM Scripts

- `npm run dev` — Start local dev server
- `npm run build` — Build for production
- `npm start` — Start production server
- `npm run db:init` — Initialize and validate DB
- `npm run db:setup` — Generate Prisma client and run migrations
- `npm run simulate:shop` — Seed the database with a test shop, products, variants, and session
- `npm run test:all` — Run all tests (functional + comprehensive)

---

## 7. Testing

- **Functional tests:** `npm run test:functional`
- **Comprehensive tests:** `npm run test:comprehensive`
- **All tests:** `npm run test:all`

---

## 8. Example .env File

```env
DATABASE_URL="postgresql://user:password@localhost:5432/planet_beauty"
DIRECT_DATABASE_URL="postgresql://user:password@localhost:5432/planet_beauty"

SHOPIFY_API_KEY="your-shopify-api-key"
SHOPIFY_API_SECRET="your-shopify-api-secret"
SHOPIFY_APP_URL="https://your-app-url.com"

GEMINI_API_KEY="your-gemini-api-key"
SENDGRID_API_KEY="your-sendgrid-api-key"
TWILIO_ACCOUNT_SID="your-twilio-account-sid"
TWILIO_AUTH_TOKEN="your-twilio-auth-token"
```

---

## 9. Dependencies

See `package.json` for full list. Key dependencies:
- `@remix-run/*`, `react`, `@shopify/polaris`, `@shopify/shopify-app-remix`, `@prisma/client`, `prisma`, `@google/generative-ai`, `@shopify/shopify-app-session-storage-prisma`, etc.

---

## 10. How to Extend or Customize

- **Add new models:** Edit `prisma/schema.prisma`, then run `npx prisma migrate dev`.
- **Add new API routes:** Create new files in `app/routes/`.
- **Customize AI:** Swap out Gemini API key or add OpenAI support in the AI service.
- **Change notification channels:** Update `NotificationSetting` and related services.

---

## 11. Troubleshooting

- **Prisma errors:** Check your database connection and run `npm run db:setup`.
- **Shopify OAuth issues:** Ensure your app URL and redirect URLs are correct in both `.env` and Shopify Partner dashboard.
- **Vercel deployment:** Set all environment variables in the Vercel dashboard.

---

## 12. Example: Local Development Workflow

```bash
# 1. Clone and install
git clone <repo>
cd planet-beauty-inventory-ai
npm install

# 2. Setup .env
cp .env.example .env
# Edit .env with your values

# 3. Setup DB
npm run db:setup

# 4. Seed test data
npm run simulate:shop

# 5. Start dev server
npm run dev

# 6. Run tests
npm run test:all
```

---

**For more details, see the README.md and prisma/schema.prisma in your repo.**

If you need a ready-to-copy `.env.example` or more details on any section, let me know!