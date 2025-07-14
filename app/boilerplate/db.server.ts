/**
 * SHOPIFY BOILERPLATE FILE - DO NOT MODIFY DIRECTLY
 * 
 * ⚠️  WARNING: This file contains the core database configuration from the official boilerplate.
 * 
 * Future developers MUST NOT modify this file to avoid breaking functionality.
 * Instead, all custom database logic should be placed in separate files.
 * 
 * For customizations:
 * - Create custom database utilities in app/lib/database.ts
 * - Create connection pooling logic in app/lib/connection-pool.ts
 * - Import and use the base prisma client from this file
 * 
 * Last synced with: shopify-app-template-remix (latest)
 */

import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;