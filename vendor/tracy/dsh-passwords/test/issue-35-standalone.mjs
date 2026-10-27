#!/usr/bin/env node
/**
 * Issue #35 独立回归测试（standalone / 免 tsx / 免构建）
 * =====================================================
 * 与 test/issue-35-favicon-csrf.test.ts 的关系：
 *   - 那份是项目内正式回归测试（import ../src/gateway.js，走 tsx）；
 *   - 本文件是它的**独立副本**，直接加载 dist/ 产物（纯 ESM，无需 tsx、无需 esbuild
 *     子进程），因此可以在受限沙箱/无构建环境里直接跑：
 *         node test/issue-35-standalone.mjs
 *     退出码 0 = 全部通过；非 0 = 有失败或用例崩溃。
 *
 * 覆盖：
 *   A. Issue #35 修复契约（7 条）
 *   B. P0 安全回归：畸形多字节签名 cookie 必须**不能**打挂进程
 *      （未修复时 RangeError: Input buffers must have the same byte length → 进程退出）
 *
 * 注意：B 会真实触发未处理异常。若被修复，进程应当存活并正常响应；若未修复，
 * 子进程会崩溃 —— 这正是本测试要判定的结果，父进程不会受影响。
 */
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, '..', 'dist');

// ─────────────────────────── 子进程：真实起网关并跑断言 ───────────────────────────
async function runChild() {
  const imp = (f) => import(pathToFileURL(path.join(DIST, f)).href);
  const { createGatewayServer } = await imp('gateway.js');
  const { AuthService } = await imp('auth.js');
  const { Database } = await imp('db.js');
  const { createFieldCrypto } = await imp('encrypt.js');
  const bcrypt = require('bcryptjs');
  const jwt = require('jsonwebtoken');

  const tmp = mkdtempSync(path.join(os.tmpdir(), 'issue35-standalone-'));
  process.env.DSH_PASSWORDS_ENV_FILE = path.join(tmp, 'harness.env');

  const upstreamHits = [];
  const upstream = http.createServer((req, res) => {
    upstreamHits.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><body>upstream</body></html>');
  });
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
  const upPort = upstream.address().port;

  const makeConfig = (dbPath) => ({
    setupKey: 'test-setup-key',
    dbPath,
    dbEncKey: 'testkey',
    gateway: {
      host: '127.0.0.1', port: 0, upstream: 'http://127.0.0.1:' + upPort, tls: null,
      redirectPort: null, publicHost: '', domain: 'localhost', autoTls: false,
      acmeEmail: '', acmeStaging: false,
    },
    jwtSecret: 'test-secret',
    internalSecret: 'test-internal-secret',
    patch: { dshRoot: '', restartService: '' },
    endpointRules: [],
  });

  async function start(withAdmin, name) {
    const dbPath = path.join(tmp, name + '.db');
    const db = new Database(dbPath, createFieldCrypto('testkey', 'testkey'));
    db.init();
    if (withAdmin) db.createUser('admin', bcrypt.hashSync('Admin123!', 4), 'admin');
    const config = makeConfig(dbPath);
    const server = createGatewayServer(config, new AuthService(config, db), db);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    return { server, db, config, port: server.address().port };
  }

  const login = await start(true, 'login');
  const setup = await start(false, 'setup');
  const adminId = login.db.getUserByUsername('admin')?.id ?? 0;

  function call(port, { method = 'GET', p = '/', headers = {}, body } = {}) {
    return new Promise((resolve) => {
      const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const setCookies = [];
          for (let i = 0; i < res.rawHeaders.length; i += 2) {
            if (res.rawHeaders[i].toLowerCase() === 'set-cookie') setCookies.push(res.rawHeaders[i + 1]);
          }
          resolve({
            status: res.statusCode ?? 0, setCookies,
            location: typeof res.headers.location === 'string' ? res.headers.location : '',
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      });
      req.on('error', (e) => resolve({ status: -1, setCookies: [], location: '', body: 'ERR ' + e.code }));
      req.end(body);
    });
  }
  const csrfCookieOf = (r) => (r.setCookies.map((c) => /(?:^|;\s*)dsh_csrf=([^;]+)/.exec(c)).find(Boolean) ?? [])[1] ?? '';
  const csrfFieldOf = (r) => (r.body.match(/name="csrf" value="([^"]+)"/) ?? [])[1] ?? '';

  let failures = 0;
  const check = (name, ok, detail = '') => {
    if (!ok) failures += 1;
    console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || !detail ? '' : '  << ' + detail));
  };

  console.log('--- A. Issue #35 修复契约 ---');
  const first = await call(login.port, { p: '/gateway/login' });
  const cookie = csrfCookieOf(first);
  const field = csrfFieldOf(first);
  check('A1 登录页 200 且同时下发 cookie 与隐藏域', first.status === 200 && cookie !== '' && field !== '',
    'status=' + first.status + ' cookie=' + cookie + ' field=' + field);
  check('A2 同一次渲染 cookie === 隐藏域', cookie === field);

  upstreamHits.length = 0;
  const fav = await call(login.port, { p: '/favicon.ico' });
  check('A3 未登录 /favicon.ico → 204 且不下发 cookie、不重定向、不转发上游',
    fav.status === 204 && fav.setCookies.length === 0 && fav.location === '' && upstreamHits.length === 0,
    'status=' + fav.status + ' cookies=' + fav.setCookies.length + ' loc=' + fav.location + ' upstream=' + JSON.stringify(upstreamHits));

  const second = await call(login.port, { p: '/gateway/login', headers: { cookie: 'dsh_csrf=' + cookie } });
  check('A4 有效 cookie 重渲染时 token 被复用而非轮换',
    csrfCookieOf(second) === cookie && csrfFieldOf(second) === cookie,
    'cookie=' + csrfCookieOf(second) + ' field=' + csrfFieldOf(second));

  const submit = await call(login.port, {
    method: 'POST', p: '/gateway/login',
    headers: { cookie: 'dsh_csrf=' + cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'csrf=' + encodeURIComponent(field) + '&username=admin&password=Admin123!',
  });
  check('A5 favicon 干扰后原表单 token + 原 cookie 提交仍成功（302 而非 403）',
    submit.status === 302, 'status=' + submit.status);

  const invalid = 'deadbeef.' + 'a'.repeat(32);
  const rot = await call(login.port, { p: '/gateway/login', headers: { cookie: 'dsh_csrf=' + invalid } });
  check('A6 无效 cookie 仍被换发新 token（不放宽校验）',
    csrfCookieOf(rot) !== '' && csrfCookieOf(rot) !== invalid && csrfFieldOf(rot) === csrfCookieOf(rot),
    'issued=' + csrfCookieOf(rot));

  let redirectsOk = true;
  for (const target of ['/dashboard', '/favicon.png', '/assets/app.js', '/api/session.list']) {
    const r = await call(login.port, { p: target });
    if (r.status !== 302 || !r.location.startsWith('/gateway/login')) { redirectsOk = false; console.log('      ↳ ' + target + ' → ' + r.status); }
  }
  check('A7 非 favicon 的未登录路径仍 302 登录页（不放宽匿名放行）', redirectsOk);

  const token = jwt.sign({ sub: String(adminId), username: 'admin', cv: 0 }, login.config.jwtSecret, { expiresIn: '12h' });
  upstreamHits.length = 0;
  const authedFav = await call(login.port, { p: '/favicon.ico', headers: { cookie: 'dsh_gateway_token=' + token } });
  check('A8 已登录 favicon 仍照常转发上游',
    authedFav.status === 200 && upstreamHits[0] === '/favicon.ico',
    'status=' + authedFav.status + ' upstream=' + JSON.stringify(upstreamHits));

  console.log('--- B. P0 安全回归（畸形多字节签名 cookie）---');
  console.log('CHECKS_DONE failures=' + failures);

  // 31 个 ASCII + U+00E9：JS 长度 32（通过字符串长度检查），UTF-8 字节 33（timingSafeEqual 抛错）
  const crafted = 'dsh_csrf=a.' + 'a'.repeat(31) + '%C3%A9';
  const p0 = await call(login.port, { p: '/gateway/login', headers: { cookie: crafted } });
  console.log('P0_RESULT ' + JSON.stringify({ status: p0.status, bodyHead: p0.body.slice(0, 80) }));
  console.log('P0_SURVIVED 1');
  process.exit(0);
}

