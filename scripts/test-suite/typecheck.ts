import { execSync } from 'child_process';
execSync('tsc --noEmit --project tsconfig.json', { stdio: 'inherit' });