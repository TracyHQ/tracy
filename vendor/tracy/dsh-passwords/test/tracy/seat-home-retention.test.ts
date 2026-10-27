// A finished registration keeps nothing alive (TCH #647).
//
// Every bounded RPC used to hang one reaction on the registrar's shared "closing" promise. That
// reaction outlived the call and, through Promise.race, kept each finished answer reachable until
// the gateway closed — which it never does in a running image. 3000 registrations kept 3000
// answers; close() dropped them all. These tests hold the registrar OPEN and ask the garbage
// collector itself, so cleanup that only happens on close() stays red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import vm from 'node:vm';
import {
  createSiteWorkspaceRegistrar as createSiteWorkspaceRegistrarOf,
  type WorkspaceRpc,
} from '../../src/tracy/seat-home.js';
import { strictDshRpc } from './dsh-rpc-fake.js';

const createSiteWorkspaceRegistrar: typeof createSiteWorkspaceRegistrarOf = (options) =>
  createSiteWorkspaceRegistrarOf({ ...options, rpc: strictDshRpc(options.rpc) });

const quiet = { log: () => {}, warn: () => {} };

/**
 * A real collector, with or without `--expose-gc` on the command line (the package suite runs
 * without it). Never a skip: without a collector these tests could not tell a leak from none.
 */
function collector(): () => void {
  const exposed = (globalThis as { gc?: () => void }).gc;
  if (typeof exposed === 'function') return exposed;
  v8.setFlagsFromString('--expose-gc');
  const gc = vm.runInNewContext('gc') as unknown;
  assert.equal(typeof gc, 'function', 'no garbage collector reachable: retention cannot be measured');
  return gc as () => void;
}

/** How many of `refs` survive a few collections spread over event-loop turns. */
async function survivors(refs: WeakRef<object>[]): Promise<number> {
  const gc = collector();
  for (let round = 0; round < 6; round += 1) {
    gc();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return refs.filter((ref) => ref.deref() !== undefined).length;
}

const N = 300;
/** A handful may still sit in a local slot of the last call; a leak keeps all N. */
const SLACK = 3;

test('S9: answers of finished registrations are collectable while the registrar stays open', async () => {
  const refs: WeakRef<object>[] = [];
  const rpc: WorkspaceRpc = async (endpoint, args) => {
    const request = args.request as Record<string, unknown>;
    // The title already matches, so each folder costs exactly one workspace/create.
    const answer = { ok: true as const, value: { workspace: { workspaceId: `ws-${String(request.path)}`, title: 'T' }, padding: new Array(256).fill(endpoint) } };
    refs.push(new WeakRef(answer));
    return answer;
  };
  const registrar = createSiteWorkspaceRegistrar({ rpc, ...quiet });
  for (let i = 0; i < N; i += 1) {
    const outcome = await registrar.register(`/site/done-${String(i)}`, 'T', () => true);
    assert.equal(outcome.status, 'registered');
  }
  assert.equal(refs.length, N);
  assert.equal(registrar.inFlight(), 0);
  const alive = await survivors(refs);
  assert.ok(alive <= SLACK, `${String(alive)} of ${String(N)} answers still reachable with the registrar open`);
  registrar.close();
});

test('S9: rejections of failed registrations are collectable while the registrar stays open', async () => {
  const refs: WeakRef<object>[] = [];
  const rpc: WorkspaceRpc = () => {
    const error = new Error('dsh fell over');
    refs.push(new WeakRef(error));
    return Promise.reject(error);
  };
  const registrar = createSiteWorkspaceRegistrar({ rpc, ...quiet });
  for (let i = 0; i < N; i += 1) {
    const outcome = await registrar.register(`/site/broken-${String(i)}`, 'T', () => true);
    assert.equal(outcome.status, 'failed');
  }
  assert.equal(refs.length, N);
  const alive = await survivors(refs);
  assert.ok(alive <= SLACK, `${String(alive)} of ${String(N)} rejections still reachable with the registrar open`);
  registrar.close();
});

test('S9: an RPC that throws before it returns a promise leaves nothing behind either', async () => {
  // Unwrapped on purpose: the argument check wraps every call in an async function, which would
  // turn this throw into a rejection before the registrar saw it.
  const refs: WeakRef<object>[] = [];
  const rpc: WorkspaceRpc = () => {
    const error = new Error('dsh client not ready');
    refs.push(new WeakRef(error));
    throw error;
  };
  const registrar = createSiteWorkspaceRegistrarOf({ rpc, ...quiet });
  for (let i = 0; i < N; i += 1) {
    const outcome = await registrar.register(`/site/thrown-${String(i)}`, 'T', () => true);
    assert.equal(outcome.status, 'failed');
  }
  assert.equal(refs.length, N);
  assert.equal(registrar.inFlight(), 0);
  const alive = await survivors(refs);
  assert.ok(alive <= SLACK, `${String(alive)} of ${String(N)} thrown errors still reachable with the registrar open`);
  registrar.close();
});

test('S9: close() cancels every call in flight once; repeated close and late answers change nothing', async () => {
  const held: Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }> = [];
  const rpc: WorkspaceRpc = () =>
    new Promise((resolve, reject) => {
      held.push({ resolve: resolve as (value: unknown) => void, reject });
    });
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', onUnhandled);
  try {
    const registrar = createSiteWorkspaceRegistrar({ rpc, ...quiet });
    const pending = [0, 1, 2].map((i) => registrar.register(`/site/held-${String(i)}`, 'T', () => true));
    while (held.length < 3) await new Promise((resolve) => setTimeout(resolve, 1));
    registrar.close();
    registrar.close();
    assert.deepEqual(await Promise.all(pending), [0, 1, 2].map(() => ({ status: 'cancelled', attempts: 1 })));
    held[0]?.resolve({ ok: true, value: { workspace: { workspaceId: 'ws-late', title: 'T' } } });
    held[1]?.reject(new Error('late failure'));
    held[2]?.resolve({ ok: false, error: { code: 'late', message: 'late refusal' } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(registrar.inFlight(), 0);
    assert.equal(held.length, 3, 'nothing asked dsh again after close');
    assert.deepEqual(unhandled, [], 'a late rejection lands nowhere');
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});
