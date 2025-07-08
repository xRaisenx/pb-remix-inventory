### **Vercel + Neon Serverless – STRESS-TEST PROTOCOL (v2)**

> Goal: prove the app can survive a 1 000 RPS merchant spike without exhausting Neon’s 10-connection pool or breaching Vercel 30 s execution limits.

---

#### 0 · Prerequisites
- `DATABASE_URL` points to **production-sized** Neon branch (not a fork).  
- `VERCEL_PROJECT_ID` and `VERCEL_AUTH_TOKEN` environment variables are set for CI.  
- Local machine (or CI runner) has `k6`, `jq`, `vercel`, and `gh` CLIs installed.

---

#### 1 · Baseline Build & Deployment
```bash
# (CI) fresh build & deploy
npm ci --legacy-peer-deps
npm run vercel-build
vercel deploy --prebuilt --prod --confirm --token "$VERCEL_AUTH_TOKEN" > deploy.json
export APP_URL="$(jq -r '.url' deploy.json)"
```
Expected output:  
`maxDuration` ≤ 30 s, cold-start ≤ 1500 ms (printed in Vercel logs).

---

#### 2 · Warm-Connection Verification
```bash
curl "$APP_URL/api/warmup" --fail
```
Expect `{ ok: true }` and Neon dashboard shows ≤ 2 idle connections.

---

#### 3 · Write-Queue Saturation Test (k6)
`scripts/k6/stress.js`:
```js
import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = {
  vus: 200, // virtual merchants
  duration: '2m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
  },
};
export default function () {
  const body = {
    intent: 'UPDATE_INVENTORY',
    variantId: 'VARIANT_ID',
    newQuantity: Math.floor(Math.random()*100).toString(),
    warehouseId: 'WAREHOUSE_ID',
    shopifyLocationGid: 'gid://shopify/Location/123',
  };
  const res = http.post(`${__ENV.APP_URL}/app/products`, body);
  check(res, { 'status 2xx': (r) => r.status < 300 });
  sleep(1);
}
```
Run:
```bash
APP_URL="$APP_URL" k6 run --summary-export=k6.json scripts/k6/stress.js
```
Success criteria: 95-percentile latency ≤ 2 s, error-rate < 1 %.  
Neon “active connections” graph should peak ≤ 9.

---

#### 4 · Cold-Start Burst Test
```bash
npx autocannon -c 50 -d 30 "$APP_URL/"
```
Ensure P95 < 1200 ms.

---

#### 5 · Telemetry Review
Prisma middleware logs every query duration.  
Export:
```bash
vercel logs $APP_URL --since 30m --token "$VERCEL_AUTH_TOKEN" | tee vercel.log
awk '/Query .* took/ {print $NF}' vercel.log | datamash median 1 > median.txt
```
Pass if median < 150 ms and no query > 2000 ms.

---

#### 6 · Automated CI Integration
Add to `.github/workflows/stress.yml`:
```yml
- name: Deploy & Stress-test
  env:
    VERCEL_AUTH_TOKEN: ${{ secrets.VERCEL_TOKEN }}
    VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT }}
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
  run: |
    npm ci --legacy-peer-deps
    npm run vercel-build
    vercel deploy --prebuilt --prod --confirm --token "$VERCEL_AUTH_TOKEN" > deploy.json
    export APP_URL=$(jq -r '.url' deploy.json)
    APP_URL=$APP_URL k6 run --summary-export=k6.json scripts/k6/stress.js
    jq '.metrics.http_req_failed.rate' k6.json | grep -q '^0$'
```
Workflow fails if error-rate > 0.

---

#### 7 · Acceptance Checklist
- [ ] Build passes & deploy URL captured
- [ ] k6: error-rate < 1 %, P95 < 2 s
- [ ] Neon active connections ≤ 9
- [ ] Vercel cold-start P95 < 1500 ms
- [ ] No Prisma query > 2000 ms
- [ ] Protocol results appended to `COMPREHENSIVE_TEST_EXECUTION_RESULTS.md`

*When all boxes are checked the stress-test protocol is complete and the deployment is production-safe.*