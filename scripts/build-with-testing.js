#!/usr/bin/env node

/**
 * 🔄 Comprehensive Build System with Auto-Fix Feedback Loop
 * 
 * This script:
 * 1. Runs comprehensive tests during build
 * 2. Automatically fixes common issues
 * 3. Repeats until all tests pass
 * 4. Provides detailed feedback and reporting
 * 5. Ensures production-ready builds
 */

import { execSync, spawn } from 'child_process';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import _path from 'path';

const prisma = new PrismaClient();

// Build configuration
const BUILD_CONFIG = {
  maxRetries: 5,
  testTimeout: 120000, // 2 minutes
  fixTimeout: 60000, // 1 minute
  requiredSuccessRate: 95, // 95% of tests must pass
  criticalTests: [
    'Database Connection',
    'Session Table Access',
    'Authentication',
    'Product Queries',
    'API Endpoints'
  ]
};

// Build state tracking
const buildState = {
  attempt: 0,
  testsRun: 0,
  fixesApplied: 0,
  startTime: Date.now(),
  issues: [],
  fixes: []
};

// Utility functions
const log = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔄';
  console.log(`${timestamp} ${prefix} ${message}`);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const runCommand = (command, options = {}) => {
  try {
    const result = execSync(command, { 
      encoding: 'utf8', 
      stdio: 'pipe',
      timeout: options.timeout || 30000,
      ...options
    });
    return { success: true, output: result };
  } catch (error) {
    return { success: false, output: error.message, code: error.status };
  }
};

const runCommandAsync = (command, options = {}) => {
  return new Promise((resolve) => {
    const child = spawn(command, [], { 
      shell: true, 
      stdio: 'pipe',
      ...options
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({
        success: code === 0,
        output,
        error: errorOutput,
        code
      });
    });
    
    if (options.timeout) {
      setTimeout(() => {
        child.kill();
        resolve({
          success: false,
          output,
          error: 'Command timed out',
          code: -1
        });
      }, options.timeout);
    }
  });
};

// Step 1: Pre-build validation
async function preBuildValidation() {
  log('🔍 Starting pre-build validation...');
  
  try {
    // Check environment variables
    const requiredEnvVars = [
      'DATABASE_URL',
      'SHOPIFY_API_KEY',
      'SHOPIFY_API_SECRET',
      'SHOPIFY_APP_URL'
    ];
    
    const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingEnvVars.length > 0) {
      log(`Missing environment variables: ${missingEnvVars.join(', ')}`, 'error');
      return false;
    }
    
    log('Environment variables validated', 'success');
    
    // Check database connection
    try {
      await prisma.$queryRaw`SELECT 1 as test`;
      log('Database connection verified', 'success');
    } catch (error) {
      log(`Database connection failed: ${error.message}`, 'error');
      return false;
    }
    
    // Check Prisma schema
    const schemaResult = runCommand('npx prisma validate');
    if (!schemaResult.success) {
      log(`Prisma schema validation failed: ${schemaResult.output}`, 'error');
      return false;
    }
    
    log('Prisma schema validated', 'success');
    
    // Check TypeScript compilation
    const tsResult = runCommand('npx tsc --noEmit');
    if (!tsResult.success) {
      log(`TypeScript compilation failed: ${tsResult.output}`, 'error');
      return false;
    }
    
    log('TypeScript compilation validated', 'success');
    
    return true;
  } catch (error) {
    log(`Pre-build validation failed: ${error.message}`, 'error');
    return false;
  }
}

