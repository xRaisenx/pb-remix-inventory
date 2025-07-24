#!/usr/bin/env tsx
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { autofix } from './autofix';

const stages = ['lint', 'typecheck', 'unit', 'integration', 'e2e', 'bundle'];
let attempt = 0;

async function runStage(stage: string) {
  try {
    console.log(`▶️  ${stage}`);
    execSync(`tsx scripts/test-suite/${stage}.ts`, { stdio: 'inherit' });
    return true;
  } catch (e) {
    console.error(`❌ ${stage} failed`);
    return false;
  }
}

async function main() {
  while (true) {
    attempt++;
    const failed: string[] = [];
    for (const s of stages) {
      if (!(await runStage(s))) failed.push(s);
    }
    if (failed.length === 0) {
      console.log(`✅ All green after ${attempt} attempt(s)`);
      process.exit(0);
    }
    if (process.argv.includes('--fix')) {
      console.log(`🔧 Autofixing ${failed.join(', ')}`);
      await autofix(failed);
    } else {
      process.exit(1);
    }
  }
}
main();