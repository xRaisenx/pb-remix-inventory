
/// <reference types="vite/client" />
/// <reference types="@remix-run/node" />

declare module "*.css?url" {
  const url: string;
  export default url;
}

declare namespace NodeJS {
  interface ProcessEnv {
    EMBEDDED_APP?: string;
    SHOPIFY_API_KEY?: string;
    SHOPIFY_API_SECRET?: string;
    SHOPIFY_APP_URL?: string;
    SCOPES?: string;
    DATABASE_URL?: string;
    DIRECT_DATABASE_URL?: string;
  }
}
