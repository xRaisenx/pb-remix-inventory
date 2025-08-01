import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import { vercelPreset } from "@vercel/remix/vite";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

installGlobals({ nativeFetch: true });

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the remix server. The CLI will eventually
// stop passing in HOST, so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT!) || 8002,
    clientPort: 443,
  };
}

export default defineConfig({
  server: {
    allowedHosts: [host],
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_lazyRouteDiscovery: true,
        v3_singleFetch: false,
        v3_routeConfig: true,
      },
      presets: [vercelPreset()],
    }),
    tsconfigPaths(),
  ],
  build: {
    // Serverless optimization settings
    assetsInlineLimit: 0, // Don't inline assets for better caching
    target: 'es2020', // Modern target for better optimization
    minify: 'esbuild', // Fast and efficient minification
    rollupOptions: {
      output: {
        // Optimize chunk splitting for serverless
        manualChunks: (id) => {
          // Only apply manual chunking for client build
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor';
            }
            if (id.includes('@shopify/polaris') || id.includes('@shopify/app-bridge-react')) {
              return 'shopify';
            }
          }
        },
        // Improve caching with consistent chunk names
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      },
      // Tree-shaking optimization
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        unknownGlobalSideEffects: false
      }
    },
    // Optimize source maps for production
    sourcemap: process.env.NODE_ENV === 'development',
    // Improve build performance
    chunkSizeWarningLimit: 1000
  },
  // Remove resolve.alias for Polaris (let Vite handle ESM)
  // Remove noExternal for Polaris (let Vite handle ESM)
  optimizeDeps: {
    include: [
      "@shopify/app-bridge-react", 
      "@shopify/polaris",
      "react",
      "react-dom"
    ],
    // Exclude from optimization for better serverless performance
    exclude: ["@prisma/client"]
  },
  // SSR optimization for serverless
  ssr: {
    noExternal: ["@shopify/app-bridge-react"], // Only app-bridge-react, not polaris
    external: ["@shopify/polaris"] // Force Vite to externalize Polaris (ESM-only)
  },
  // Define globals for better tree-shaking
  define: {
    __DEV__: process.env.NODE_ENV === 'development',
    __PROD__: process.env.NODE_ENV === 'production'
  }
}) satisfies UserConfig;