// ─────────────────────────── 父进程：spawn 子进程并判定 ───────────────────────────
if (process.argv.includes('--run')) {
  await runChild();
} else {
  console.log('Issue #35 独立回归测试（standalone，直接跑 dist/ 产物，无需 tsx）');
  console.log('DIST = ' + DIST + '\n');
  const res = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--run'], {
    encoding: 'utf8', timeout: 120000,
  });
  const out = (res.stdout ?? '') + (res.stderr ?? '');
  process.stdout.write(out);

  const failed = /^FAIL/m.test(out);
  const crashed = /RangeError: Input buffers must have the same byte length/.test(out);
  const survived = /P0_SURVIVED 1/.test(out);
  const checksLine = /CHECKS_DONE failures=(\d+)/.exec(out);
  const checkFailures = checksLine ? Number(checksLine[1]) : -1;

  console.log('\n================ 判定 ================');
  console.log('子进程退出码      : ' + res.status);
  console.log('A 组断言失败数    : ' + (checkFailures < 0 ? '未跑到（进程提前崩溃）' : checkFailures));
  console.log('P0 崩溃           : ' + (crashed ? '是 ❌ 未认证 GET 打挂了进程' : '否 ✅'));
  console.log('P0 后进程存活     : ' + (survived ? '是 ✅' : '否 ❌'));
  const ok = !failed && !crashed && survived && checkFailures === 0 && res.status === 0;
  console.log('\n总判定: ' + (ok ? 'PASS ✅' : 'FAIL ❌'));
  if (!ok) {
    console.log('\n提示：P0 崩溃说明 src/gateway.ts 的 csrfMatches 仍需修复：');
    console.log("  if (!/^[0-9a-f]{32}$/.test(cookieSig) || !/^[0-9a-f]{32}$/.test(fieldSig)) return false;");
  }
  process.exit(ok ? 0 : 1);
}