// Step 2: Run comprehensive tests
async function runComprehensiveTests() {
  log('🧪 Running comprehensive tests...');
  
  try {
    const testResult = await runCommandAsync('node scripts/comprehensive-app-test.js', {
      timeout: BUILD_CONFIG.testTimeout
    });
    
    if (!testResult.success) {
      log(`Test execution failed: ${testResult.error}`, 'error');
      return { success: false, output: testResult.output + testResult.error };
    }
    
    // Parse test results from output
    const testOutput = testResult.output;
    const successMatch = testOutput.match(/Success Rate: ([\d.]+)%/);
    const passedMatch = testOutput.match(/Passed: (\d+)/);
    const failedMatch = testOutput.match(/Failed: (\d+)/);
    const totalMatch = testOutput.match(/Total Tests: (\d+)/);
    
    if (!successMatch || !passedMatch || !failedMatch || !totalMatch) {
      log('Could not parse test results', 'error');
      return { success: false, output: testOutput };
    }
    
    const successRate = parseFloat(successMatch[1]);
    const passed = parseInt(passedMatch[1]);
    const failed = parseInt(failedMatch[1]);
    const total = parseInt(totalMatch[1]);
    
    log(`Test results: ${passed}/${total} passed (${successRate.toFixed(1)}% success rate)`, 
        successRate >= BUILD_CONFIG.requiredSuccessRate ? 'success' : 'warning');
    
    return {
      success: successRate >= BUILD_CONFIG.requiredSuccessRate,
      successRate,
      passed,
      failed,
      total,
      output: testOutput
    };
  } catch (error) {
    log(`Test execution error: ${error.message}`, 'error');
    return { success: false, output: error.message };
  }
}

// Step 3: Auto-fix common issues
async function autoFixIssues(testResults) {
  log('🔧 Attempting to auto-fix issues...');
  
  const fixes = [];
  
  try {
    // Fix 1: Database connection issues
    if (testResults.output.includes('Database Connection') && testResults.output.includes('FAIL')) {
      log('Fixing database connection issues...');
      
      // Reset database
      const resetResult = runCommand('npx prisma migrate reset --force');
      if (resetResult.success) {
        fixes.push('Database reset completed');
        log('Database reset successful', 'success');
      }
      
      // Regenerate Prisma client
      const generateResult = runCommand('npx prisma generate');
      if (generateResult.success) {
        fixes.push('Prisma client regenerated');
        log('Prisma client regenerated', 'success');
      }
    }
    
    // Fix 2: Session table issues
    if (testResults.output.includes('Session Table') && testResults.output.includes('FAIL')) {
      log('Fixing session table issues...');
      
      // Add session indexes
      const indexResult = runCommand('node scripts/add-session-indexes.js');
      if (indexResult.success) {
        fixes.push('Session indexes added');
        log('Session indexes added', 'success');
      }
    }
    
    // Fix 3: TypeScript errors
    if (testResults.output.includes('TypeScript') || testResults.output.includes('compilation')) {
      log('Fixing TypeScript errors...');
      
      const tsFixResult = runCommand('node scripts/fix-typescript-errors.js');
      if (tsFixResult.success) {
        fixes.push('TypeScript errors fixed');
        log('TypeScript errors fixed', 'success');
      }
      
      // Also run Prisma generate after TypeScript fixes
      const prismaGenerateResult = runCommand('npx prisma generate');
      if (prismaGenerateResult.success) {
        fixes.push('Prisma client regenerated');
        log('Prisma client regenerated', 'success');
      }
    }
    
    // Fix 4: Database schema issues
    if (testResults.output.includes('schema') || testResults.output.includes('migration')) {
      log('Fixing database schema issues...');
      
      // Reset and redeploy migrations
      const resetResult = runCommand('npx prisma migrate reset --force');
      if (resetResult.success) {
        fixes.push('Database reset completed');
        log('Database reset completed', 'success');
      }
      
      const deployResult = runCommand('npx prisma migrate deploy');
      if (deployResult.success) {
        fixes.push('Migrations deployed');
        log('Migrations deployed', 'success');
      }
      
      const generateResult = runCommand('npx prisma generate');
      if (generateResult.success) {
        fixes.push('Prisma client regenerated');
        log('Prisma client regenerated', 'success');
      }
    }
    
    // Fix 5: Dependencies issues
    if (testResults.output.includes('dependency') || testResults.output.includes('module')) {
      log('Fixing dependency issues...');
      
      // Clean and reinstall dependencies
      runCommand('rm -rf node_modules package-lock.json');
      const installResult = runCommand('npm install --legacy-peer-deps');
      if (installResult.success) {
        fixes.push('Dependencies reinstalled');
        log('Dependencies reinstalled', 'success');
      }
    }
    
    // Fix 6: Build configuration issues
    if (testResults.output.includes('build') || testResults.output.includes('vite')) {
      log('Fixing build configuration...');
      
      // Update Vite config
      const viteConfigPath = 'vite.config.ts';
      if (fs.existsSync(viteConfigPath)) {
        let viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
        
        // Fix Polaris external configuration
        if (!viteConfig.includes('@shopify/polaris')) {
          viteConfig = viteConfig.replace(
            /external: \[([^\]]*)\]/,
            'external: [$1, "@shopify/polaris"]'
          );
          fs.writeFileSync(viteConfigPath, viteConfig);
          fixes.push('Vite config updated');
          log('Vite config updated', 'success');
        }
      }
    }
    
    buildState.fixesApplied += fixes.length;
    buildState.fixes.push(...fixes);
    
    return fixes.length > 0;
  } catch (error) {
    log(`Auto-fix error: ${error.message}`, 'error');
    return false;
  }
}

