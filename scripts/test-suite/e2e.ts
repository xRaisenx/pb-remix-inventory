import { execSync } from 'child_process';
execSync('playwright test', { stdio: 'inherit' });