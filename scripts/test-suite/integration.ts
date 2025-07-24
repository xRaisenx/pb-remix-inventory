import { execSync } from 'child_process';
execSync('vitest run --config vitest.integration.config.ts', { stdio: 'inherit' });