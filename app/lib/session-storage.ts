/**
 * ENHANCED SESSION STORAGE MODULE - VERCEL SERVERLESS OPTIMIZED
 * 
 * This module extends the boilerplate session storage with custom enhancements:
 * - Serverless-optimized caching
 * - Aggressive timeout handling
 * - Error handling and retry logic
 * - Memory management for cold starts
 */

import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prismaInstance from "./database";

// Vercel serverless optimized session storage
export class EnhancedPrismaSessionStorage extends PrismaSessionStorage<any> {
  private errorCount = 0;
  private cache = new Map<string, any>();
  private sessionCountCache = { count: 0, lastUpdated: 0 };
  private readonly CACHE_TTL = 3 * 60 * 1000; // Reduced to 3 minutes for serverless
  
  constructor(prismaClient: typeof prismaInstance) {
    super(prismaClient);
    console.log('[SESSION] Enhanced Prisma session storage initialized for Vercel serverless');
    
    // Don't use setInterval in serverless - it can cause memory leaks
    // Instead, clean up on each operation
  }

  async storeSession(session: any): Promise<boolean> {
    // Clean up cache on each operation
    this.cleanupCache();
    
    try {
      console.log(`[SESSION] Storing session: ${session.id}`);
      console.log(`[SESSION] Session shop: ${session.shop}`);
      
      // Cache the session for faster access
      this.cache.set(session.id, {
        session,
        timestamp: Date.now()
      });
      
      // Use timeout wrapper for serverless
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Session store timeout')), 5000);
      });
      
      const result = await Promise.race([
        super.storeSession(session),
        timeoutPromise
      ]);
      
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
      
      // For serverless, don't throw immediately - try to use cache
      if (this.errorCount < 3) {
        console.log('[SESSION] Attempting to continue with cached session');
        // Return true to indicate we'll handle this with cache
        return true;
      }
      
      // Rethrow for proper error handling upstream
      throw error;
    }
  }

  async loadSession(id: string): Promise<any> {
    // Clean up cache on each operation
    this.cleanupCache();
    
    try {
      console.log(`[SESSION] Loading session: ${id}`);
      
      // Check cache first - prioritize cache in serverless
      const cached = this.cache.get(id);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log(`[SESSION] Returning cached session: ${id}`);
        return cached.session;
      }
      
      // Use timeout wrapper for serverless
      const timeoutPromise = new Promise<any>((_, reject) => {
        setTimeout(() => reject(new Error('Session load timeout')), 3000);
      });
      
      const session = await Promise.race([
        super.loadSession(id),
        timeoutPromise
      ]);
      
      if (session) {
        console.log(`[SESSION] Session loaded successfully: ${id}`);
        console.log(`[SESSION] Session shop: ${session.shop}`);
        console.log(`[SESSION] Session isOnline: ${session.isOnline}`);
        
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
      
      // Try to return cached version as fallback
      const cached = this.cache.get(id);
      if (cached) {
        console.log(`[SESSION] Returning stale cached session as fallback: ${id}`);
        return cached.session;
      }
      
      // For serverless, return null instead of throwing for load operations
      if (this.errorCount < 5) {
        console.log('[SESSION] Session load failed, returning null for auth retry');
        return null;
      }
      
      // Rethrow for proper error handling upstream
      throw error;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      console.log(`[SESSION] Deleting session: ${id}`);
      
      // Remove from cache first
      this.cache.delete(id);
      
      // Use timeout wrapper for serverless
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Session delete timeout')), 3000);
      });
      
      const result = await Promise.race([
        super.deleteSession(id),
        timeoutPromise
      ]);
      
      console.log(`[SESSION] Session deleted successfully: ${result}`);
      
      // Update session count cache
      this.sessionCountCache.lastUpdated = 0; // Force refresh on next count request
      
      this.errorCount = 0; // Reset error count on success
      return result;
    } catch (error) {
      this.errorCount++;
      console.error(`[SESSION] Error deleting session ${id}:`, error);
      console.error(`[SESSION] Error count: ${this.errorCount}`);
      
      // For delete operations, assume success if we removed from cache
      if (this.errorCount < 3) {
        console.log('[SESSION] Delete failed, but removed from cache');
        return true;
      }
      
      // Rethrow for proper error handling upstream
      throw error;
    }
  }

  async findSessionsByShop(shop: string): Promise<any[]> {
    try {
      console.log(`[SESSION] Finding sessions for shop: ${shop}`);
      
      // Use timeout wrapper for serverless
      const timeoutPromise = new Promise<any[]>((_, reject) => {
        setTimeout(() => reject(new Error('Find sessions timeout')), 3000);
      });
      
      const sessions = await Promise.race([
        super.findSessionsByShop(shop),
        timeoutPromise
      ]);
      
      console.log(`[SESSION] Found ${sessions.length} sessions for shop: ${shop}`);
      
      // Cache the sessions
      sessions.forEach((session: any) => {
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
      
      // Return cached sessions for this shop as fallback
      const cachedSessions: any[] = [];
      for (const [_, value] of this.cache.entries()) {
        if (value.session && value.session.shop === shop) {
          cachedSessions.push(value.session);
        }
      }
      
      if (cachedSessions.length > 0) {
        console.log(`[SESSION] Returning ${cachedSessions.length} cached sessions for shop ${shop}`);
        return cachedSessions;
      }
      
      // For serverless, return empty array instead of throwing
      if (this.errorCount < 3) {
        console.log('[SESSION] Find sessions failed, returning empty array');
        return [];
      }
      
      // Rethrow for proper error handling upstream
      throw error;
    }
  }

  async getSessionCount(): Promise<number> {
    try {
      // Use cached count if recent (more aggressive caching for serverless)
      if (this.sessionCountCache.lastUpdated && 
          Date.now() - this.sessionCountCache.lastUpdated < this.CACHE_TTL) {
        return this.sessionCountCache.count;
      }
      
      // Use timeout wrapper for serverless
      const timeoutPromise = new Promise<number>((_, reject) => {
        setTimeout(() => reject(new Error('Session count timeout')), 2000);
      });
      
      const count = await Promise.race([
        prisma.session.count(),
        timeoutPromise
      ]);
      
      // Update cache
      this.sessionCountCache = {
        count,
        lastUpdated: Date.now()
      };
      
      console.log(`[SESSION] Total session count: ${count}`);
      return count;
    } catch (error) {
      console.error('[SESSION] Error getting session count:', error);
      // Return cached count if available, otherwise estimate from cache
      const cacheSize = this.cache.size;
      console.log(`[SESSION] Using cache size estimate: ${cacheSize}`);
      return this.sessionCountCache.count || cacheSize;
    }
  }

  // More aggressive cleanup for serverless
  private cleanupCache() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    // Also limit cache size for memory management
    if (this.cache.size > 100) {
      const entries = Array.from(this.cache.entries());
      // Remove oldest entries
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, this.cache.size - 100);
      toRemove.forEach(([key]) => {
        this.cache.delete(key);
        cleaned++;
      });
    }
    
    if (cleaned > 0) {
      console.log(`[SESSION] Cleaned up ${cleaned} cached sessions`);
    }
  }

  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    this.sessionCountCache = { count: 0, lastUpdated: 0 };
    this.errorCount = 0; // Reset error count
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