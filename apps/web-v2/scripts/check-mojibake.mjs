import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = process.cwd();
const targetDir = join(root, 'src');
const exts = new Set(['.ts', '.tsx', '.css', '.json']);
const badPatterns = ['Ãƒ', 'PeÃ', 'CardÃ', 'EndereÃ', 'disponÃ'];
const ignores = new Set(['.next', 'node_modules']);
const problems = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (ignores.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full);
      continue;
    }
    if (!exts.has(extname(full))) continue;

    const content = readFileSync(full, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of badPatterns) {
        if (line.includes(pattern)) {
          problems.push(`${full}:${index + 1}: found "${pattern}"`);
          break;
        }
      }
    });
  }
}

walk(targetDir);

if (problems.length > 0) {
  console.error('Mojibake detected:');
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

console.log('No mojibake patterns found.');
