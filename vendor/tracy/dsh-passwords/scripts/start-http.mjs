#!/usr/bin/env node
// dsh-passwords 明文 HTTP 模式启动脚本（危险，仅限本地/内网）
//
// 用法:
//   node scripts/start-http.mjs [端口] [监听地址]
//   端口默认 8080；监听地址默认 127.0.0.1（仅本机可访问）。
//   显式传 0.0.0.0 才暴露到局域网/公网（明文 HTTP，风险自负）。
//
// 背景：密码门默认要求自动 HTTPS（Let's Encrypt），公网 IP/域名拿不到时
// 会拒绝启动（错误码 30/31），绝不静默降级为明文。确实只能在内网/本地
// 使用、且接受明文传输风险的用户，用本脚本显式确认后以 HTTP 启动。
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'dist', 'cli.js');

// 跟随环境语言（与 CLI 一致：LANG/LC_ALL/LC_MESSAGES 以 en 开头即英文）
const isEn = ['LANG', 'LC_ALL', 'LC_MESSAGES'].some((key) =>
  String(process.env[key] ?? '').toLowerCase().startsWith('en'),
);

const rawPort = process.argv[2] ?? '';
let port = 8080;
if (rawPort !== '') {
  // 严格端口：拒绝 1e3/0x10/浮点/负数/越界，不静默回退到 8080（否则用户会以为
  // 服务跑在指定端口，实际暴露在另一个端口，排障与安全组配置都会误导）。
  if (!/^\d+$/.test(rawPort) || !Number.isSafeInteger(Number(rawPort)) || Number(rawPort) < 1 || Number(rawPort) > 65535) {
    console.error(
      isEn
        ? `Invalid port: ${rawPort}. Use an integer from 1 to 65535.`
        : `端口无效：${rawPort}。请输入 1 到 65535 的整数。`,
    );
    process.exit(1);
  }
  port = Number(rawPort);
}

// 监听地址：默认只绑本机回环（明文模式下暴露到公网 = 密码/Cookie 可被嗅探）；
// 用户显式指定第二参数才覆盖（如 0.0.0.0 / 局域网 IP），并追加醒目警告。
const rawHost = (process.argv[3] ?? '').trim();
const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost', '[::1]']);
const host = rawHost === '' ? '127.0.0.1' : rawHost;
if (!/^[A-Za-z0-9.:\-\[\]]+$/.test(host)) {
  console.error(isEn ? `Invalid bind address: ${host}` : `监听地址无效：${host}`);
  process.exit(1);
}
const nonLoopback = rawHost !== '' && !loopbackHosts.has(rawHost.toLowerCase());
const warnLines = isEn
  ? [
      '=============================================================',
      '  WARNING: plain HTTP mode',
      '  Passwords and session cookies travel in cleartext and can be',
      '  sniffed on the network. Prefer automatic HTTPS (the default',
      '  mode, needs no configuration) for public deployments.',
      '  Continuing means you accept this risk.',
      '=============================================================',
    ]
  : [
      '=============================================================',
      '  警告：明文 HTTP 模式',
      '  登录密码与会话 Cookie 将以明文传输，可能被网络中间人嗅探。',
      '  公网部署建议优先使用自动 HTTPS（默认模式，无需额外配置）。',
      '  继续即表示你已了解该风险。',
      '=============================================================',
    ];
for (const line of warnLines) console.error(line);
if (nonLoopback) {
  console.error(
    isEn
      ? `  EXTRA WARNING: binding to ${host} exposes the plaintext service to the network.`
      : `  ⚠ 额外警告：监听 ${host} 会把明文服务暴露到网络上，登录密码可被嗅探。`,
  );
}

const prompt = isEn
  ? `Start the gateway in HTTP mode on ${host}:${port}? Type y to continue [y/N] `
  : `确认以 HTTP 模式启动密码门（监听 ${host}:${port}）？输入 y 继续 [y/N] `;

const rl = createInterface({ input: process.stdin, output: process.stderr });
// stdin 关闭（非交互 / </dev/null）：question 永不回调会挂死——直接按取消处理退出。
// 已作答后 stdin 关闭（如管道 echo y | ... 的 EOF）不应再误判为取消。
let answered = false;
process.stdin.on('close', () => {
  if (answered) return;
  console.error(isEn ? 'Cancelled (no interactive input).' : '已取消（无交互输入）。');
  process.exit(1);
});
rl.question(prompt, (answer) => {
  answered = true;
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.error(isEn ? 'Cancelled.' : '已取消。');
    process.exit(1);
  }
  if (!existsSync(cli)) {
    console.error(
      isEn
        ? `Not found: ${cli}. Run npm install && npm run build in the project directory first.`
        : `未找到 ${cli}。请先在项目目录运行：npm install && npm run build`,
    );
    process.exit(1);
  }
  const child = spawn(
    process.execPath,
    [cli, 'serve-gateway', '--port', String(port), '--host', host],
    {
      cwd: root,
      env: {
        ...process.env,
        MCP_GATEWAY_AUTO_TLS: '0',
        MCP_GATEWAY_REDIRECT_PORT: '',
      },
      stdio: 'inherit',
    },
  );
  child.on('error', (error) => {
    console.error(isEn ? 'Startup failed:' : '启动失败:', error);
    process.exit(1);
  });
  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
});
