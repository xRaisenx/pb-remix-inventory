import { execSync } from 'child_process';
execSync('eslint . --ext ts,tsx --max-warnings=0', { stdio: 'inherit' });