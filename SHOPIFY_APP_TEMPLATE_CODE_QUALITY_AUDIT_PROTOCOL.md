### **Shopify App Template & Code Quality Audit Protocol**

#### **1. Template & Frontend Optimization**
- **Unused Variables & Imports**
  - Run `eslint --no-unused-vars` and `tsc --noUnusedLocals` to detect dead code.
  - Check for orphaned React hooks (e.g., `useState` vars never read).
  - **Fix**:
    ```typescript
    // BEFORE: Unused imports/vars
    import { unusedHelper } from '~/utils';
    const [unusedState, setUnusedState] = useState(null);

    // AFTER: Cleaned
    import { usedHelper } from '~/utils';
    const [cartCount, setCartCount] = useState(0);
    ```

- **Remix Compatibility**
  - Verify all browser APIs (`window`, `document`) are guarded:
    ```typescript
    // BEFORE: Direct `window` access
    const userAgent = window.navigator.userAgent;

    // AFTER: Remix-safe
    const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent : 'server';
    ```

#### **2. TypeScript & Data Flow**
- **Strict Typing Gaps**
  - Identify `any` types in API responses.
  - **Fix**:
    ```typescript
    // BEFORE: Loose typing
    const product = await fetchProduct(); // Type: any

    // AFTER: Explicit interface
    interface Product {
      id: string;
      title: string;
    }
    const product: Product = await fetchProduct();
    ```

- **API Client Conflicts**
  - Check for duplicate `@shopify/shopify-api` instances in `node_modules`.
  - **Fix**:
    ```bash
    # Force-resolve to single version
    npm list @shopify/shopify-api
    npm dedupe
    ```

#### **3. Performance & Security**
- **Lazy Loading**
  - Audit `react.lazy()` for unoptimized chunks.
  - **Fix**:
    ```typescript
    // BEFORE: Eager-loaded component
    import HeavyComponent from '~/components/HeavyComponent';

    // AFTER: Lazy-loaded
    const HeavyComponent = lazy(() => import('~/components/HeavyComponent'));
    ```

- **XSS in Liquid Templates**
  - Sanitize dynamic `{{ content }}` with `| escape`.
  - **Fix**:
    ```liquid
    <!-- BEFORE: Unsafe -->
    <div>{{ user_input }}</div>

    <!-- AFTER: Escaped -->
    <div>{{ user_input | escape }}</div>
    ```

#### **4. Edge Cases**
- **Remix Loader Race Conditions**
  - Test parallel route transitions with `Promise.all()`.
  - **Fix**:
    ```typescript
    // BEFORE: Uncontrolled parallel fetches
    export const loader = async () => {
      const [products, orders] = await Promise.all([fetchProducts(), fetchOrders()]);
      return json({ products, orders });
    };

    // AFTER: Race-condition proof
    export const loader = async ({ request }) => {
      const products = await fetchProducts(request.signal); // Abortable
      const orders = await fetchOrders(request.signal);
      return json({ products, orders });
    };
    ```

#### **5. Output & Validation**
**Audit Report Format**:
```markdown
[ISSUE]: Unused CSS class `.old-theme`
[FILE]: `app/styles.css`
[FIX]: Remove or tree-shake
---
[ISSUE]: Missing `null` check in Remix loader
[FILE]: `app/routes/products.tsx`
[FIX]:
```typescript
const data = useLoaderData<typeof loader>();
if (!data) throw new Response('Not found', { status: 404 });
```
```

**Automated Checks**:
```bash
# Run these in CI:
eslint --ext .ts,.tsx --fix .
tsc --noEmit --strictNullChecks
npm run test:integration
```

**Exit Criteria**:
- Zero `any` types in `*.tsx` files.
- All Remix loaders handle `AbortSignal`.
- ESLint passes with `--max-warnings=0`.

*No UI changes—purely under-the-hood robustness.*