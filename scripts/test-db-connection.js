#!/usr/bin/env node

/**
 * Enhanced Database Connection Test Script for Neon
 * Diagnoses connection issues and provides specific fixes
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Enhanced Prisma client with Neon optimizations
const createPrismaClient = () => {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Enhanced connection URL with optimized pooling for serverless
  let connectionUrl = databaseUrl;
  if (!connectionUrl.includes('pgbouncer=true')) {
    const separator = connectionUrl.includes('?') ? '&' : '?';
    connectionUrl += `${separator}pgbouncer=true&connection_limit=5&connect_timeout=60&pool_timeout=60&idle_timeout=30&max_lifetime=300`;
  }

  return new PrismaClient({
    log: ['error', 'warn'],
    datasources: {
      db: {
        url: connectionUrl,
      },
    },
  });
};

async function testDatabaseConnection() {
  console.log('🔍 Testing Neon Database Connection...\n');
  
  // Step 1: Validate environment
  console.log('1️⃣ Validating environment variables...');
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set');
    console.log('\n🔧 Fix: Set DATABASE_URL in your environment');
    return false;
  }
  
  // Validate URL format
  if (!databaseUrl.includes('postgresql://') && !databaseUrl.includes('postgres://')) {
    console.error('❌ DATABASE_URL does not appear to be a PostgreSQL connection string');
    return false;
  }
  
  // Check for Neon-specific indicators
  if (!databaseUrl.includes('neon.tech') && !databaseUrl.includes('aws.neon.tech')) {
    console.warn('⚠️  DATABASE_URL does not appear to be a Neon database');
  }
  
  console.log('✅ Environment variables validated');
  
  // Step 2: Test connection with retries
  console.log('\n2️⃣ Testing database connection...');
  const prisma = createPrismaClient();
  
  let connected = false;
  const maxRetries = 5;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`   Attempt ${attempt}/${maxRetries}...`);
      
      // Test connection
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1 as connection_test`;
      
      console.log('✅ Database connection successful!');
      connected = true;
      break;
      
    } catch (error) {
      console.error(`   ❌ Attempt ${attempt} failed:`, error.message);
      
      // Provide specific troubleshooting based on error type
      if (error.message.includes("Can't reach database server")) {
        console.log('   🔧 Issue: Database server unreachable');
        console.log('   💡 Solutions:');
        console.log('      • Check if Neon project is active');
        console.log('      • Verify database URL is correct');
        console.log('      • Check network connectivity');
      } else if (error.message.includes("connection pool")) {
        console.log('   🔧 Issue: Connection pool problem');
        console.log('   💡 Solutions:');
        console.log('      • Reduce connection_limit parameter');
        console.log('      • Increase pool_timeout');
        console.log('      • Check for connection leaks');
      } else if (error.message.includes("authentication")) {
        console.log('   🔧 Issue: Authentication failed');
        console.log('   💡 Solutions:');
        console.log('      • Verify database credentials');
        console.log('      • Check if user has proper permissions');
        console.log('      • Ensure database exists');
      } else if (error.message.includes("timeout")) {
        console.log('   🔧 Issue: Connection timeout');
        console.log('   💡 Solutions:');
        console.log('      • Increase connect_timeout parameter');
        console.log('      • Check network latency');
        console.log('      • Verify Neon region compatibility');
      }
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`   ⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  if (!connected) {
    console.error('\n❌ Failed to connect after all attempts');
    console.log('\n🔧 Recommended fixes:');
    console.log('1. Check Neon console: https://console.neon.tech/');
    console.log('2. Verify project status is "Active"');
    console.log('3. Ensure compute is "Running"');
    console.log('4. Get fresh connection string from Neon');
    console.log('5. Update DATABASE_URL in Vercel environment');
    
    await prisma.$disconnect();
    return false;
  }
  
  // Step 3: Test basic operations
  console.log('\n3️⃣ Testing basic database operations...');
  
  try {
    // Test session table access (critical for Shopify)
    const sessionCount = await prisma.session.count();
    console.log(`✅ Session table accessible (${sessionCount} sessions)`);
    
    // Test shop table access
    const shopCount = await prisma.shop.count();
    console.log(`✅ Shop table accessible (${shopCount} shops)`);
    
    // Test product table access
    const productCount = await prisma.product.count();
    console.log(`✅ Product table accessible (${productCount} products)`);
    
  } catch (error) {
    console.error('❌ Database operation test failed:', error.message);
    
    if (error.message.includes("does not exist")) {
      console.log('🔧 Issue: Database tables missing');
      console.log('💡 Solution: Run database migrations');
      console.log('   npm run db:setup');
    }
    
    await prisma.$disconnect();
    return false;
  }
  
  // Step 4: Performance test
  console.log('\n4️⃣ Testing connection performance...');
  
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1 as performance_test`;
    const duration = Date.now() - start;
    
    console.log(`✅ Query performance: ${duration}ms`);
    
    if (duration > 1000) {
      console.warn('⚠️  Slow connection detected (>1s)');
      console.log('💡 Consider:');
      console.log('   • Check Neon region vs Vercel region');
      console.log('   • Optimize connection pooling settings');
      console.log('   • Monitor Neon performance metrics');
    } else {
      console.log('✅ Connection performance is good');
    }
    
  } catch (error) {
    console.error('❌ Performance test failed:', error.message);
  }
  
  // Cleanup
  await prisma.$disconnect();
  console.log('\n✅ Database connection test completed successfully!');
  
  return true;
}

// Run the test
testDatabaseConnection()
  .then(success => {
    if (success) {
      console.log('\n🎉 All database tests passed!');
      process.exit(0);
    } else {
      console.log('\n❌ Database tests failed. Please check the issues above.');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n💥 Unexpected error during testing:', error);
    process.exit(1);
  }); 