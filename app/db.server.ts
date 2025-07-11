import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

// Enhanced configuration for Neon serverless with improved connection management
const createPrismaClient = () => {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // Enhanced Neon connection configuration with better pooling
  let connectionUrl = databaseUrl;
  
  // Ensure connection pooling parameters for Neon (optimized for serverless)
  if (!connectionUrl.includes('pgbouncer=true')) {
    const separator = connectionUrl.includes('?') ? '&' : '?';
    connectionUrl += `${separator}pgbouncer=true&connection_limit=2&connect_timeout=60&pool_timeout=60&idle_timeout=30&max_lifetime=300`;
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    datasources: {
      db: {
        url: connectionUrl,
      },
    },
    errorFormat: 'minimal',
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

// Enhanced middleware with better error handling and connection management
prisma.$use(async (params: any, next: any) => {
  const start = Date.now();
  let retries = 0;
  const maxRetries = 3;
  
  while (retries <= maxRetries) {
  try {
    const result = await next(params);
    const duration = Date.now() - start;
    
    if (process.env.NODE_ENV !== "production" || duration > 2000) {
      console.log(`[DB PERF] Query ${params.model}.${params.action} took ${duration}ms`);
      
      if (duration > 5000) {
        console.warn(`[DB WARNING] Slow query detected: ${params.model}.${params.action} (${duration}ms)`);
      }
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
      console.error(`[DB ERROR] ${params.model}.${params.action} failed after ${duration}ms (attempt ${retries + 1}/${maxRetries + 1}):`, error);
    
    // Enhanced error logging for Neon connection issues
    if (error instanceof Error) {
      if (error.message.includes("Can't reach database server")) {
        console.error("[DB NEON] Database server unreachable - check Neon instance status");
      } else if (error.message.includes("connection pool")) {
        console.error("[DB NEON] Connection pool issue - retrying with backoff");
        } else if (error.message.includes("connection") && error.message.includes("closed")) {
          console.error("[DB NEON] Connection closed unexpectedly - attempting reconnection");
  }
      }
      
      // Retry logic for connection-related errors
      if (retries < maxRetries && error instanceof Error) {
        const isConnectionError = 
          error.message.includes("connection") ||
          error.message.includes("pool") ||
          error.message.includes("timeout") ||
          error.message.includes("closed");
        
        if (isConnectionError) {
          retries++;
          const delay = Math.pow(2, retries) * 1000 + Math.random() * 1000;
          console.log(`[DB NEON] Retrying connection in ${Math.round(delay)}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
  }
}
      
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

// Optimized query helper with Neon-specific error handling
export const executeQuery = async <T>(
  queryFn: () => Promise<T>,
  operation: string,
  retries = 3
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
      
      console.error(`[DB NEON] ${operation} failed (attempt ${attempt}/${retries}) after ${duration}ms:`, errorMessage);
      
      // Retry on connection issues
      if (attempt < retries && (
        errorMessage.includes("Can't reach database server") ||
        errorMessage.includes("connection pool") ||
        errorMessage.includes("timeout")
      )) {
        const delay = 1000 * attempt;
        console.log(`[DB NEON] Retrying ${operation} in ${delay}ms...`);
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
