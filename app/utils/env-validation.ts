// Environment variable validation for Shopify embedded apps

interface RequiredEnvVars {
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
  SHOPIFY_APP_URL: string;
  SCOPES: string;
  DATABASE_URL: string;
}

interface EnvironmentValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateEnvironmentVariables(): EnvironmentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required environment variables
  const requiredVars: (keyof RequiredEnvVars)[] = [
    'SHOPIFY_API_KEY',
    'SHOPIFY_API_SECRET', 
    'SHOPIFY_APP_URL',
    'SCOPES',
    'DATABASE_URL'
  ];

  // Check required variables
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    } else if (process.env[varName]?.trim() === '') {
      errors.push(`Environment variable ${varName} is empty`);
    }
  }

  // Validate specific formats
  if (process.env.SHOPIFY_APP_URL) {
    try {
      new URL(process.env.SHOPIFY_APP_URL);
    } catch {
      errors.push('SHOPIFY_APP_URL must be a valid URL');
    }
    
    if (!process.env.SHOPIFY_APP_URL.startsWith('https://')) {
      warnings.push('SHOPIFY_APP_URL should use HTTPS for production');
    }
  }

  if (process.env.SCOPES) {
    const scopes = process.env.SCOPES.split(',').map(s => s.trim());
    if (scopes.length === 0) {
      errors.push('At least one scope must be specified in SCOPES');
    }
  }

  if (process.env.DATABASE_URL) {
    if (!process.env.DATABASE_URL.startsWith('postgresql://') && 
        !process.env.DATABASE_URL.startsWith('postgres://')) {
      warnings.push('DATABASE_URL should use PostgreSQL for production');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

export function logEnvironmentStatus(): void {
  console.log('\n🔍 [ENV VALIDATION] Checking environment configuration...');
  
  const result = validateEnvironmentVariables();
  
  if (result.isValid) {
    console.log('✅ [ENV VALIDATION] All required environment variables are present');
  } else {
    console.error('❌ [ENV VALIDATION] Environment validation failed:');
    result.errors.forEach(error => console.error(`   - ${error}`));
  }
  
  if (result.warnings.length > 0) {
    console.warn('⚠️ [ENV VALIDATION] Warnings:');
    result.warnings.forEach(warning => console.warn(`   - ${warning}`));
  }

  // Log configuration status (without sensitive values)
  console.log('\n📋 [ENV STATUS] Configuration status:');
  console.log(`   - SHOPIFY_API_KEY: ${process.env.SHOPIFY_API_KEY ? 'SET' : 'MISSING'}`);
  console.log(`   - SHOPIFY_API_SECRET: ${process.env.SHOPIFY_API_SECRET ? 'SET' : 'MISSING'}`);
  console.log(`   - SHOPIFY_APP_URL: ${process.env.SHOPIFY_APP_URL || 'MISSING'}`);
  console.log(`   - SCOPES: ${process.env.SCOPES || 'MISSING'}`);
  console.log(`   - DATABASE_URL: ${process.env.DATABASE_URL ? 'SET' : 'MISSING'}`);
  console.log(`   - NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
}