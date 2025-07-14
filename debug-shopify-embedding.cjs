#!/usr/bin/env node

/**
 * Shopify App Embedding Debugging Script
 * 
 * This script helps diagnose common issues with Shopify app embedding,
 * specifically for Remix apps using the new embedded auth strategy.
 */

const fs = require('fs');
const path = require('path');

console.log('\n🔍 SHOPIFY APP EMBEDDING DIAGNOSTIC TOOL\n');

const checks = [];
let hasErrors = false;

// Check 1: Verify auth splat route exists
function checkAuthSplatRoute() {
  const authSplatPath = path.join(__dirname, 'app', 'routes', 'auth.$.tsx');
  if (fs.existsSync(authSplatPath)) {
    checks.push('✅ Auth splat route (auth/$.tsx) exists');
    
    // Check content
    const content = fs.readFileSync(authSplatPath, 'utf8');
    if (content.includes('authenticate.admin')) {
      checks.push('✅ Auth splat route has authenticate.admin call');
    } else {
      checks.push('❌ Auth splat route missing authenticate.admin call');
      hasErrors = true;
    }
    
    if (content.includes('ErrorBoundary')) {
      checks.push('✅ Auth splat route has error boundary');
    } else {
      checks.push('⚠️ Auth splat route missing error boundary (recommended)');
    }
  } else {
    checks.push('❌ CRITICAL: Auth splat route (auth/$.tsx) is missing');
    hasErrors = true;
  }
}

// Check 2: Verify embedded auth strategy is enabled
function checkEmbeddedAuthStrategy() {
  const shopifyServerPath = path.join(__dirname, 'app', 'shopify.server.ts');
  if (fs.existsSync(shopifyServerPath)) {
    const content = fs.readFileSync(shopifyServerPath, 'utf8');
    
    if (content.includes('unstable_newEmbeddedAuthStrategy: true')) {
      checks.push('✅ New embedded auth strategy is enabled');
    } else {
      checks.push('❌ New embedded auth strategy is disabled or missing');
      hasErrors = true;
    }
    
    if (content.includes('isEmbeddedApp: true')) {
      checks.push('✅ App is configured as embedded');
    } else {
      checks.push('❌ App is not configured as embedded');
      hasErrors = true;
    }
  } else {
    checks.push('❌ shopify.server.ts not found');
    hasErrors = true;
  }
}

// Check 3: Verify AppProvider configuration
function checkAppProvider() {
  const appRoutePath = path.join(__dirname, 'app', 'routes', 'app.tsx');
  if (fs.existsSync(appRoutePath)) {
    const content = fs.readFileSync(appRoutePath, 'utf8');
    
    if (content.includes('@shopify/shopify-app-remix/react')) {
      checks.push('✅ Correct AppProvider import from shopify-app-remix');
    } else if (content.includes('@shopify/app-bridge-react')) {
      checks.push('❌ CRITICAL: Using wrong AppProvider from app-bridge-react');
      hasErrors = true;
    } else {
      checks.push('❌ AppProvider import not found');
      hasErrors = true;
    }
    
    if (content.includes('isEmbeddedApp')) {
      checks.push('✅ AppProvider has isEmbeddedApp prop');
    } else {
      checks.push('❌ AppProvider missing isEmbeddedApp prop');
      hasErrors = true;
    }
  } else {
    checks.push('❌ app/routes/app.tsx not found');
    hasErrors = true;
  }
}

// Check 4: Verify environment variables
function checkEnvironmentVariables() {
  const requiredVars = [
    'SHOPIFY_API_KEY',
    'SHOPIFY_API_SECRET', 
    'SHOPIFY_APP_URL',
    'SCOPES'
  ];
  
  const envExample = path.join(__dirname, '.env.example');
  const envLocal = path.join(__dirname, '.env');
  
  if (fs.existsSync(envExample)) {
    checks.push('✅ .env.example file exists');
  } else {
    checks.push('⚠️ .env.example file missing');
  }
  
  if (fs.existsSync(envLocal)) {
    checks.push('✅ .env file exists');
    
    const envContent = fs.readFileSync(envLocal, 'utf8');
    requiredVars.forEach(varName => {
      if (envContent.includes(varName + '=')) {
        checks.push(`✅ ${varName} is defined in .env`);
      } else {
        checks.push(`❌ ${varName} is missing from .env`);
        hasErrors = true;
      }
    });
  } else {
    checks.push('❌ CRITICAL: .env file is missing');
    hasErrors = true;
  }
}

// Check 5: Verify package dependencies
function checkDependencies() {
  const packageJsonPath = path.join(__dirname, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    if (deps['@shopify/shopify-app-remix']) {
      checks.push('✅ @shopify/shopify-app-remix is installed');
    } else {
      checks.push('❌ @shopify/shopify-app-remix is missing');
      hasErrors = true;
    }
    
    if (deps['@shopify/polaris']) {
      checks.push('✅ @shopify/polaris is installed');
    } else {
      checks.push('⚠️ @shopify/polaris is missing (recommended)');
    }
  } else {
    checks.push('❌ package.json not found');
    hasErrors = true;
  }
}

// Check 6: Verify shopify.app.toml configuration
function checkShopifyConfig() {
  const configPath = path.join(__dirname, 'shopify.app.toml');
  if (fs.existsSync(configPath)) {
    checks.push('✅ shopify.app.toml exists');
    
    const content = fs.readFileSync(configPath, 'utf8');
    if (content.includes('embedded = true')) {
      checks.push('✅ App is configured as embedded in shopify.app.toml');
    } else {
      checks.push('❌ App should be configured as embedded in shopify.app.toml');
      hasErrors = true;
    }
  } else {
    checks.push('⚠️ shopify.app.toml not found');
  }
}

// Run all checks
console.log('Running diagnostic checks...\n');

checkAuthSplatRoute();
checkEmbeddedAuthStrategy();
checkAppProvider();
checkEnvironmentVariables();
checkDependencies();
checkShopifyConfig();

// Display results
console.log('🔍 DIAGNOSTIC RESULTS:\n');
checks.forEach(check => console.log(`   ${check}`));

console.log('\n' + '='.repeat(60));

if (hasErrors) {
  console.log('❌ CRITICAL ISSUES FOUND - App will not work properly');
  console.log('\n📋 NEXT STEPS:');
  console.log('1. Fix the critical issues marked with ❌');
  console.log('2. Reinstall the app in your Shopify store');
  console.log('3. Test the app in the Shopify Admin');
  console.log('\n💡 TIP: The most common issue is missing auth/$.tsx route');
} else {
  console.log('✅ ALL CHECKS PASSED - App should work properly');
  console.log('\n📋 NEXT STEPS:');
  console.log('1. Redeploy your app to Vercel/production');
  console.log('2. Reinstall the app in your Shopify store if needed');
  console.log('3. Test the app in the Shopify Admin');
}

console.log('\n🚀 If issues persist, check the Vercel logs for authentication errors');