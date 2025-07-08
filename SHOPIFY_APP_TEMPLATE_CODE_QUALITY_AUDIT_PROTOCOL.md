### **Shopify Remix App – CODE-QUALITY AUDIT PROTOCOL (v2)**

> Goal: guarantee zero-warning ESLint, 100 % TypeScript strictness, no unused deps/files, and Polaris/Remix best-practices compliance before each merge to `main`.

---

#### 0 · Prerequisites
- Node 18+ LTS / pnpm 8 / npm 10.  
- Local ESLint plugins match project lockfile (`npm ci`).
- `GITHUB_TOKEN` has workflow-write to post status checks.

---

#### 1 · Lint + TypeScript Strict Pass
```bash
npm run lint --silent          # eslint . –cache –max-warnings=0
npx tsc --noEmit --strict      # zero TS errors
```
Fail the build on any warning.

---

#### 2 · Dead-Code & Dependency Sweep
```bash
npx depcheck --ignores="@types/*,eslint*,vitest" --json > depcheck.json
npx ts-prune --error --exportedIsUsed false > deadcode.txt || true
```
Success criteria: both reports are empty arrays.  
If not: delete code or move packages to `devDependencies`.

---

#### 3 · Polaris & Remix Patterns
| Audit | Tool/Command | Pass condition |
|-------|--------------|----------------|
| Polaris v12 import style | `grep -R "@shopify/polaris/build/esm" app | wc -l` | = number of components used |
| No direct `window`/`document` in loaders | `grep -R "window\." app/routes | wc -l` | **0** |
| Remix `json` helpers | ESLint rule `@remix-run/json/safe` | 0 violations |

---

#### 4 · Jest / Vitest Unit Coverage ≥ 80 %
```bash
npm run test:unit -- --coverage --run
jq '.total.lines.pct' coverage/coverage-summary.json | awk '$1<80{exit 1}'
```

---

#### 5 · Commit-time Husky Hook (local dev)
`.husky/pre-commit`:
```bash
npm run lint --silent
npx tsc --noEmit --pretty false
```

---

#### 6 · GitHub Action `quality.yml`
```yml
name: Code-Quality
on:
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npm ci --legacy-peer-deps
      - run: npm run lint --silent
      - run: npx tsc --noEmit --strict
      - run: npx depcheck --ignores="@types/*,eslint*,vitest" --json | jq '.dependencies|length==0 and .devDependencies|length==0'
```
Workflow fails on any non-true condition.

---

#### 7 · Acceptance Checklist
- [ ] ESLint 0 warnings, Prettier formatted.  
- [ ] `tsc --strict` 0 errors.  
- [ ] Depcheck & ts-prune show **no** unused code/packages.  
- [ ] Unit coverage ≥ 80 %.  
- [ ] Polaris, Remix best-practice audits all green.

*Only after every box is ticked can a PR be merged into `main`.*