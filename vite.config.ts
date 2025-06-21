import { defineConfig } from "vite";
import { unstable_vitePlugin as remix } from "@remix-run/dev";
import tsconfigPaths from "vite-tsconfig-paths";
import { shopifyApp } from "@shopify/shopify-app-remix/vite";

export default defineConfig({
  plugins: [
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    shopifyApp({
      // Your Shopify app configuration can be drawn from shopify.app.toml
    }),
    tsconfigPaths(),
  ],
  server: {
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    }
  }
});
