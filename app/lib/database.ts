/**
 * ENHANCED DATABASE MODULE - VERCEL SERVERLESS OPTIMIZED
 * 
 * This module extends the boilerplate database configuration with custom enhancements:
 * - Vercel serverless optimizations
 * - Reduced connection limits for faster failures
 * - Optimized timeouts for serverless cold starts
 * - Health checks and monitoring
 */

import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

// Vercel serverless optimized configuration
const createPrismaClient = () => {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // Optimized connection string for Vercel serverless
  let connectionUrl = databaseUrl;
  
  // Ensure proper connection pooling parameters optimized for Vercel
  if (!connectionUrl.includes('pgbouncer=true')) {
    const separator = connectionUrl.includes('?') ? '&' : '?';
    // Vercel serverless optimized settings:
    // - Reduced connection_limit to prevent pool exhaustion (5 instead of 15)
    // - Reduced timeouts for faster failure detection
    // - Optimized for cold starts and short-lived connections
    connectionUrl += `${separator}pgbouncer=true&connection_limit=5&connect_timeout=3&pool_timeout=5&idle_timeout=10&max_lifetime=60&prepared_statements=false&statement_cache_size=50`;
  }

  console.log('[DB] Creating Prisma client for Vercel serverless');

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    datasources: {
      db: {
        url: connectionUrl,
      },
    },
    errorFormat: 'minimal',
    // Optimized transaction options for serverless
    __internal: {
      engine: {
        transactionOptions: {
          maxWait: 2000,   // Reduced from 5000ms
          timeout: 5000,   // Reduced from 10000ms
        },
      },
    },
  });
};

// Vercel serverless connection strategy
let prisma: PrismaClient;

if (process.env.NODE_ENV === "production") {
  // In production (Vercel), create new client each time to avoid connection reuse issues
  prisma = createPrismaClient();
} else {
  // In development, use global to prevent multiple instances during hot reloads
  if (!global.prisma) {
    global.prisma = createPrismaClient();
  }
  prisma = global.prisma;
}

// Connection management optimized for serverless
let isConnected = false;
let connectionAttempts = 0;
let lastConnectionTime = 0;
const CONNECTION_RETRY_DELAY = 1000; // Reduced delay
const MAX_CONNECTION_ATTEMPTS = 3;   // Reduced attempts for faster failure
const CONNECTION_TIMEOUT = 10000;    // Reduced timeout

// Optimized connection with aggressive timeouts for serverless
export const connectWithRetry = async (retries = 3, baseDelay = 500): Promise<void> => {
  // For serverless, always attempt fresh connection check
  connectionAttempts++;
  
  try {
    console.log(`[DB] Serverless connection attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS}`);
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), CONNECTION_TIMEOUT);
    });
    
    await Promise.race([
      prisma.$connect(),
      timeoutPromise
    ]);
    
    isConnected = true;
    lastConnectionTime = Date.now();
    connectionAttempts = 0;
    console.log(`[DB] Serverless connection successful`);
  } catch (error) {
    console.error(`[DB] Serverless connection attempt ${connectionAttempts} failed:`, error);
    
    if (connectionAttempts >= retries) {
      console.error(`[DB] Serverless connection failed after ${retries} attempts - proceeding without retry`);
      // In serverless, don't throw - let queries handle individual failures
      isConnected = false;
      return;
    }
    
    const delay = baseDelay * Math.pow(1.5, connectionAttempts - 1); // Gentler backoff
    console.log(`[DB] Retrying serverless connection in ${delay}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return connectWithRetry(retries, baseDelay);
  }
};

// Serverless-optimized health check with quick timeout
export const healthCheck = async (): Promise<{ 
  healthy: boolean; 
  latency?: number; 
  error?: string;
  connection?: string;
}> => {
  try {
    const startTime = Date.now();
    
    // Use a simple query with timeout for serverless
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), 3000);
    });
    
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      timeoutPromise
    ]);
    
    const latency = Date.now() - startTime;
    
    return {
      healthy: true,
      latency,
      connection: 'vercel-serverless'
    };
  } catch (error) {
    console.error('[DB] Serverless health check failed:', error);
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      connection: 'failed'
    };
  }
};

// Serverless-optimized query execution with aggressive timeouts
export const executeQuery = async <T>(
  queryFn: () => Promise<T>,
  operation: string,
  retries = 2  // Reduced retries for serverless
): Promise<T> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[DB] Serverless ${operation} (attempt ${attempt}/${retries})`);
      
      // Add timeout wrapper for serverless queries
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Query timeout: ${operation}`)), 8000);
      });
      
      const result = await Promise.race([
        queryFn(),
        timeoutPromise
      ]);
      
      console.log(`[DB] Serverless ${operation} completed successfully`);
      return result;
    } catch (error: any) {
      console.error(`[DB] Serverless ${operation} failed on attempt ${attempt}:`, error);
      
      // Check if it's a connection error that should trigger retry
      const isRetriableError = 
        error?.code === 'P1001' || // Can't reach database server
        error?.code === 'P1017' || // Server has closed the connection
        error?.code === 'P2024' || // Timed out fetching a new connection
        error?.message?.includes('Connection terminated unexpectedly') ||
        error?.message?.includes('Connection closed') ||
        error?.message?.includes('server closed the connection unexpectedly') ||
        error?.message?.includes('Connection pool timeout') ||
        error?.message?.includes('Query timeout');
      
      if (attempt === retries || !isRetriableError) {
        console.error(`[DB] Serverless ${operation} failed permanently after ${attempt} attempts`);
        throw error;
      }
      
      // For serverless, use shorter backoff
      const backoffDelay = Math.min(500 * attempt, 1500);
      console.log(`[DB] Retrying serverless ${operation} in ${backoffDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
  
  throw new Error(`[DB] Serverless ${operation} failed after ${retries} attempts`);
};

// Optimized session table check for serverless
export const checkSessionTable = async (): Promise<boolean> => {
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Session table check timeout')), 3000);
    });
    
    await Promise.race([
      prisma.session.findFirst({ take: 1 }),
      timeoutPromise
    ]);
    
    console.log('[DB] Serverless session table check successful');
    return true;
  } catch (error) {
    console.error('[DB] Serverless session table check failed:', error);
    return false;
  }
};

// Serverless cleanup - don't rely on process events
export const disconnectPrisma = async () => {
  try {
    await prisma.$disconnect();
    console.log('[DB] Serverless Prisma client disconnected');
  } catch (error) {
    console.error('[DB] Error disconnecting Prisma client:', error);
  }
};

// For serverless, don't register process handlers
// Instead, let Vercel handle the cleanup

// Don't connect immediately in serverless - connect on demand
// connectWithRetry().catch(error => {
//   console.error('[DB] Initial serverless connection failed:', error);
// });

export default prisma;