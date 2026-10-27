// One RPC to dsh on its `/api` channel, for the Tracy doors (seat-home.ts, session-archive's
// settle): the same envelope the browser client uses (`client-request` in, `server-response` out)
// and past the same browser-trust fence the proxy clears — Host and Origin rewritten to the
// upstream, the redeemed dsh auth cookie when there is one. Never reached by a browser request.
import { randomBytes } from 'node:crypto';
import type http from 'node:http';
import type { WorkspaceRpc } from './seat-home.js';

/** How the gateway reaches dsh, as `createGatewayServer` already computed it. */
export interface DshUpstream {
  transport: { request: typeof http.request };
  host: string;
  port: number;
  /** `host:port` as the Host header. */
  authority: string;
  scheme: 'http' | 'https';
  agent: http.Agent;
  /** The redeemed dsh-auth cookie pair, or '' (read at call time: the plugin may refresh it). */
  authCookie: () => string;
}

const RPC_TIMEOUT_MS = 10_000;

export function createDshRpc(upstream: DshUpstream): WorkspaceRpc {
  return (endpoint, args) =>
    new Promise((resolve, reject) => {
      const rpcId = randomBytes(16).toString('hex');
      const body = JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload: { args } });
      const headers: Record<string, string> = {
        host: upstream.authority,
        origin: `${upstream.scheme}://${upstream.authority}`,
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body)),
      };
      const cookie = upstream.authCookie();
      if (cookie !== '') headers.cookie = cookie;
      const request = upstream.transport.request(
        {
          hostname: upstream.host,
          port: upstream.port,
          path: `/api/${endpoint}`,
          method: 'POST',
          headers,
          agent: upstream.agent,
          timeout: RPC_TIMEOUT_MS,
        },
        (answer) => {
          const chunks: Buffer[] = [];
          answer.on('data', (chunk: Buffer) => chunks.push(chunk));
          answer.on('end', () => {
            const status = answer.statusCode ?? 0;
            if (status < 200 || status >= 300) {
              resolve({ ok: false, error: { code: 'transport', message: `dsh answered HTTP ${String(status)} to ${endpoint}` } });
              return;
            }
            try {
              const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
                type?: unknown;
                rpcId?: unknown;
                result?: { ok?: unknown; value?: unknown; error?: { code?: unknown; message?: unknown } };
              };
              if (parsed.type !== 'server-response' || parsed.rpcId !== rpcId || typeof parsed.result !== 'object' || parsed.result === null) {
                resolve({ ok: false, error: { code: 'envelope', message: `dsh answered ${endpoint} outside the connection envelope` } });
                return;
              }
              if (parsed.result.ok === true) {
                resolve({ ok: true, value: parsed.result.value });
                return;
              }
              resolve({
                ok: false,
                error: {
                  code: typeof parsed.result.error?.code === 'string' ? parsed.result.error.code : 'unknown',
                  message: typeof parsed.result.error?.message === 'string' ? parsed.result.error.message : '',
                },
              });
            } catch (error) {
              resolve({ ok: false, error: { code: 'envelope', message: error instanceof Error ? error.message : String(error) } });
            }
          });
        },
      );
      request.on('error', reject);
      request.on('timeout', () => request.destroy(new Error(`dsh did not answer ${endpoint} in time`)));
      request.end(body);
    });
}
