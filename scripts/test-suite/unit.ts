import { execSync } from 'child_process';
execSync('vitest run --config vitest.config.ts', { stdio: 'inherit' });