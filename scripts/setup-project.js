#!/usr/bin/env node

/**
 * Comprehensive Project Setup Script for Planet Beauty Shopify Remix App
 * Ensures all dependencies, database, and configurations are properly set up
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import fs from 'fs';
import _path from 'path';

const prisma = new PrismaClient();

// Setup configuration
const SETUP_CONFIG = {
  requiredEnvVars: [
    'DATABASE_URL',
    'SHOPIFY_API_KEY',
    'SHOPIFY_API_SECRET',
    'SHOPIFY_APP_URL',
    'GOOGLE_AI_API_KEY'
  ],
  optionalEnvVars: [
    'NODE_ENV',
    'SESSION_SECRET',
    'SHOPIFY_SCOPES'
  ]
};

// Setup state tracking
const setupState = {
  step: 0,
  totalSteps: 8,
  errors: [],
  warnings: [],
  startTime: Date.now()
};

// Utility functions
const log = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔄';
  console.log(`${timestamp} ${prefix} ${message}`);
};

const runCommand = (command, options = {}) => {
  try {
    const result = execSync(command, { 
      encoding: 'utf8', 
      stdio: 'pipe',
      timeout: options.timeout || 60000,
      ...options
    });
    return { success: true, output: result };
  } catch (error) {
    return { success: false, output: error.message, code: error.status };
  }
};

const checkEnvironmentVariables = () => {
  log('🔍 Checking environment variables...', 'info');
  
  const missing = [];
  const warnings = [];
  
  SETUP_CONFIG.requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  });
  
  SETUP_CONFIG.optionalEnvVars.forEach(varName => {
    if (!process.env[varName]) {
      warnings.push(varName);
    }
  });
  
  if (missing.length > 0) {
    log(`Missing required environment variables: ${missing.join(', ')}`, 'error');
    setupState.errors.push(`Missing required environment variables: ${missing.join(', ')}`);
    return false;
  }
  
  if (warnings.length > 0) {
    log(`Missing optional environment variables: ${warnings.join(', ')}`, 'warning');
    setupState.warnings.push(`Missing optional environment variables: ${warnings.join(', ')}`);
  }
  
  log('Environment variables validated', 'success');
  return true;
};

const installDependencies = () => {
  log('📦 Installing dependencies...', 'info');
  
  const result = runCommand('npm install', { timeout: 300000 });
  
  if (!result.success) {
    log(`Failed to install dependencies: ${result.output}`, 'error');
    setupState.errors.push(`Failed to install dependencies: ${result.output}`);
    return false;
  }
  
  log('Dependencies installed successfully', 'success');
  return true;
};

const setupDatabase = async () => {
  log('🗄️ Setting up database...', 'info');
  
  try {
    // Generate Prisma client
    const generateResult = runCommand('npx prisma generate');
    if (!generateResult.success) {
      throw new Error(`Prisma generate failed: ${generateResult.output}`);
    }
    
    // Run migrations
    const migrateResult = runCommand('npx prisma migrate deploy');
    if (!migrateResult.success) {
      throw new Error(`Prisma migrate failed: ${migrateResult.output}`);
    }
    
    // Test database connection
    await prisma.$queryRaw`SELECT 1 as test`;
    
    // Create indexes if needed
    const indexResult = runCommand('node scripts/add-session-indexes.js');
    if (!indexResult.success) {
      log(`Warning: Failed to create indexes: ${indexResult.output}`, 'warning');
      setupState.warnings.push(`Failed to create indexes: ${indexResult.output}`);
    }
    
    log('Database setup completed', 'success');
    return true;
  } catch (error) {
    log(`Database setup failed: ${error.message}`, 'error');
    setupState.errors.push(`Database setup failed: ${error.message}`);
    return false;
  }
};

const validatePrismaSchema = () => {
  log('🔧 Validating Prisma schema...', 'info');
  
  const result = runCommand('npx prisma validate');
  
  if (!result.success) {
    log(`Prisma schema validation failed: ${result.output}`, 'error');
    setupState.errors.push(`Prisma schema validation failed: ${result.output}`);
    return false;
  }
  
  log('Prisma schema validated', 'success');
  return true;
};

const checkTypeScript = () => {
  log('📝 Checking TypeScript compilation...', 'info');
  
  const result = runCommand('npx tsc --noEmit');
  
  if (!result.success) {
    log(`TypeScript compilation failed: ${result.output}`, 'error');
    setupState.errors.push(`TypeScript compilation failed: ${result.output}`);
    return false;
  }
  
  log('TypeScript compilation validated', 'success');
  return true;
};

const runLinting = () => {
  log('🔍 Running linting...', 'info');
  
  const result = runCommand('npm run lint');
  
  if (!result.success) {
    log(`Linting failed: ${result.output}`, 'warning');
    setupState.warnings.push(`Linting issues found: ${result.output}`);
    // Don't fail the setup for linting issues
  } else {
    log('Linting passed', 'success');
  }
  
  return true;
};

const testBuild = () => {
  log('🏗️ Testing build process...', 'info');
  
  const result = runCommand('npm run build', { timeout: 300000 });
  
  if (!result.success) {
    log(`Build failed: ${result.output}`, 'error');
    setupState.errors.push(`Build failed: ${result.output}`);
    return false;
  }
  
  log('Build test passed', 'success');
  return true;
};

const createEnvironmentTemplate = () => {
  log('📄 Creating environment template...', 'info');
  
  const envTemplate = `# Shopify App Configuration
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
SHOPIFY_APP_URL=https://your-app-url.vercel.app

# Database Configuration (Neon PostgreSQL)
DATABASE_URL=postgresql://username:password@host:port/database?sslmode=require

# AI Configuration
GOOGLE_AI_API_KEY=your_google_ai_api_key_here

# Optional Configuration
NODE_ENV=production
SESSION_SECRET=your_session_secret_here
SHOPIFY_SCOPES=write_products,read_products,write_inventory,read_inventory,read_locations,read_orders

# Vercel Configuration
VERCEL_PROJECT_ID=your_vercel_project_id
VERCEL_ORG_ID=your_vercel_org_id
`;

  if (!fs.existsSync('.env.example')) {
    fs.writeFileSync('.env.example', envTemplate);
    log('Environment template created (.env.example)', 'success');
  } else {
    log('Environment template already exists', 'info');
  }
  
  return true;
};

const generateSetupReport = () => {
  const duration = Date.now() - setupState.startTime;
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 PROJECT SETUP COMPLETION REPORT');
  console.log('='.repeat(80));
  console.log(`Setup Duration: ${duration}ms`);
  console.log(`Steps Completed: ${setupState.step}/${setupState.totalSteps}`);
  
  if (setupState.errors.length > 0) {
    console.log('\n❌ ERRORS ENCOUNTERED:');
    setupState.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error}`);
    });
  }
  
  if (setupState.warnings.length > 0) {
    console.log('\n⚠️ WARNINGS:');
    setupState.warnings.forEach((warning, index) => {
      console.log(`  ${index + 1}. ${warning}`);
    });
  }
  
  if (setupState.errors.length === 0) {
    console.log('\n✅ SETUP COMPLETED SUCCESSFULLY!');
    console.log('\n🚀 Next steps:');
    console.log('  1. Configure your environment variables in .env');
    console.log('  2. Deploy to Vercel: npm run deploy');
    console.log('  3. Install the app in your Shopify store');
    console.log('  4. Run tests: npm run test:full');
  } else {
    console.log('\n❌ SETUP FAILED - Please fix the errors above');
  }
  
  console.log('\n' + '='.repeat(80));
  
  // Save setup report
  const report = {
    timestamp: new Date().toISOString(),
    duration,
    stepsCompleted: setupState.step,
    totalSteps: setupState.totalSteps,
    errors: setupState.errors,
    warnings: setupState.warnings,
    success: setupState.errors.length === 0
  };
  
  fs.writeFileSync('setup-report.json', JSON.stringify(report, null, 2));
  console.log('📄 Setup report saved to setup-report.json');
  
  return setupState.errors.length === 0;
};

// Main setup execution
const runSetup = async () => {
  log('🚀 Starting comprehensive project setup for Planet Beauty Shopify App', 'info');
  
  // Step 1: Check environment variables
  setupState.step++;
  if (!checkEnvironmentVariables()) {
    generateSetupReport();
    process.exit(1);
  }
  
  // Step 2: Install dependencies
  setupState.step++;
  if (!installDependencies()) {
    generateSetupReport();
    process.exit(1);
  }
  
  // Step 3: Validate Prisma schema
  setupState.step++;
  if (!validatePrismaSchema()) {
    generateSetupReport();
    process.exit(1);
  }
  
  // Step 4: Setup database
  setupState.step++;
  if (!await setupDatabase()) {
    generateSetupReport();
    process.exit(1);
  }
  
  // Step 5: Check TypeScript
  setupState.step++;
  if (!checkTypeScript()) {
    generateSetupReport();
    process.exit(1);
  }
  
  // Step 6: Run linting
  setupState.step++;
  runLinting();
  
  // Step 7: Test build
  setupState.step++;
  if (!testBuild()) {
    generateSetupReport();
    process.exit(1);
  }
  
  // Step 8: Create environment template
  setupState.step++;
  createEnvironmentTemplate();
  
  // Generate final report
  const success = generateSetupReport();
  
  // Cleanup
  await prisma.$disconnect();
  
  process.exit(success ? 0 : 1);
};

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled Rejection at: ${promise}, reason: ${reason}`, 'error');
  setupState.errors.push(`Unhandled Rejection: ${reason}`);
  generateSetupReport();
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  log(`Uncaught Exception: ${error.message}`, 'error');
  setupState.errors.push(`Uncaught Exception: ${error.message}`);
  generateSetupReport();
  process.exit(1);
});

// Run setup
runSetup().catch(error => {
  log(`Setup failed to start: ${error.message}`, 'error');
  setupState.errors.push(`Setup failed to start: ${error.message}`);
  generateSetupReport();
  process.exit(1);
});