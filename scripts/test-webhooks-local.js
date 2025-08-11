#!/usr/bin/env node
import http from 'http';

const tests = [
  { path: '/webhooks/products/create', body: { id: '123', title: 'Test Product', variants: [{ id: '456', price: '10.00' }] } },
  { path: '/webhooks/products/update', body: { id: '123', title: 'Test Product Updated', variants: [{ id: '456', price: '12.00' }] } },
  { path: '/webhooks/products/delete', body: { id: '123', title: 'Test Product' } },
  { path: '/webhooks/inventory/update', body: { inventory_item_id: '789', location_id: '1', available: 42, updated_at: new Date().toISOString() } },
  { path: '/webhooks/orders/create', body: { id: '999', name: '#1001', line_items: [{ id: 'li1', product_id: '123', variant_id: '456', title: 'Test', quantity: 2, price: '12.00' }] } },
  { path: '/webhooks/orders/paid', body: { id: '999', name: '#1001', line_items: [{ id: 'li1', product_id: '123', title: 'Test', quantity: 2, price: '12.00' }] } },
];

function post(path, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = http.request({ hostname: 'localhost', port: 3000, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let chunks = '';
      res.on('data', (c) => chunks += c);
      res.on('end', () => resolve({ status: res.statusCode, body: chunks }));
    });
    req.on('error', (err) => resolve({ error: err.message }));
    req.write(data);
    req.end();
  });
}

(async () => {
  const results = [];
  for (const t of tests) {
    const result = await post(t.path, t.body);
    console.log(`POST ${t.path} ->`, result.status, result.error || 'OK');
    results.push({ path: t.path, result });
  }
  console.log('Webhook self-test complete');
  process.exit(0);
})();