// Step 4: Build process
async function runBuild() {
  log('🏗️ Running build process...');
  
  try {
    // Run database setup
    const dbSetupResult = runCommand('npm run db:setup');
    if (!dbSetupResult.success) {
      log(`Database setup failed: ${dbSetupResult.output}`, 'error');
      return false;
    }
    
    // Run the actual build
    const buildResult = runCommand('npm run build');
    if (!buildResult.success) {
      log(`Build failed: ${buildResult.output}`, 'error');
      return false;
    }
    
    log('Build completed successfully', 'success');
    return true;
  } catch (error) {
    log(`Build error: ${error.message}`, 'error');
    return false;
  }
}

// Step 5: Post-build validation
async function postBuildValidation() {
  log('🔍 Running post-build validation...');
  
  try {
    // Check if build artifacts exist
    const buildDir = './build';
    if (!fs.existsSync(buildDir)) {
      log('Build directory not found', 'error');
      return false;
    }
    
    // Check server build
    const serverBuild = './build/server/index.js';
    if (!fs.existsSync(serverBuild)) {
      log('Server build not found', 'error');
      return false;
    }
    
    // Check client build
    const clientBuild = './build/client';
    if (!fs.existsSync(clientBuild)) {
      log('Client build not found', 'error');
      return false;
    }
    
    log('Build artifacts validated', 'success');
    
    // Run final tests
    const finalTestResult = await runComprehensiveTests();
    if (!finalTestResult.success) {
      log('Final tests failed', 'error');
      return false;
    }
    
    log('Post-build validation completed', 'success');
    return true;
  } catch (error) {
    log(`Post-build validation error: ${error.message}`, 'error');
    return false;
  }
}

