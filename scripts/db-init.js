#!/usr/bin/env node

/**
 * Database Initialization Script for Vercel Deployment
 * This script ensures proper database setup and migration deployment
 */

import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

async function checkDatabaseConnection() {
  console.log('🔍 Checking database connection...');
  try {
    await prisma.$connect();
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

async function checkSessionTable() {
  console.log('🔍 Checking if Session table exists...');
  try {
    await prisma.session.count();
    console.log('✅ Session table exists and is accessible');
    return true;
  } catch (error) {
    console.error('❌ Session table check failed:', error);
    return false;
  }
}

async function runMigrations() {
  console.log('🚀 Running database migrations...');
  try {
    const { stdout, stderr } = await execAsync('npx prisma migrate deploy');
    console.log('Migration output:', stdout);
    if (stderr) {
      console.warn('Migration warnings:', stderr);
    }
    console.log('✅ Migrations completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return false;
  }
}

async function generatePrismaClient() {
  console.log('🔧 Generating Prisma client...');
  try {
    const { stdout, stderr } = await execAsync('npx prisma generate');
    console.log('Generate output:', stdout);
    if (stderr) {
      console.warn('Generate warnings:', stderr);
    }
    console.log('✅ Prisma client generated successfully');
    return true;
  } catch (error) {
    console.error('❌ Prisma client generation failed:', error);
    return false;
  }
}

async function seedShopData() {
  console.log('🌱 Checking for shop data...');
  try {
    const shopCount = await prisma.shop.count();
    console.log(`📊 Found ${shopCount} shop(s) in database`);
    
    if (shopCount === 0) {
      console.log('💡 No shops found - this is normal for a fresh installation');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Shop data check failed:', error);
    return false;
  }
}

async function main() {
  console.log('🎯 Starting Planet Beauty Inventory AI database initialization...\n');
  
  const steps = [
    { name: 'Generate Prisma Client', fn: generatePrismaClient },
    { name: 'Check Database Connection', fn: checkDatabaseConnection },
    { name: 'Run Migrations', fn: runMigrations },
    { name: 'Check Session Table', fn: checkSessionTable },
    { name: 'Seed Shop Data', fn: seedShopData },
  ];
  
  let success = true;
  
  for (const step of steps) {
    console.log(`\n📋 ${step.name}...`);
    const result = await step.fn();
    if (!result) {
      success = false;
      console.error(`❌ ${step.name} failed`);
      break;
    }
  }
  
  if (success) {
    console.log('\n🎉 Database initialization completed successfully!');
    console.log('🚀 Planet Beauty Inventory AI is ready to launch!');
  } else {
    console.error('\n💥 Database initialization failed');
    process.exit(1);
  }
  
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('💥 Initialization script failed:', error);
  process.exit(1);
});