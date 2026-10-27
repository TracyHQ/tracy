// 发布前清理 dist 中陈旧的编译产物：src/ 已删除的 .ts 源对应的 .js/.d.ts。
//
// 只删除「同时存在 .js 与 .d.ts」且「src/ 下已无同名 .ts」的成对产物，
// 因此不会误删 esbuild 生成的 dist/client.js（它没有 .d.ts），也不会触碰
// 只有 .d.ts 或只有 .js 的文件。普通 build/test 不调用本脚本，避免删除
// 用户本地已有的 dist。
import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');

if (!existsSync(srcDir) || !existsSync(distDir)) process.exit(0);

const sourceBases = new Set(
  readdirSync(srcDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name.slice(0, -'.ts'.length)),
);

const distFiles = new Set(
  readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name),
);

let removed = 0;
for (const name of distFiles) {
  const match = /^(.+)\.d\.ts$/.exec(name);
  if (match === null) continue;
  const base = match[1];
  // tsc 产物必定成对出现 .js 与 .d.ts；缺一即视为非编译产物，保留。
  if (!distFiles.has(`${base}.js`)) continue;
  if (sourceBases.has(base)) continue;
  for (const suffix of ['.js', '.d.ts', '.js.map', '.d.ts.map']) {
    const target = path.join(distDir, `${base}${suffix}`);
    if (!existsSync(target)) continue;
    rmSync(target, { force: true });
    removed += 1;
  }
}

console.log(`clean-dist: removed ${removed} obsolete artifact(s)`);
