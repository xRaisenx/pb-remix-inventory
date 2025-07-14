#!/usr/bin/env node

/**
 * Fix Session Table Script
 * 
 * This script ensures the Prisma session table exists and is properly migrated.
 * Run this before deployment to fix the MissingSessionTableError.
 */

const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixSessionTable() {
  console.log('🔧 Fixing session table...');
  
  try {
    // First, try to generate Prisma client
    console.log('📦 Generating Prisma client...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    
    // Then push schema to database (creates tables if they don't exist)
    console.log('🗄️  Pushing schema to database...');
    execSync('npx prisma db push --force-reset', { stdio: 'inherit' });
    
    // Verify session table exists
    console.log('✅ Verifying session table...');
    const sessionCount = await prisma.session.count();
    console.log(`✅ Session table exists with ${sessionCount} sessions`);
    
    console.log('🎉 Session table fixed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing session table:', error);
    
    // If push fails, try migration
    try {
      console.log('🔄 Trying migration deploy...');
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      
      // Verify again
      const sessionCount = await prisma.session.count();
      console.log(`✅ Session table exists with ${sessionCount} sessions`);
      console.log('🎉 Session table fixed with migration!');
      
    } catch (migrationError) {
      console.error('❌ Migration also failed:', migrationError);
      console.log('💡 Manual fix required - check DATABASE_URL and Prisma schema');
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
fixSessionTable().catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});