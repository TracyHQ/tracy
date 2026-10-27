// startGateway 生命周期回归测试（可注入运行时，不触网、不泄露密钥）：
//   1) launch 在 await 期间被 ctx.effect 释放（disposed=true）时，必须立刻退出，
//      不得再 spawn 子进程或启动 Cookie 轮询，也不得留下 scheduleRetry 定时器；
//   2) spawn 失败只发 error、不发 exit 时（Node 明确允许），必须交出 child 所有权，
//      否则下一次 launch 会被残留 child 永久挡住；且旧子进程迟到的 exit 不得清掉
//      新子进程的所有权或触发额外的 spawn。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';

import { startGateway, type GatewayLaunchRuntime } from '../src/plugin.js';
import type { PlatformConfig } from '../src/config.js';
import type { Context } from '@deepseek-ai/cordis';

function configFor(port: number): PlatformConfig {
  return {
    setupKey: 'test-setup-key',
    dbPath: '',
    dbEncKey: 'test-key',
    gateway: {
      host: '127.0.0.1', port, upstream: 'http://127.0.0.1:1',
      tls: null, redirectPort: null, publicHost: '', domain: 'localhost',
      autoTls: false, acmeEmail: '', acmeStaging: false,
    },
    jwtSecret: 'test-secret',
    internalSecret: 'test-internal',
    patch: { dshRoot: '', restartService: '' },
    endpointRules: [],
  };
}

function fakeCtx(): Context & { dispose: () => void } {
  const disposers: Array<() => void> = [];
  const ctx = {
    webServer: { port: 9, register: () => () => {} },
    effect: (callback: () => (() => void)): void => { disposers.push(callback()); },
    get: (): undefined => undefined,
    dispose: (): void => { for (const dispose of disposers) dispose(); },
  };
  return ctx as unknown as Context & { dispose: () => void };
}

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly kills: Array<NodeJS.Signals | number> = [];
  kill(signal?: NodeJS.Signals | number): boolean {
    this.kills.push(signal ?? 'SIGTERM');
    return true;
  }
}

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

async function waitUntil(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!cond() && Date.now() < deadline) await wait(25);
  return cond();
}

function captureErrors(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]): void => { logs.push(args.map(String).join(' ')); };
  return { logs, restore: (): void => { console.error = original; } };
}

function restoreAutostart(previous: string | undefined): void {
  if (previous === undefined) delete process.env.DSH_PASSWORDS_NO_AUTOSTART;
  else process.env.DSH_PASSWORDS_NO_AUTOSTART = previous;
}

function runtimeWith(cfg: PlatformConfig, overrides: Partial<GatewayLaunchRuntime>): GatewayLaunchRuntime {
  return {
    spawn: (() => { throw new Error('spawn not expected in this test'); }) as unknown as GatewayLaunchRuntime['spawn'],
    healthz: async () => false,
    ownerPid: async () => null,
    portFree: async () => true,
    exchangeBrowserCookie: async () => ({ supported: false, cookie: null }),
    deploymentEnv: (_envFile, env) => env,
    loadConfig: () => cfg,
    ...overrides,
  };
}

test('dispose during launch await does not spawn or schedule retry', async () => {
  const errors = captureErrors();
  const noAutostart = process.env.DSH_PASSWORDS_NO_AUTOSTART;
  delete process.env.DSH_PASSWORDS_NO_AUTOSTART;
  try {
    const cfg = configFor(9443);
    const ctx = fakeCtx();
    let spawnCalls = 0;
    let portFreeCalls = 0;
    let portFreeGate: Deferred<boolean> | null = null;

    startGateway(ctx, cfg, '', runtimeWith(cfg, {
      spawn: (() => { spawnCalls += 1; throw new Error('spawn must not be reached'); }) as unknown as GatewayLaunchRuntime['spawn'],
      portFree: async () => {
        portFreeCalls += 1;
        portFreeGate = deferred<boolean>();
        return portFreeGate.promise;
      },
    }));

    assert.equal(await waitUntil(() => portFreeCalls === 1, 2000), true, 'launch 应已进入端口等待');
    ctx.dispose(); // 模拟 ctx.effect 释放：disposed=true
    if (portFreeGate === null) throw new Error('端口等待门未创建');
    portFreeGate.resolve(true); // 唤醒 await：修复后必须在此退出，不得继续 spawn
    await wait(50);
    assert.equal(spawnCalls, 0, 'dispose 后不得 spawn 子进程');
    await wait(1200); // scheduleRetry 为 1000ms：确认没有残留定时器再次 launch
    assert.equal(spawnCalls, 0, 'dispose 后不得有重试 spawn');
  } finally {
    restoreAutostart(noAutostart);
    errors.restore();
  }
});

test('spawn error releases ownership so retry runs, late exit cannot clobber it', async () => {
  const errors = captureErrors();
  const noAutostart = process.env.DSH_PASSWORDS_NO_AUTOSTART;
  delete process.env.DSH_PASSWORDS_NO_AUTOSTART;
  try {
    const cfg = configFor(9444);
    const ctx = fakeCtx();
    const children: FakeChild[] = [];

    startGateway(ctx, cfg, '', runtimeWith(cfg, {
      spawn: (() => {
        const child = new FakeChild();
        children.push(child);
        return child as unknown as ChildProcess;
      }) as unknown as GatewayLaunchRuntime['spawn'],
    }));

    assert.equal(await waitUntil(() => children.length === 1, 2000), true, '首次 launch 应 spawn 子进程');

    // spawn 失败：只发 error、不发 exit（Node 允许 exit 不再触发）。
    children[0].emit('error', new Error('spawn ENOENT'));
    assert.equal(errors.logs.some((line) => line.includes('密码门拉起失败')), true, '应记录 spawn 失败');
    assert.equal(await waitUntil(() => children.length === 2, 3000), true, 'error 后必须释放所有权以允许重试');

    // 旧子进程迟到的 exit 不得夺走/清掉新子进程的所有权，也不得触发第三次 spawn。
    children[0].emit('exit', null, 'SIGKILL');
    await wait(1200);
    assert.equal(children.length, 2, '迟到的 exit 不得触发额外 spawn');

    ctx.dispose();
    assert.deepEqual(children[1].kills, ['SIGTERM'], 'dispose 仍应终止当前存活的子进程');
    assert.equal(children[0].kills.length, 0, '已失败的子进程不应被 kill');
  } finally {
    restoreAutostart(noAutostart);
    errors.restore();
  }
});
