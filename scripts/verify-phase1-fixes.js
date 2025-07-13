#!/usr/bin/env node
/**
 * Phase 1 Fixes Verification Script
 * 
 * This script verifies that all Phase 1 fixes are working correctly.
 * It tests the core build, lint, and type checking processes.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🔍 Phase 1 Fixes Verification');
console.log('============================\n');

const runCommand = (command, description) => {
  console.log(`🧪 Testing: ${description}`);
  console.log(`📝 Command: ${command}`);
  
  try {
    const start = Date.now();
    const result = execSync(command, { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    const duration = Date.now() - start;
    
    console.log(`✅ SUCCESS (${duration}ms)`);
    console.log(`📊 Output summary: ${result.split('\n').length} lines`);
    console.log('');
    
    return { success: true, duration, output: result };
  } catch (error) {
    console.log(`❌ FAILED`);
    console.log(`💥 Error: ${error.message.split('\n')[0]}`);
    console.log('');
    
    return { success: false, error: error.message };
  }
};

const checkFileExists = (filePath, description) => {
  console.log(`🔍 Checking: ${description}`);
  console.log(`📁 Path: ${filePath}`);
  
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    console.log(`✅ EXISTS (${stats.isDirectory() ? 'directory' : 'file'})`);
    console.log('');
    return true;
  } else {
    console.log(`❌ NOT FOUND`);
    console.log('');
    return false;
  }
};

const main = async () => {
  const results = [];
  
  // Test 1: Dependencies Installation
  console.log('1️⃣ DEPENDENCY RESOLUTION TEST');
  console.log('──────────────────────────────');
  
  // Check if node_modules exists
  const nodeModulesExists = checkFileExists('node_modules', 'Node modules directory');
  const packageLockExists = checkFileExists('package-lock.json', 'Package lock file');
  
  results.push({
    test: 'Dependencies Installed',
    success: nodeModulesExists && packageLockExists,
    details: 'Node modules and package-lock.json present'
  });
  
  // Test 2: TypeScript Compilation
  console.log('2️⃣ TYPESCRIPT COMPILATION TEST');
  console.log('──────────────────────────────');
  
  const typeCheck = runCommand('npm run type-check', 'TypeScript type checking');
  results.push({
    test: 'TypeScript Compilation',
    success: typeCheck.success,
    details: typeCheck.success ? 'No type errors' : 'Type errors present'
  });
  
  // Test 3: Linting
  console.log('3️⃣ LINTING TEST');
  console.log('──────────────────────────────');
  
  const lint = runCommand('npm run lint', 'ESLint code checking');
  results.push({
    test: 'Linting',
    success: lint.success,
    details: lint.success ? 'No linting errors' : 'Linting errors present'
  });
  
  // Test 4: Build Process
  console.log('4️⃣ BUILD PROCESS TEST');
  console.log('──────────────────────────────');
  
  const build = runCommand('npm run build', 'Production build');
  results.push({
    test: 'Build Process',
    success: build.success,
    details: build.success ? 'Build successful' : 'Build failed'
  });
  
  // Check build artifacts
  if (build.success) {
    const buildDirExists = checkFileExists('build', 'Build directory');
    const clientBuildExists = checkFileExists('build/client', 'Client build directory');
    const serverBuildExists = checkFileExists('build/server', 'Server build directory');
    
    results.push({
      test: 'Build Artifacts',
      success: buildDirExists && clientBuildExists && serverBuildExists,
      details: 'Build artifacts generated successfully'
    });
  }
  
  // Test 5: Database Connection
  console.log('5️⃣ DATABASE CONNECTION TEST');
  console.log('──────────────────────────────');
  
  const dbTest = runCommand('npm run db:test', 'Database connection test');
  results.push({
    test: 'Database Connection',
    success: dbTest.success,
    details: dbTest.success ? 'Database connection working' : 'Database connection failed'
  });
  
  // Test 6: Functional Tests
  console.log('6️⃣ FUNCTIONAL TESTS');
  console.log('──────────────────────────────');
  
  const functionalTest = runCommand('npm run test:functional', 'Functional test suite');
  results.push({
    test: 'Functional Tests',
    success: functionalTest.success,
    details: functionalTest.success ? 'Most tests passing' : 'Tests failing'
  });
  
  // Summary
  console.log('📊 PHASE 1 FIXES VERIFICATION SUMMARY');
  console.log('=====================================');
  
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  const passRate = ((passed / total) * 100).toFixed(1);
  
  console.log(`🎯 Tests Passed: ${passed}/${total} (${passRate}%)`);
  console.log('');
  
  results.forEach((result, index) => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${index + 1}. ${result.test}: ${result.details}`);
  });
  
  console.log('');
  
  if (passed === total) {
    console.log('🎉 ALL PHASE 1 FIXES VERIFIED SUCCESSFULLY!');
    console.log('✅ Project is ready for Phase 2 development');
  } else {
    console.log('⚠️  Some issues remain - please check the results above');
    console.log('🔧 Phase 1 fixes may need additional work');
  }
  
  console.log('');
  console.log('📋 Next Steps:');
  console.log('1. Review any remaining issues');
  console.log('2. Proceed to Phase 2 - Core Functionality Fixes');
  console.log('3. Continue with database CRUD operations fix');
  console.log('4. Enhance error handling and test data management');
  
  // Save results
  const reportPath = 'phase1-verification-report.json';
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total,
      passed,
      passRate,
      status: passed === total ? 'COMPLETE' : 'PARTIAL'
    },
    results
  }, null, 2));
  
  console.log(`📄 Detailed report saved to: ${reportPath}`);
  
  return passed === total;
};

main().catch(console.error);