/**
 * DATABASE SERVER MODULE
 * 
 * This module provides the enhanced database functionality by importing
 * from the lib/database module which extends the boilerplate.
 * 
 * This approach keeps the boilerplate clean while providing enhanced features.
 */

// Import the enhanced database module
export { 
  default,
  connectWithRetry,
  healthCheck,
  executeQuery,
  checkSessionTable
} from "./lib/database";
