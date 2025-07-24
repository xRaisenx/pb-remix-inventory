import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function autofix(failedStages: string[]) {
  const patchLog = execSync(`git diff`, { encoding: 'utf8' });
  const prompt = `
You are Planet Beauty's AI test-suite assistant.
The following stages failed: ${failedStages.join(', ')}.
Current git diff:
${patchLog}
Rules:
1. Output ONLY the unified diff (no prose).
2. Do NOT change public API signatures.
3. Prefer minimal, targeted fixes.
4. Wrap changes in comments // AI-FIX-START / // AI-FIX-END
`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
  });

  const diff = res.choices[0]?.message?.content?.trim();
  if (diff) {
    const patchFile = `.tmp-${Date.now()}.patch`;
    fs.writeFileSync(patchFile, diff);
    execSync(`git apply ${patchFile}`);
    fs.unlinkSync(patchFile);
    console.log(`🩹 patch applied`);
  }
}