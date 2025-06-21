// <reference types="@shopify/shopify-app-remix/globals" />

// Declare modules for CSS files to allow importing them in TypeScript
declare module "*.css";

// Add specific declaration for Vite's `?url` suffix imports
declare module '*.css?url' {
  const url: string;
  export default url;
}

// These declarations are helpful if you are importing the CSS directly
// but the `?url` import is more common in modern Vite setups.
declare module "@shopify/polaris/build/esm/styles.css";
declare module "./styles/app.css";
