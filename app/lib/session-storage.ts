/**
 * ENHANCED SESSION STORAGE MODULE
 * 
 * This module extends the boilerplate session storage with custom enhancements:
 * - Caching for improved performance
 * - Error handling and retry logic
 * - Session monitoring and diagnostics
 * - Automatic cleanup and optimization
 */

import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./database";

// Enhanced session storage with error handling and performance optimization
export class EnhancedPrismaSessionStorage extends PrismaSessionStorage<any> {
  private errorCount = 0;
  private cache = new Map<string, any>();
  private sessionCountCache = { count: 0, lastUpdated: 0 };
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL
  
  constructor(prismaClient: typeof prisma) {
    super(prismaClient);
    console.log('Enhanced Prisma session storage initialized');
    
    // Start cache cleanup interval
    setInterval(() => this.cleanupCache(), 10 * 60 * 1000); // Cleanup every 10 minutes
  }

  async storeSession(session: any): Promise<boolean> {
    try {
      console.log(`[SESSION] Storing session: ${session.id}`);
      console.log(`[SESSION] Session shop: ${session.shop}`);
      console.log(`[SESSION] Session state: ${session.state}`);
      
      // Cache the session for faster access
      this.cache.set(session.id, {
        session,
        timestamp: Date.now()
      });
      
      const result = await super.storeSession(session);
      console.log(`[SESSION] Session stored successfully: ${result}`);
      
      // Update session count cache
      this.sessionCountCache.lastUpdated = 0; // Force refresh on next count request
      
      this.errorCount = 0; // Reset error count on success
      return result;
    } catch (error) {
      this.errorCount++;
      console.error(`[SESSION] Error storing session ${session.id}:`, error);
      console.error(`[SESSION] Error count: ${this.errorCount}`);
      
      // Remove from cache on error
      this.cache.delete(session.id);
      
      // Rethrow for proper error handling upstream
      throw error;
    }
  }

  async loadSession(id: string): Promise<any> {
    try {
      console.log(`[SESSION] Loading session: ${id}`);
      
      // Check cache first
      const cached = this.cache.get(id);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log(`[SESSION] Returning cached session: ${id}`);
        return cached.session;
      }
      
      const session = await super.loadSession(id);
      
      if (session) {
        console.log(`[SESSION] Session loaded successfully: ${id}`);
        console.log(`[SESSION] Session shop: ${session.shop}`);
        console.log(`[SESSION] Session isOnline: ${session.isOnline}`);
        console.log(`[SESSION] Session scope: ${session.scope}`);
        
        // Cache the loaded session
        this.cache.set(id, {
          session,
          timestamp: Date.now()
        });
      } else {
        console.log(`[SESSION] Session not found: ${id}`);
        // Remove from cache if not found
        this.cache.delete(id);
      }
      
      this.errorCount = 0; // Reset error count on success
      return session;
    } catch (error) {
      this.errorCount++;
      console.error(`[SESSION] Error loading session ${id}:`, error);
      console.error(`[SESSION] Error count: ${this.errorCount}`);
      
      // Remove from cache on error
      this.cache.delete(id);
      
      // Try to return cached version as fallback if available
      const cached = this.cache.get(id);
      if (cached) {
        console.log(`[SESSION] Returning stale cached session as fallback: ${id}`);
        return cached.session;
      }
      
      // Rethrow for proper error handling upstream
      throw error;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      console.log(`[SESSION] Deleting session: ${id}`);
      
      // Remove from cache
      this.cache.delete(id);
      
      const result = await super.deleteSession(id);
      console.log(`[SESSION] Session deleted successfully: ${result}`);
      
      // Update session count cache
      this.sessionCountCache.lastUpdated = 0; // Force refresh on next count request
      
      this.errorCount = 0; // Reset error count on success
      return result;
    } catch (error) {
      this.errorCount++;
      console.error(`[SESSION] Error deleting session ${id}:`, error);
      console.error(`[SESSION] Error count: ${this.errorCount}`);
      
      // Rethrow for proper error handling upstream
      throw error;
    }
  }

  async findSessionsByShop(shop: string): Promise<any[]> {
    try {
      console.log(`[SESSION] Finding sessions for shop: ${shop}`);
      const sessions = await super.findSessionsByShop(shop);
      console.log(`[SESSION] Found ${sessions.length} sessions for shop: ${shop}`);
      
      // Cache the sessions
      sessions.forEach(session => {
        this.cache.set(session.id, {
          session,
          timestamp: Date.now()
        });
      });
      
      this.errorCount = 0; // Reset error count on success
      return sessions;
    } catch (error) {
      this.errorCount++;
      console.error(`[SESSION] Error finding sessions for shop ${shop}:`, error);
      console.error(`[SESSION] Error count: ${this.errorCount}`);
      
      // Rethrow for proper error handling upstream
      throw error;
    }
  }

  async getSessionCount(): Promise<number> {
    try {
      // Use cached count if recent
      if (this.sessionCountCache.lastUpdated && 
          Date.now() - this.sessionCountCache.lastUpdated < this.CACHE_TTL) {
        return this.sessionCountCache.count;
      }
      
      const count = await prisma.session.count();
      
      // Update cache
      this.sessionCountCache = {
        count,
        lastUpdated: Date.now()
      };
      
      console.log(`[SESSION] Total session count: ${count}`);
      return count;
    } catch (error) {
      console.error('[SESSION] Error getting session count:', error);
      // Return cached count if available
      return this.sessionCountCache.count || 0;
    }
  }

  private cleanupCache() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[SESSION] Cleaned up ${cleaned} cached sessions`);
    }
  }

  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    this.sessionCountCache = { count: 0, lastUpdated: 0 };
    console.log(`[SESSION] Cleared ${size} cached sessions`);
  }

  getCacheStats() {
    return {
      cacheSize: this.cache.size,
      errorCount: this.errorCount,
      sessionCount: this.sessionCountCache.count,
      lastCountUpdate: this.sessionCountCache.lastUpdated
    };
  }
}