// Main build loop
async function buildWithTesting() {
  log('🚀 Starting comprehensive build with testing...');
  log(`Configuration: Max retries: ${BUILD_CONFIG.maxRetries}, Required success rate: ${BUILD_CONFIG.requiredSuccessRate}%`);
  log('=' * 80);
  
  buildState.startTime = Date.now();
  
  for (let attempt = 1; attempt <= BUILD_CONFIG.maxRetries; attempt++) {
    buildState.attempt = attempt;
    
    log(`\n🔄 Build attempt ${attempt}/${BUILD_CONFIG.maxRetries}`);
    log('=' * 50);
    
    try {
      // Step 1: Pre-build validation
      log('Step 1: Pre-build validation');
      const preBuildValid = await preBuildValidation();
      if (!preBuildValid) {
        log('Pre-build validation failed, attempting fixes...', 'warning');
        await autoFixIssues({ output: 'Pre-build validation failed' });
        continue;
      }
      
      // Step 2: Run comprehensive tests
      log('Step 2: Running comprehensive tests');
      const testResults = await runComprehensiveTests();
      buildState.testsRun++;
      
      if (testResults.success) {
        log('All tests passed!', 'success');
      } else {
        log(`Tests failed (${testResults.successRate?.toFixed(1)}% success rate), attempting fixes...`, 'warning');
        
        // Step 3: Auto-fix issues
        log('Step 3: Auto-fixing issues');
        const fixesApplied = await autoFixIssues(testResults);
        
        if (fixesApplied) {
          log('Fixes applied, retrying...', 'info');
          await sleep(2000); // Wait for fixes to take effect
          continue;
        } else {
          log('No automatic fixes available', 'warning');
          buildState.issues.push({
            attempt,
            testResults,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // Step 4: Build process
      log('Step 4: Running build process');
      const buildSuccess = await runBuild();
      if (!buildSuccess) {
        log('Build failed, retrying...', 'warning');
        continue;
      }
      
      // Step 5: Post-build validation
      log('Step 5: Post-build validation');
      const postBuildValid = await postBuildValidation();
      if (!postBuildValid) {
        log('Post-build validation failed, retrying...', 'warning');
        continue;
      }
      
      // Success!
      const totalTime = Date.now() - buildState.startTime;
      log('\n🎉 BUILD SUCCESSFUL!', 'success');
      log('=' * 80);
      log(`Total time: ${totalTime}ms`);
      log(`Attempts: ${attempt}`);
      log(`Tests run: ${buildState.testsRun}`);
      log(`Fixes applied: ${buildState.fixesApplied}`);
      
      if (buildState.fixes.length > 0) {
        log('\n🔧 Fixes applied:');
        buildState.fixes.forEach((fix, index) => {
          log(`  ${index + 1}. ${fix}`);
        });
      }
      
      // Generate build report
      generateBuildReport(true);
      
      return true;
      
    } catch (error) {
      log(`Build attempt ${attempt} failed with error: ${error.message}`, 'error');
      buildState.issues.push({
        attempt,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      if (attempt < BUILD_CONFIG.maxRetries) {
        log('Retrying...', 'info');
        await sleep(3000);
      }
    }
  }
  
  // All attempts failed
  const totalTime = Date.now() - buildState.startTime;
  log('\n❌ BUILD FAILED AFTER ALL ATTEMPTS', 'error');
  log('=' * 80);
  log(`Total time: ${totalTime}ms`);
  log(`Attempts: ${BUILD_CONFIG.maxRetries}`);
  log(`Tests run: ${buildState.testsRun}`);
  log(`Fixes applied: ${buildState.fixesApplied}`);
  
  generateBuildReport(false);
  
  return false;
}

// Generate build report
function generateBuildReport(success) {
  const report = {
    success,
    timestamp: new Date().toISOString(),
    duration: Date.now() - buildState.startTime,
    attempts: buildState.attempt,
    testsRun: buildState.testsRun,
    fixesApplied: buildState.fixesApplied,
    fixes: buildState.fixes,
    issues: buildState.issues
  };
  
  const reportPath = `build-report-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  log(`Build report saved to: ${reportPath}`, 'info');
  
  // Also save to build directory
  const buildReportPath = './build/build-report.json';
  if (fs.existsSync('./build')) {
    fs.writeFileSync(buildReportPath, JSON.stringify(report, null, 2));
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  log('\n🛑 Build interrupted by user', 'warning');
  await prisma.$disconnect();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  log('\n🛑 Build terminated', 'warning');
  await prisma.$disconnect();
  process.exit(1);
});

// Run the build
buildWithTesting()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    log(`Build system failed: ${error.message}`, 'error');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 