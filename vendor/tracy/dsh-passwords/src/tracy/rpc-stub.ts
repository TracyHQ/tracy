/**
 * H1's local answer (R12): a dsh RPC that stays closed to a seat, answered by the gateway with the
 * empty value dsh itself would give a caller that may do nothing — so the dsh client stops printing
 * each refusal as an error. Nothing reaches dsh. The envelope is read strictly, like upstream's own
 * terminal stubs (`terminalStubRpcId` in gateway.ts, copied on purpose: core is not ours to refactor):
 * a `client-request` naming exactly this method
 * with a short `rpcId`; anything else, or a body over 64 KiB, is refused 403.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RpcAnswerVerdict } from './policy.js';

const MAX_BODY_BYTES = 64 * 1024;

/** The `rpcId` of a `client-request` envelope naming `method` (`ns/m` or `ns.m`), or null. */
export function stubRpcIdOf(raw: string, method: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const envelope = parsed as Record<string, unknown>;
  if (envelope.type !== 'client-request') return null;
  const { rpcId } = envelope;
  if (typeof rpcId !== 'string' || rpcId.length === 0 || rpcId.length > 200) return null;
  if (typeof envelope.method !== 'string' || envelope.method.replace('.', '/') !== method) return null;
  return rpcId;
}

/** Answer `verdict` on `res` once the request body is read. */
export function answerRpcLocally(req: IncomingMessage, res: ServerResponse, verdict: RpcAnswerVerdict): void {
  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size <= MAX_BODY_BYTES) chunks.push(chunk);
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    const rpcId = size > MAX_BODY_BYTES ? null : stubRpcIdOf(Buffer.concat(chunks).toString('utf8'), verdict.method);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    if (rpcId === null) {
      res.statusCode = 403;
      res.end(JSON.stringify({ ok: false, error: 'This request is not available to this seat' }));
      return;
    }
    res.statusCode = 200;
    res.end(JSON.stringify({ type: 'server-response', rpcId, result: { ok: true, value: verdict.value } }));
  });
  req.on('error', () => {
    if (!res.writableEnded) res.destroy();
  });
}
