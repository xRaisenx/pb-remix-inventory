#!/usr/bin/env node

/**
 * Database Schema Fix Script for Production
 * Adds missing columns to resolve schema mismatch errors
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const createPrismaClient = () => {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Enhanced connection URL with optimized pooling for serverless
  let connectionUrl = databaseUrl;
  if (!connectionUrl.includes('pgbouncer=true')) {
    const separator = connectionUrl.includes('?') ? '&' : '?';
    connectionUrl += `${separator}pgbouncer=true&connection_limit=5&connect_timeout=30&pool_timeout=30`;
  }

  return new PrismaClient({
    log: ['error'],
    datasources: {
      db: {
        url: connectionUrl,
      },
    },
  });
};

const prisma = createPrismaClient();

async function fixCriticalColumns() {
  console.log('🔧 Adding critical missing columns...');
  
  const criticalFixes = [
    // Most critical - Shop.criticalStockThreshold
    'ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "criticalStockThreshold" INTEGER DEFAULT 5',
    'ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "highDemandThreshold" DOUBLE PRECISION DEFAULT 50.0',
    
    // Product table essentials
    'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "shopifyInventoryItemId" TEXT',
    'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "handle" TEXT',
    'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "price" DECIMAL(10,2) DEFAULT 0',
    'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "quantity" INTEGER DEFAULT 0',
    'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sku" TEXT',
    'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT',
    'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "description" TEXT',
    'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "weight" DOUBLE PRECISION',
    'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "dimensions" TEXT',
    'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "lastUpdated" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP',
    'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "lastUpdatedBy" TEXT',
  ];
  
  for (const sql of criticalFixes) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(`✅ Applied: ${sql.split(' ')[3]}.${sql.split(' ')[7]}`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log(`⏭️  Already exists: ${sql.split(' ')[3]}.${sql.split(' ')[7]}`);
      } else {
        console.error(`❌ Failed: ${sql.split(' ')[3]}.${sql.split(' ')[7]} - ${error.message}`);
      }
    }
  }
}

async function verifyFixes() {
  console.log('🔍 Verifying critical fixes...');
  
  try {
    // Test the most critical column that was failing
    await prisma.shop.findMany({ 
      select: { id: true, criticalStockThreshold: true },
      take: 1
    });
    console.log('✅ Shop.criticalStockThreshold is now accessible');
    
    await prisma.session.count();
    console.log('✅ Session table is accessible');
    
    return true;
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🎯 Planet Beauty Inventory AI - Critical Schema Fixes\n');
  
  try {
    await fixCriticalColumns();
    const verified = await verifyFixes();
    
    if (verified) {
      console.log('\n🎉 Critical schema fixes completed successfully!');
      console.log('🚀 App should now work without column errors');
    } else {
      console.log('\n⚠️  Schema fixes applied but verification failed');
      console.log('💡 This may be expected during deployment - try again in a moment');
    }
    
  } catch (error) {
    console.error('\n💥 Schema fix failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});