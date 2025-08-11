# Planet Beauty Inventory AI - Codebase Overview

## Architecture
- Framework: Remix (Vite) + React 18
- UI: Shopify Polaris (embedded and standalone compatible)
- Shopify: @shopify/shopify-app-remix (App Bridge, auth, webhooks)
- DB: PostgreSQL (Neon) via Prisma Client
- Hosting: Vercel (serverless)

## Key Directories
- `app/`
  - `root.tsx`: Polaris provider, CSP, document shell
  - `routes/`: Remix routes
    - `_index/route.tsx`: Landing/install page
    - `auth.*`: Auth and login flows
    - `app.tsx`: Embedded shell + provider switching
    - `app.*`: Dashboard subpages (settings, products, inventory, reports, alerts, warehouses)
    - `api.*` and `webhooks.*`: API endpoints + Shopify webhooks
  - `components/`: App layout, themed layout, feature components
  - `services/`: Domain services (AI, inventory, product metrics, sync)
  - `db.server.ts`: Prisma client configuration (Neon optimized)
- `prisma/`
  - `schema.prisma`: DB schema
  - `migrations/`: SQL migrations (if any)
- `scripts/`: Dev/test/util scripts (db, verification, performance, security)

## Providers and Modes (Embedded vs Standalone)
- Controlled by `process.env.EMBEDDED_APP` (string: "true" or "false").
- Embedded mode uses Shopify App Bridge `AppProvider` + Polaris; non-embedded uses Polaris only.
- Runtime override: `/app?embedded=1|0` sets a cookie (`embedded_override`) to switch visually without redeploy.
- CSP adapts in `app/root.tsx`:
  - Embedded: `frame-ancestors https://<shop> https://admin.shopify.com`
  - Standalone: `frame-ancestors 'none'`

## Theming
- Global styles in `app/styles/app.css`:
  - `pb-gradient-page`, `pb-embedded-bg`, `pb-glass`, `pb-gradient-text`, `pb-card-hover` for hi‑tech look
- `components/PlanetBeautyLayout.tsx`: gradient/glass layout wrapper
- Applied across landing and dashboard pages

## Shopify Integration
- `app/shopify.server.ts`:
  - App registration, webhook definitions, Prisma session storage
  - `afterAuth` registers webhooks and upserts shop row
  - `authenticate`, `login` helpers for routes
- Webhooks: products create/update/delete, inventory updates, orders create/paid, app uninstall/scopes update

## Database & Prisma
- `DATABASE_URL`, `DIRECT_DATABASE_URL` required
- Neon pooling parameters added dynamically in `db.server.ts`
- Generate client: `npm run prisma -- generate`
- Migrate: `npm run db:setup` (generate + migrate deploy)

## Routes of Interest
- Installation/Landing: `/_index/route.tsx` (Polaris form posts to `/auth/login`)
- Auth:
  - `/auth/login` (Shopify login)
  - `/auth/*` (splat) for embedded auth strategy
- Dashboard Shell: `/app` (provider switch + `AppLayout`)
- Dashboard Index: `/app._index.tsx` (initial sync + metrics)
- Inventory: `/app.inventory.tsx` (update quantities via modal and service)
- Products: `/app.products.tsx` (server data for product table)
- Settings: `/app.settings.tsx` (notification settings)

## Services
- `services/inventory.service.ts`: Update inventory in Shopify + DB, restock suggestions, bulk update, analysis
- `services/ai.server.ts`: AI intent parsing and responses for stock/low-stock/search/trending/help
- `services/product.service.ts`: Product metric calculations
- `services/shopify.sync.server.ts`: Shopify sync utilities

## Build & Run
- Install: `npm ci`
- Prisma: `npm run prisma -- generate` / `npm run db:setup`
- Dev: `npm run dev` (Shopify CLI) or `vite` (non-embedded local only)
- Build: `./node_modules/.bin/remix vite:build`
- Start: `npm run start` (Remix-serve)

## Deployment (Vercel)
- Set Environment Variables:
  - `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SCOPES`
  - `EMBEDDED_APP` ("true" or "false")
  - `DATABASE_URL`, `DIRECT_DATABASE_URL`
- Build command: `npm run vercel-build` (prepares DB and builds)
- Ensure Prisma client is generated at build time

## Testing & Quality
- Lint: `npm run lint` (0 errors/warnings required)
- Types: `npm run type-check` (clean)
- Build: ensure success before deploy
- Scripts: `scripts/verify-phase1-fixes.js` and others for validation

## Security & Reliability
- CSP dynamically enforced via `root.tsx`
- Prisma Neon connection retries, slow-query logging, graceful shutdown
- Webhook handlers log and fail-safe (200 on non-critical failures)

## Operational Notes
- Toggle embedded via query param for dev previews
- First-time install triggers `afterAuth` setup + webhook registration
- Initial sync prompt on `/app._index` when `initialSyncCompleted` is false

## Extensibility
- Add new routes in `app/routes`
- Extend services in `app/services` with clear interfaces and error handling
- Reuse `PlanetBeautyLayout` and design tokens in `app/styles/app.css`