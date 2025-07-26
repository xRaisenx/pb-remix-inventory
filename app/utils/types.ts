/**
 * Type definitions and utilities for Planet Beauty Inventory AI
 * Helps resolve TypeScript errors and provides consistent typing
 */

// Prisma-related types
export type PrismaTransaction = any; // For transaction parameters
export type PrismaMiddlewareParams = any; // For middleware parameters

// Product-related types
export interface ProductWithVariants {
  id: string;
  title: string;
  status?: string;
  variants: Array<{
    price?: number;
    sku?: string;
  }>;
}

// Function parameter types
export type FilterFunction<T = any> = (item: T) => boolean;
export type ReduceFunction<T = any, U = any> = (accumulator: U, current: T) => U;
export type MapFunction<T = any, U = any> = (item: T) => U;
export type ForEachFunction<T = any> = (item: T) => void;

// AI Service types
export interface AIEntity {
  productNames: string[];
  quantities: number[];
  timeframes: string[];
  categories: string[];
  priorities: string[];
}

// Error handling types
export interface ErrorResponse {
  errors?: string[];
  message?: string;
  status?: number;
}

// Utility function to safely access nested properties
export function safeGet<T>(obj: any, path: string, defaultValue: T): T {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : defaultValue;
  }, obj);
}

// Utility function to safely access errors property
export function getErrors(data: any): string[] | undefined {
  if (data && typeof data === 'object') {
    if ('errors' in data && Array.isArray(data.errors)) {
      return data.errors;
    }
    if ('error' in data && typeof data.error === 'string') {
      return [data.error];
    }
  }
  return undefined;
} 