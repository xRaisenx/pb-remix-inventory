#!/usr/bin/env node

/**
 * 🔧 Add Session Table Indexes
 * 
 * This script manually adds indexes to the Session table to improve
 * query performance and resolve the slow Session.count issue.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addSessionIndexes() {
  try {
    console.log('🔧 Adding Session table indexes...');
    
    // Add indexes to improve query performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS "Session_state_idx" ON "Session"("state")',
      'CREATE INDEX IF NOT EXISTS "Session_expires_idx" ON "Session"("expires")',
      'CREATE INDEX IF NOT EXISTS "Session_isOnline_idx" ON "Session"("isOnline")',
      'CREATE INDEX IF NOT EXISTS "Session_shopId_state_idx" ON "Session"("shopId", "state")',
      'CREATE INDEX IF NOT EXISTS "Session_expires_isOnline_idx" ON "Session"("expires", "isOnline")'
    ];
    
    for (const index of indexes) {
      console.log(`Adding index: ${index}`);
      await prisma.$executeRawUnsafe(index);
    }
    
    console.log('✅ Session table indexes added successfully');
    
    // Test the performance improvement
    console.log('🧪 Testing Session.count performance...');
    const start = Date.now();
    const count = await prisma.session.count();
    const duration = Date.now() - start;
    
    console.log(`Session.count result: ${count} sessions`);
    console.log(`Query duration: ${duration}ms`);
    
    if (duration < 1000) {
      console.log('✅ Performance improvement confirmed');
    } else {
      console.log('⚠️ Query still slow, may need additional optimization');
    }
    
  } catch (error) {
    console.error('❌ Error adding indexes:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addSessionIndexes(); 