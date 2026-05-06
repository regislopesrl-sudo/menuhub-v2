import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve(process.cwd(), 'src');
const allowedExt = new Set(['.ts', '.tsx', '.css', '.md']);
const ignoredDirs = new Set(['.next', 'node_modules', 'dist', 'build']);
const patterns = ['Ãƒ', 'PeÃ', 'CardÃ', 'EndereÃ', 'disponÃ', 'usuÃ', 'autenticaÃ'];

async function walk(dir, files = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      await walk(path.join(dir, entry.name), files);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (allowedExt.has(ext)) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

async function main() {
  const files = await walk(rootDir);
  const problems = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    for (const token of patterns) {
      if (content.includes(token)) {
        problems.push({ file, token });
      }
    }
  }

  if (problems.length > 0) {
    console.error('Encoding check failed: possible mojibake detected.');
    for (const problem of problems) {
      const relative = path.relative(process.cwd(), problem.file);
      console.error(`- ${relative} -> "${problem.token}"`);
    }
    process.exit(1);
  }

  console.log('OK: no encoding/mojibake issues found.');
}

main().catch((error) => {
  console.error('Encoding check failed with unexpected error.');
  console.error(error);
  process.exit(1);
});
