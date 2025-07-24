import PQueue from "p-queue";

// Create a queue that allows up to 8 concurrent DB writes, leaving 2 connections for reads
const writeQueue = new PQueue({ concurrency: 8 });

export function queuedWrite<T>(fn: () => Promise<T>): Promise<T> {
  return writeQueue.add(async () => await fn()) as Promise<T>;
}

// Optional helper for common CRUD patterns
export const db = {
  create: <T>(cb: () => Promise<T>) => queuedWrite(cb),
  update: <T>(cb: () => Promise<T>) => queuedWrite(cb),
  delete: <T>(cb: () => Promise<T>) => queuedWrite(cb),
  transaction: <T>(cb: () => Promise<T>) => queuedWrite(cb),
};

// Singleton Redis client pattern (example, adjust if not using Redis)
let redisClient: any;

export function getRedisClient() {
  if (!redisClient) {
    // Replace with actual Redis client initialization
    // Example: redisClient = new Redis(process.env.REDIS_URL);
    redisClient = {};
  }
  return redisClient;
}

export default writeQueue;
