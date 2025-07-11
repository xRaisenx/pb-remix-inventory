#!/usr/bin/env node

/**
 * Enhanced Database Initialization Script for Vercel + Neon Deployment
 * Resolves common Neon connectivity issues and ensures proper setup
 */

import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Enhanced Prisma client with Neon optimizations
const createPrismaClient = () => {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Ensure proper Neon connection parameters (optimized for serverless)
  let connectionUrl = databaseUrl;
  if (!connectionUrl.includes('pgbouncer=true')) {
    const separator = connectionUrl.includes('?') ? '&' : '?';
    connectionUrl += `${separator}pgbouncer=true&connection_limit=3&connect_timeout=30&pool_timeout=30`;
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

const prisma = createPrismaClient();

async function validateEnvironment() {
  console.log('🔍 Validating environment variables...');
  
  const requiredVars = ['DATABASE_URL', 'SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    return false;
  }
  
  // Validate DATABASE_URL format
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl.includes('postgresql://') && !dbUrl.includes('postgres://')) {
    console.error('❌ DATABASE_URL does not appear to be a PostgreSQL connection string');
    return false;
  }
  
  if (!dbUrl.includes('neon.tech') && !dbUrl.includes('aws.neon.tech')) {
    console.warn('⚠️  DATABASE_URL does not appear to be a Neon database');
  }
  
  console.log('✅ Environment variables validated');
  return true;
}

async function checkDatabaseConnection(retries = 5) {
  console.log(`🔍 Checking Neon database connection (${retries} retries)...`);
  
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1 as connection_test`;
      console.log(`✅ Neon database connection successful (attempt ${i + 1})`);
      return true;
    } catch (error) {
      console.error(`❌ Connection attempt ${i + 1}/${retries} failed:`, error.message);
      
      if (error.message.includes("Can't reach database server")) {
        console.error("🚨 Neon database server unreachable. Please check:");
        console.error("   • Neon project status");
        console.error("   • Database URL validity"); 
        console.error("   • Network connectivity");
      }
      
      if (i < retries - 1) {
        const delay = Math.pow(2, i) * 1000;
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  return false;
}

async function checkSessionTable() {
  console.log('🔍 Checking Session table for Shopify authentication...');
  try {
    const count = await prisma.session.count();
    console.log(`✅ Session table exists and accessible (${count} sessions)`);
    return true;
  } catch (error) {
    console.error('❌ Session table check failed:', error.message);
    
    if (error.message.includes('does not exist')) {
      console.error('🚨 Session table missing - migrations may not have run properly');
    }
    return false;
  }
}

async function runMigrations() {
  console.log('🚀 Running Prisma migrations...');
  try {
    // Generate client first
    console.log('📦 Generating Prisma client...');
    const { stdout: genStdout, stderr: genStderr } = await execAsync('npx prisma generate');
    console.log('Generate output:', genStdout);
    if (genStderr) console.warn('Generate warnings:', genStderr);
    
    // Deploy migrations
    console.log('🗃️  Deploying migrations...');
    const { stdout, stderr } = await execAsync('npx prisma migrate deploy');
    console.log('Migration output:', stdout);
    if (stderr) console.warn('Migration warnings:', stderr);
    
    console.log('✅ Migrations completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    
    if (error.message.includes('migration engine')) {
      console.error('🚨 Migration engine error - check Neon database permissions');
    }
    return false;
  }
}

async function fixDatabaseSchema() {
  console.log('🔧 Fixing database schema...');
  try {
    // Run the schema fix script
    const { stdout, stderr } = await execAsync('npm run db:fix');
    console.log('Schema fix output:', stdout);
    if (stderr) console.warn('Schema fix warnings:', stderr);
    
    console.log('✅ Database schema fixes completed');
    return true;
  } catch (error) {
    console.error('❌ Schema fix failed:', error.message);
    
    // Check if the issue is missing columns
    if (error.message.includes('does not exist')) {
      console.error('🚨 Column missing error - attempting manual fix');
    }
    return false;
  }
}

async function verifyShopifyIntegration() {
  console.log('�️  Verifying Shopify integration setup...');
  try {
    // Check if we can create/read shop data
    const shops = await prisma.shop.findMany({ take: 1 });
    console.log(`✅ Shop table accessible (found ${shops.length} shops)`);
    
    // Check notification settings table
    const notificationSettings = await prisma.notificationSetting.findMany({ take: 1 });
    console.log(`✅ Notification settings accessible (found ${notificationSettings.length} settings)`);
    
    return true;
  } catch (error) {
    console.error('❌ Shopify integration verification failed:', error.message);
    return false;
  }
}

async function performHealthCheck() {
  console.log('� Performing comprehensive health check...');
  try {
    const start = Date.now();
    
    // Test basic queries
    await prisma.$queryRaw`SELECT version()`;
    const latency = Date.now() - start;
    
    console.log(`✅ Database health check passed (${latency}ms latency)`);
    
    if (latency > 2000) {
      console.warn('⚠️  High latency detected - consider connection optimization');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🎯 Planet Beauty Inventory AI - Enhanced Database Initialization\n');
  console.log('🔥 Neon PostgreSQL + Vercel Serverless Optimization\n');
  
  const steps = [
    { name: '🌐 Environment Validation', fn: validateEnvironment },
    { name: '🔌 Neon Connection Test', fn: () => checkDatabaseConnection(5) },
    { name: '🛠️  Migration Deployment', fn: runMigrations },
    { name: '🔧 Schema Fix Application', fn: fixDatabaseSchema },
    { name: '🎫 Session Table Check', fn: checkSessionTable },
    { name: '🛍️  Shopify Integration', fn: verifyShopifyIntegration },
    { name: '🏥 Health Check', fn: performHealthCheck },
  ];
  
  let success = true;
  const results = [];
  
  for (const step of steps) {
    console.log(`\n📋 ${step.name}...`);
    const start = Date.now();
    
    try {
      const result = await step.fn();
      const duration = Date.now() - start;
      
      if (result) {
        console.log(`✅ ${step.name} completed (${duration}ms)`);
        results.push({ step: step.name, success: true, duration });
      } else {
        console.error(`❌ ${step.name} failed (${duration}ms)`);
        results.push({ step: step.name, success: false, duration });
        success = false;
        break;
      }
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`💥 ${step.name} threw error (${duration}ms):`, error.message);
      results.push({ step: step.name, success: false, duration, error: error.message });
      success = false;
      break;
    }
  }
  
  console.log('\n📊 Initialization Summary:');
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    console.log(`  ${status} ${result.step}: ${result.duration}ms`);
    if (result.error) {
      console.log(`     Error: ${result.error}`);
    }
  });
  
  if (success) {
    console.log('\n🎉 Database initialization completed successfully!');
    console.log('🚀 Planet Beauty Inventory AI is ready for Shopify!');
    console.log('\n💡 Next steps:');
    console.log('   • Deploy to Vercel');
    console.log('   • Install on Shopify store');
    console.log('   • Configure notification settings');
  } else {
    console.error('\n💥 Database initialization failed');
    console.error('\n🔧 Troubleshooting suggestions:');
    console.error('   • Check Neon project status');
    console.error('   • Verify DATABASE_URL is correct');
    console.error('   • Ensure Neon database is running');
    console.error('   • Check network connectivity');
    process.exit(1);
  }
  
  await prisma.$disconnect();
}

// Handle process errors gracefully
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

main().catch((error) => {
  console.error('💥 Initialization script failed:', error);
  process.exit(1);
});