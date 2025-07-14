/**
 * ENHANCED DATABASE MODULE
 * 
 * This module extends the boilerplate database configuration with custom enhancements:
 * - Neon serverless optimizations
 * - Connection pooling and retry logic
 * - Health checks and monitoring
 * - Performance enhancements
 */

import { PrismaClient } from "@prisma/client";
// Import the base boilerplate configuration
// import basePrisma from "../boilerplate/db.server";

declare global {
  var prisma: PrismaClient | undefined;
}

// Enhanced configuration for Neon serverless with improved connection management
const createPrismaClient = () => {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // Enhanced Neon connection configuration optimized for serverless
  let connectionUrl = databaseUrl;
  
  // Ensure proper connection pooling parameters for Neon serverless
  if (!connectionUrl.includes('pgbouncer=true')) {
    const separator = connectionUrl.includes('?') ? '&' : '?';
    // Optimized settings for Neon serverless with better performance:
    // - Increased connection_limit for better concurrency
    // - Reduced timeouts for faster failure detection
    // - Added proper pooling configuration
    // - Added statement_cache_size for better performance
    connectionUrl += `${separator}pgbouncer=true&connection_limit=15&connect_timeout=5&pool_timeout=10&idle_timeout=20&max_lifetime=300&prepared_statements=false&statement_cache_size=100`;
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    datasources: {
      db: {
        url: connectionUrl,
      },
    },
    errorFormat: 'minimal',
    // Add connection pooling configuration
    __internal: {
      engine: {
        transactionOptions: {
          maxWait: 5000,
          timeout: 10000,
        },
      },
    },
  });
};

// Enhanced connection strategy for Neon serverless with connection management
let prisma: PrismaClient;

if (process.env.NODE_ENV === "production") {
  prisma = createPrismaClient();
} else {
  // In development, use global to prevent multiple instances during hot reloads
  if (!global.prisma) {
    global.prisma = createPrismaClient();
  }
  prisma = global.prisma;
}

// Connection management and health monitoring
let isConnected = false;
let connectionAttempts = 0;
let lastConnectionTime = 0;
const CONNECTION_RETRY_DELAY = 2000;
const MAX_CONNECTION_ATTEMPTS = 8;
const CONNECTION_TIMEOUT = 15000;

// Enhanced connection with comprehensive retry logic
export const connectWithRetry = async (retries = 5, baseDelay = 1000): Promise<void> => {
  if (isConnected && Date.now() - lastConnectionTime < 30000) {
    return; // Use cached connection if recent
  }

  connectionAttempts++;
  
  try {
    console.log(`[DB] Connection attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS}`);
    
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
    console.log(`[DB] Successfully connected to database`);
  } catch (error) {
    console.error(`[DB] Connection attempt ${connectionAttempts} failed:`, error);
    
    if (connectionAttempts >= retries) {
      throw new Error(`Failed to connect to database after ${retries} attempts: ${error}`);
    }
    
    const delay = baseDelay * Math.pow(2, connectionAttempts - 1);
    console.log(`[DB] Retrying in ${delay}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return connectWithRetry(retries, baseDelay);
  }
};

// Health check function with detailed diagnostics
export const healthCheck = async (): Promise<{ 
  healthy: boolean; 
  latency?: number; 
  error?: string;
  connection?: string;
}> => {
  try {
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - startTime;
    
    return {
      healthy: true,
      latency,
      connection: 'active'
    };
  } catch (error) {
    console.error('[DB] Health check failed:', error);
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      connection: 'failed'
    };
  }
};

// Enhanced query execution with retry logic and error handling
export const executeQuery = async <T>(
  queryFn: () => Promise<T>,
  operation: string,
  retries = 4
): Promise<T> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[DB] Executing ${operation} (attempt ${attempt}/${retries})`);
      const result = await queryFn();
      console.log(`[DB] ${operation} completed successfully`);
      return result;
    } catch (error: any) {
      console.error(`[DB] ${operation} failed on attempt ${attempt}:`, error);
      
      // Check if it's a connection error that should trigger retry
      const isRetriableError = 
        error?.code === 'P1001' || // Can't reach database server
        error?.code === 'P1017' || // Server has closed the connection
        error?.code === 'P2024' || // Timed out fetching a new connection
        error?.message?.includes('Connection terminated unexpectedly') ||
        error?.message?.includes('Connection closed') ||
        error?.message?.includes('server closed the connection unexpectedly') ||
        error?.message?.includes('Connection pool timeout');
      
      if (attempt === retries || !isRetriableError) {
        console.error(`[DB] ${operation} failed permanently after ${attempt} attempts`);
        throw error;
      }
      
      // Reset connection status to force reconnection
      isConnected = false;
      
      // Exponential backoff for retries
      const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      console.log(`[DB] Retrying ${operation} in ${backoffDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      
      // Try to reconnect before next attempt
      try {
        await connectWithRetry();
      } catch (reconnectError) {
        console.error('[DB] Reconnection failed:', reconnectError);
        // Continue with retry anyway
      }
    }
  }
  
  throw new Error(`[DB] ${operation} failed after ${retries} attempts`);
};

// Utility function to check if session table exists
export const checkSessionTable = async (): Promise<boolean> => {
  try {
    await prisma.session.findFirst();
    return true;
  } catch (error) {
    console.error('[DB] Session table check failed:', error);
    return false;
  }
};

// Graceful shutdown handler
const gracefulShutdown = async () => {
  console.log('[DB] Initiating graceful shutdown...');
  try {
    await prisma.$disconnect();
    console.log('[DB] Database connection closed gracefully');
  } catch (error) {
    console.error('[DB] Error during graceful shutdown:', error);
  }
};

// Register shutdown handlers
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('beforeExit', gracefulShutdown);

// Connect immediately on module load
connectWithRetry().catch(error => {
  console.error('[DB] Initial connection failed:', error);
});

export default prisma;