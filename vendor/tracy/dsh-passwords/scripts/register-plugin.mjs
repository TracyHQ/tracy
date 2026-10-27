#!/usr/bin/env node
// 把 dsh-passwords 注册进 dsh web profile（精确版，由安装器 install.mjs、自更新引擎与 Docker bundled 入口调用）。
//
// 为什么不用 dsh 自带的 `dsh plugin add`：
//   它的 reconcile 会把 profile 里【所有】声明 dsh.bundle 的依赖全部加入
//   bundles 层。若用户之前装过其它独立插件（历史遗留的独立安装产物，也在
//   bundles 层加载），会触发 duplicate loader entry id，dsh 直接
//   启动失败。本脚本只精确追加 dsh-passwords 一个条目，其余配置不动。
//
// 行为（幂等）：
//   1. 确保 ~/.dsh/profiles/web 存在（不存在则按 dsh 模板初始化）
//   2. dependencies 加入 "dsh-passwords": "link:<本包路径>"
//   3. dsh.profile.bundles 末尾追加 dsh-passwords（已在则跳过）
//   4. pnpm install 物化 link
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * 运行 pnpm。Windows 上 pnpm 只是 `.cmd` shim，Node >=22（含 24）为修复
 * CVE-2024-27980 已拒绝 shell:false 直接执行 .cmd/.bat，而 shell:true 又会触发
 * DEP0190 且存在参数拼接注入面。因此用 cmd.exe 显式启动 shim：
 * `cmd /d /s /c pnpm.cmd install`（不经 shell:true）。
 * 注意不能给命令串再加一层引号：Node 会把内层引号转义成 \"，cmd /s 剥壳后
 * 得到非法命令，因此这里只接受不含引号/百分号/空白的固定字面量参数，否则 fail-closed。
 */
function runPnpm(args, cwd) {
  if (process.platform !== 'win32') return spawnSync('pnpm', args, { cwd, stdio: 'inherit' });
  if (args.some((arg) => /["%\s]/.test(arg))) {
    return { error: new Error('pnpm 参数不安全，已拒绝执行'), status: null };
  }
  const line = ['pnpm.cmd', ...args].join(' ');
  return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', line], { cwd, stdio: 'inherit' });
}

const installRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dshHome = process.env.DSH_HOME?.trim() || path.join(homedir(), '.dsh');
const profileDir = path.join(dshHome, 'profiles', 'web');

const WEB_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'];
const PATCH_TEMPLATE = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
[]
`;
const WORKSPACE = `packages:
  - .

nodeLinker: hoisted

allowBuilds:
  node-pty: true
  protobufjs: true
`;

mkdirSync(profileDir, { recursive: true });

// 1) 读取/初始化 profile manifest（字段与 dsh 的 initProfile 模板一致）
const manifestPath = path.join(profileDir, 'package.json');
let manifest;
if (existsSync(manifestPath)) {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} else {
  manifest = {
    name: 'dsh-profile-web',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [...WEB_BUNDLES] } },
  };
}

// 2) 依赖 + bundles（只动 dsh-passwords 一个条目）
let manifestChanged = false;
if (!manifest.dependencies) {
  manifest.dependencies = {};
  manifestChanged = true;
}
if (!manifest.dsh) {
  manifest.dsh = {};
  manifestChanged = true;
}
if (!manifest.dsh.profile) {
  manifest.dsh.profile = {};
  manifestChanged = true;
}
if (!manifest.dsh.profile.bundles) {
  manifest.dsh.profile.bundles = [...WEB_BUNDLES];
  manifestChanged = true;
}
const desiredLink = `link:${installRoot}`;
manifestChanged ||= manifest.dependencies['dsh-passwords'] !== desiredLink;
manifest.dependencies['dsh-passwords'] = desiredLink;
if (!manifest.dsh.profile.bundles.includes('dsh-passwords')) {
  manifest.dsh.profile.bundles.push('dsh-passwords');
  manifestChanged = true;
}
if (manifestChanged || !existsSync(manifestPath)) {
  writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n');
}

// 3) 缺失的配套文件按 dsh 模板补齐（已存在的不动）
const patchPath = path.join(profileDir, 'cordis.patch.yml');
if (!existsSync(patchPath)) writeFileSync(patchPath, PATCH_TEMPLATE);
const workspacePath = path.join(profileDir, 'pnpm-workspace.yaml');
if (!existsSync(workspacePath)) writeFileSync(workspacePath, WORKSPACE);

// 4) pnpm 物化 link（Windows 经 cmd.exe 显式调用 .cmd shim，不用 shell:true）。
// 重复 Docker 启动时，manifest 未变化且已物化的 link 仍在，就不再触发网络安装。
console.log(`[dsh-passwords] profile: ${profileDir}`);
if (!manifestChanged && existsSync(path.join(profileDir, 'node_modules', 'dsh-passwords'))) {
  console.log('[dsh-passwords] profile dependencies already ready');
  process.exit(0);
}
const result = runPnpm(['install'], profileDir);
if (result.error !== undefined) {
  console.error(`[dsh-passwords] 运行 pnpm 失败：${String(result.error)}（请先 npm install -g pnpm）`);
  process.exit(127);
}
process.exit(result.status ?? 1);
