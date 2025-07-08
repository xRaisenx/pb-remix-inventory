import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

// Enhanced configuration for serverless environments with connection pooling
const createPrismaClient = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL, // Uses pooled connection from Neon
      },
    },
    // Optimize for serverless environments
    errorFormat: 'minimal',
  });
};

// Connection pooling strategy for serverless
const prisma = global.prisma || createPrismaClient();

// Enhanced query timing and performance monitoring middleware
prisma.$use(async (params: Prisma.MiddlewareParams, next: (params: Prisma.MiddlewareParams) => Promise<unknown>) => {
  const start = Date.now();
  const result = await next(params);
  const duration = Date.now() - start;
  
  // Performance monitoring and alerts
  if (process.env.NODE_ENV !== "production" || duration > 2000) {
    console.log(`[DB PERF] Query ${params.model}.${params.action} took ${duration}ms`);
    
    // Alert for slow queries in production
    if (duration > 5000) {
      console.warn(`[DB WARNING] Slow query detected: ${params.model}.${params.action} (${duration}ms)`);
    }
  }
  
  return result;
});

// Connection pooling optimization for Vercel/Neon
if (process.env.NODE_ENV !== "production") {
  if (!global.prisma) {
    global.prisma = prisma;
  }
}

// Enhanced connection management with pooling
export const connectWithRetry = async (retries = 3, delay = 500): Promise<void> => {
  for (let i = 0; i < retries; i++) {
    try {
      // Test connection with lightweight query
      await prisma.$queryRaw`SELECT 1`;
      console.log(`[DB] Connected successfully (attempt ${i + 1})`);
      return;
    } catch (error) {
      console.error(`[DB] Connection attempt ${i + 1} failed:`, error);
      if (i === retries - 1) {
        throw new Error(`Failed to connect to database after ${retries} attempts`);
      }
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

// Connection health check for monitoring
export const healthCheck = async (): Promise<{ healthy: boolean; latency?: number; error?: string }> => {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    return { healthy: true, latency };
  } catch (error) {
    return { 
      healthy: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};

// Optimized query helper for better performance
export const executeQuery = async <T>(
  queryFn: () => Promise<T>,
  operation: string
): Promise<T> => {
  const start = Date.now();
  try {
    const result = await queryFn();
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      console.warn(`[DB PERF] Slow ${operation}: ${duration}ms`);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`[DB ERROR] ${operation} failed after ${duration}ms:`, error);
    throw error;
  }
};

// Graceful shutdown with connection cleanup
const gracefulShutdown = async () => {
  try {
    await prisma.$disconnect();
    console.log("[DB] Disconnected gracefully");
  } catch (error) {
    console.error("[DB] Error during shutdown:", error);
  }
};

// Serverless environment doesn't always trigger these events
if (typeof process !== 'undefined') {
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
  process.on('beforeExit', gracefulShutdown);
}

export default prisma;
