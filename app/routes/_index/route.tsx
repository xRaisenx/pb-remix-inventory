import { json, type LoaderFunctionArgs } from "@remix-run/node";

import { login } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  // If a 'shop' parameter is present (from Shopify), initiate auth
  if (url.searchParams.get("shop")) {
    return await login(request);
  }
  return json({ ok: true });
};

export default function IndexPage() {
  // Minimal landing page with only the install form
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #3b0764 50%, #0f172a 100%)',
      color: '#fff',
      padding: '24px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 520,
        background: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 16,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        padding: '28px 24px'
      }}>
        <h1 style={{
          margin: 0,
          marginBottom: 8,
          fontSize: 28,
          lineHeight: 1.2,
          background: 'linear-gradient(90deg, #6366F1 0%, #8B5CF6 50%, #EC4899 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>Planet Beauty Inventory AI</h1>
        <p style={{ marginTop: 0, opacity: 0.9, marginBottom: 18 }}>
          Log in or install by entering your Shopify shop domain.
        </p>

        {/* Exact element structure requested */}
        <form method="post" action="/login" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 15 }} data-discover="true">
          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', maxWidth: 300 }}>
            <span style={{ marginBottom: 5, fontWeight: 'bold' }}>Shop domain</span>
            <input
              type="text"
              name="shop"
              placeholder="your-store-name.myshopify.com"
              aria-label="Shop domain"
              style={{ width: '100%', padding: 10, border: '1px solid #ccc', borderRadius: 4 }}
              required
            />
          </label>
          <button type="submit" style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Log In / Install
          </button>
        </form>
      </div>
    </div>
  );
}
