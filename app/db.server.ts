import { PrismaClient } from "@prisma/client";

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
    errorFormat: 'minimal'
  });
};

// Enhanced connection strategy for Neon serverless with connection management
let prisma: PrismaClient;

// Initialize Prisma client with connection management
if (process.env.NODE_ENV === "production") {
  prisma = createPrismaClient();
} else {
  if (!global.prisma) {
    global.prisma = createPrismaClient();
  }
  prisma = global.prisma;
}

// Enhanced middleware with better error handling and performance monitoring
prisma.$use(async (params: any, next: any) => {
  const start = Date.now();
  let retries = 0;
  const maxRetries = 2; // Reduced retries for faster failure
  
  while (retries <= maxRetries) {
    try {
      const result = await next(params);
      const duration = Date.now() - start;
      
      // Log slow queries for performance monitoring
      if (duration > 1000) {
        console.log(`[DB PERF] Query ${params.model}.${params.action} took ${duration}ms`);
        if (duration > 5000) {
          console.log(`[DB WARNING] Slow query detected: ${params.model}.${params.action} (${duration}ms)`);
        }
      }
      
      return result;
    } catch (error: any) {
      const duration = Date.now() - start;
      retries++;
      
      console.error(`[DB ERROR] Query ${params.model}.${params.action} failed (attempt ${retries}/${maxRetries + 1}):`, error.message);
      
      // Check for connection errors that should trigger retry
      const isConnectionError = error.message?.includes('connect') || 
                               error.message?.includes('timeout') ||
                               error.message?.includes('connection') ||
                               error.code === 'P1001' ||
                               error.code === 'P1008' ||
                               error.code === 'P1017';
      
      if (retries <= maxRetries && isConnectionError) {
        const delay = Math.min(1000 * Math.pow(2, retries - 1), 3000); // Reduced max delay
        console.log(`[DB RETRY] Retrying query in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // For non-retryable errors or max retries exceeded
      console.error(`[DB ERROR] Query ${params.model}.${params.action} failed after ${retries} attempts (${duration}ms):`, error);
      throw error;
    }
  }
});

// Enhanced connection management with exponential backoff for Neon
export const connectWithRetry = async (retries = 5, baseDelay = 1000): Promise<void> => {
  let lastError: Error | null = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      // Use a simple query to test connection
      await prisma.$queryRaw`SELECT 1 as test`;
      console.log(`[DB NEON] Connected successfully (attempt ${i + 1})`);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[DB NEON] Connection attempt ${i + 1}/${retries} failed:`, lastError.message);
      
      if (i === retries - 1) {
        console.error(`[DB NEON] Failed to connect after ${retries} attempts. Last error:`, lastError);
        throw new Error(`Neon database connection failed after ${retries} attempts: ${lastError.message}`);
      }
      
      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, i) + Math.random() * 1000;
      console.log(`[DB NEON] Retrying in ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Enhanced health check specifically for Neon
export const healthCheck = async (): Promise<{ 
  healthy: boolean; 
  latency?: number; 
  error?: string;
  connection?: string;
}> => {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1 as health_check`;
    const latency = Date.now() - start;
    
    return { 
      healthy: true, 
      latency,
      connection: "neon-pooled"
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("[DB NEON] Health check failed:", errorMessage);
    
    return { 
      healthy: false, 
      error: errorMessage,
      connection: "failed"
    };
  }
};

// Optimized query helper with Neon-specific error handling for serverless
export const executeQuery = async <T>(
  queryFn: () => Promise<T>,
  operation: string,
  retries = 4
): Promise<T> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const start = Date.now();
    try {
      const result = await queryFn();
      const duration = Date.now() - start;
      
      if (duration > 1000) {
        console.warn(`[DB NEON] Slow ${operation}: ${duration}ms`);
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error(`[DB ERROR] ${operation} failed after ${duration}ms (attempt ${attempt}/${retries}):`, error);
      
      // Retry on connection issues with exponential backoff
      if (attempt < retries && (
        errorMessage.includes("Can't reach database server") ||
        errorMessage.includes("connection pool") ||
        errorMessage.includes("timeout") ||
        errorMessage.includes("Connection terminated") ||
        errorMessage.includes("Connection closed")
      )) {
        // Exponential backoff with jitter for serverless: 100ms, 200ms, 400ms, 800ms
        const baseDelay = 100 * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 100; // Add random jitter to avoid thundering herd
        const delay = Math.min(baseDelay + jitter, 1000); // Cap at 1 second
        
        console.log(`[DB NEON] Connection pool issue - retrying with backoff`);
        console.log(`[DB NEON] Retrying connection in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw new Error(`Failed to execute ${operation} after ${retries} attempts`);
};

// Session table health check for Shopify app
export const checkSessionTable = async (): Promise<boolean> => {
  try {
    await prisma.session.count();
    console.log("[DB NEON] Session table is accessible");
    return true;
  } catch (error) {
    console.error("[DB NEON] Session table check failed:", error);
    return false;
  }
};

// Enhanced graceful shutdown handling
const gracefulShutdown = async () => {
  console.log("[DB NEON] Graceful shutdown initiated...");
  try {
    await prisma.$disconnect();
    console.log("[DB NEON] Database connection closed gracefully");
  } catch (error) {
    console.error("[DB NEON] Error during graceful shutdown:", error);
  }
};

// Enhanced process event handling (Node.js only)
if (typeof globalThis !== 'undefined' && 'process' in globalThis) {
  const nodeProcess = globalThis.process as any;
  nodeProcess.on?.('SIGINT', gracefulShutdown);
  nodeProcess.on?.('SIGTERM', gracefulShutdown);
  nodeProcess.on?.('beforeExit', gracefulShutdown);
  
  // Handle unhandled database errors
  nodeProcess.on?.('unhandledRejection', (reason: any, promise: any) => {
    if (reason && typeof reason === 'object' && 'code' in reason) {
      if (reason.code === 'P1001') {
        console.error("[DB NEON] Connection error detected in unhandled rejection");
      }
    }
  });
}

export default prisma;
