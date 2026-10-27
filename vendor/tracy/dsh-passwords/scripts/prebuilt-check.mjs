// 判断「当前安装是否已具备可运行的预构建产物」。
//
// 产物判定对安装来源一视同仁（源码 clone 与 npm 发布包均带 src/ 与 tsconfig.json，
// 产物缺失时由 install.mjs 决定退回 tsc 编译）。这里的关键是运行时依赖判定：
// npm install --prefix <dir> 会把依赖提升到 <dir>/node_modules/，而不是放进
// 包自身的 node_modules/，所以不能只看 pkg/node_modules/<name> 是否存在，
// 必须用 Node 模块解析（createRequire().resolve()），它会沿父目录向上查找。
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * @param {string} root 包根目录（绝对路径）
 * @param {string[]} runtimeDeps 运行时依赖包名
 * @returns {boolean} dist/cli.js 与 dist/client.js 存在，且所有运行时依赖可被解析
 */
export function hasPrebuiltRuntime(root, runtimeDeps) {
  if (!existsSync(path.join(root, 'dist', 'cli.js'))) return false;
  if (!existsSync(path.join(root, 'dist', 'client.js'))) return false;
  // createRequire 需要一个绝对文件名作为解析起点；package.json 满足且稳定存在。
  const requireFromRoot = createRequire(path.join(root, 'package.json'));
  for (const name of runtimeDeps) {
    try {
      requireFromRoot.resolve(name);
    } catch {
      return false;
    }
  }
  return true;
}
