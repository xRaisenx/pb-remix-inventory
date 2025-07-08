
/// <reference types="vite/client" />
/// <reference types="@remix-run/node" />

declare module "*.css?url" {
  const url: string;
  export default url;
}
