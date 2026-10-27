// The argument shapes dsh's gateway accepts for every RPC this package sends, and a guard that
// refuses any other shape the way the real gateway does.
//
// #591: `listSessions()` sent `session/list` `{ request: {} }`; dsh answers that with
// `gateway/arguments-invalid: args fields do not match the descriptor: missing "_request";
// unexpected "request"`, so every site deletion reported SESSIONS_UNREADABLE. The fakes of dsh in
// this package's tests answered any shape, so every test stayed green. A fake that sits in front
// of them and checks each call against the descriptor is what turns the next such slip red.
//
// Wire field names come from the Remote method's parameter names (typert reads them from the
// JavaScript signature), so the source of truth is the method, cited per endpoint below, under
// `vendor/tracy/deepseek-harness/packages/`.
import type { WorkspaceRpc } from '../../src/tracy/seat-home.js';

type FieldType = 'string' | 'boolean' | { literal: string };

/** One wire field: a plain value, or a request object with its own required/optional fields. */
type WireField =
  | { kind: 'value'; type: FieldType }
  | { kind: 'object'; required: Record<string, FieldType>; optional: Record<string, FieldType> };

type Endpoint = Parameters<WorkspaceRpc>[0];

/**
 * Every endpoint `WorkspaceRpc` names, with the wire fields its Remote method declares. A new
 * endpoint in `WorkspaceRpc` fails typecheck here until its descriptor is written down.
 */
export const DSH_RPC_DESCRIPTORS: Record<Endpoint, Record<string, WireField>> = {
  // api/workspace-controller/src/index.ts:86 `create(request)`; types.ts:65 `{ path }`.
  'workspace/create': { request: { kind: 'object', required: { path: 'string' }, optional: {} } },
  // api/workspace-controller/src/index.ts:115 `rename(request)`; types.ts:76 `{ workspaceId, title }`.
  'workspace/rename': {
    request: { kind: 'object', required: { workspaceId: 'string', title: 'string' }, optional: {} },
  },
  // api/workspace-controller/src/index.ts:125 `delete(request)`; types.ts:87 `{ workspaceId }`.
  'workspace/delete': { request: { kind: 'object', required: { workspaceId: 'string' }, optional: {} } },
  // api/workspace-controller/src/index.ts:155 `archiveSession(request)`; types.ts:115
  // `{ sessionId, stopActivity? }`.
  'workspace/archiveSession': {
    request: { kind: 'object', required: { sessionId: 'string' }, optional: { stopActivity: 'boolean' } },
  },
  // api/session-controller/src/index.ts:466 `cancel(request)`; types.ts:391 `{ sessionId }`.
  'session/cancel': { request: { kind: 'object', required: { sessionId: 'string' }, optional: {} } },
  // api/session-controller/src/index.ts:252 `list(_request, signal)` — the parameter is named
  // `_request`, and the AbortSignal is not a wire field; types.ts:266 `{ cursor? }`.
  'session/list': { _request: { kind: 'object', required: {}, optional: { cursor: 'string' } } },
  // subagent/subagent/src/index.ts:483 `interruptByParent(childSessionId, parentSessionId, mode)`:
  // three wire fields, no request object.
  'subagents/interruptByParent': {
    childSessionId: { kind: 'value', type: 'string' },
    parentSessionId: { kind: 'value', type: 'string' },
    mode: { kind: 'value', type: { literal: 'continuable' } },
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === null || prototype === Object.prototype;
}

function fits(value: unknown, type: FieldType): boolean {
  if (typeof type === 'object') return value === type.literal;
  return typeof value === type;
}

function fieldFits(value: unknown, field: WireField): boolean {
  if (field.kind === 'value') return fits(value, field.type);
  if (!isPlainObject(value)) return false;
  for (const [name, type] of Object.entries(field.required)) {
    if (!Object.hasOwn(value, name) || !fits(value[name], type)) return false;
  }
  for (const [name, type] of Object.entries(field.optional)) {
    if (Object.hasOwn(value, name) && !fits(value[name], type)) return false;
  }
  // Stricter than dsh may be: an inner field this package does not know is refused too.
  return Object.keys(value).every((name) => Object.hasOwn(field.required, name) || Object.hasOwn(field.optional, name));
}

/**
 * What dsh's gateway answers to `args` sent to `endpoint`, or `null` when it would dispatch them.
 * Top-level fields are checked as `assertExactArguments` does (api/gateway/src/index.ts:1465–1490:
 * `gateway/arguments-invalid`, same message); a field's value as `decode` does
 * (index.ts:1492–1514: `gateway/input-invalid`).
 * @param endpoint - the RPC, `<namespace>/<method>`.
 * @param args - the `payload.args` object sent.
 * @returns the refusal dsh would answer, or null.
 */
export function dshArgumentsRefusal(endpoint: string, args: unknown): { code: string; message: string } | null {
  const descriptor = (DSH_RPC_DESCRIPTORS as Record<string, Record<string, WireField>>)[endpoint];
  if (descriptor === undefined) {
    return { code: 'gateway/invocation-unavailable', message: 'no active Remote method exports this endpoint' };
  }
  if (!isPlainObject(args)) return { code: 'gateway/arguments-invalid', message: 'args must be a plain object' };
  const expected = Object.keys(descriptor);
  const missing = expected.filter((key) => !Object.hasOwn(args, key));
  const extra = Object.keys(args).filter((key) => !Object.hasOwn(descriptor, key));
  if (missing.length > 0 || extra.length > 0) {
    const clauses: string[] = [];
    if (missing.length > 0) clauses.push(`missing ${missing.map((key) => JSON.stringify(key)).join(', ')}`);
    if (extra.length > 0) clauses.push(`unexpected ${extra.map((key) => JSON.stringify(key)).join(', ')}`);
    return {
      code: 'gateway/arguments-invalid',
      message: `args fields do not match the descriptor: ${clauses.join('; ')}`,
    };
  }
  for (const [name, field] of Object.entries(descriptor)) {
    if (!fieldFits(args[name], field)) {
      return { code: 'gateway/input-invalid', message: `wire field ${JSON.stringify(name)} failed boundary validation` };
    }
  }
  return null;
}

/**
 * `rpc` behind dsh's argument check: a call dsh would refuse is answered with that refusal and never
 * reaches `rpc`, so a fake cannot record or answer a call the real gateway would not dispatch.
 * @param rpc - the test's fake of dsh.
 * @returns the same fake, refusing wrong argument shapes.
 */
export function strictDshRpc(rpc: WorkspaceRpc): WorkspaceRpc {
  return async (endpoint, args) => {
    const refusal = dshArgumentsRefusal(endpoint, args);
    return refusal === null ? rpc(endpoint, args) : { ok: false, error: refusal };
  };
}
