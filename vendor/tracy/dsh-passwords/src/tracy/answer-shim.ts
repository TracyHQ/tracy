/**
 * H3's adapter: hold back the whole answer the proxy writes for one request, so the policy reads
 * it parsed and decides before the client receives a byte (plan §1 rule 5: "after parse, before
 * the body is sent"). Installed on `res` before the upstream request exists, it sees every way
 * upstream's proxy answers — `writeHead`/`write`/`end`, `pipe`, Express `send` — and needs no
 * change in any of upstream's per-door branches.
 *
 * Only a 2xx answer is filtered; a refusal the gateway itself wrote (403 page, 413, 502, 504) and
 * a non-2xx answer from dsh pass as they are. An answer of any status larger than `maxBytes`, and a
 * 2xx answer that cannot be decoded or is not JSON, is answered 502 with no byte of it
 * (fail-closed, never piped raw). While held, `res.headersSent` reads true once a head was
 * written, as it would without the hold, so upstream's "headers already sent" branches behave.
 */
import type { OutgoingHttpHeaders, ServerResponse } from 'node:http';
import zlib from 'node:zlib';

export type AnswerFilterResult = { kind: 'answer'; value: unknown } | { kind: 'deny'; status: number; reason: string };

type Header = number | string | string[];

/** Hold `res` until its answer is complete, then send what `filter` returns instead. */
export function holdAnswer(res: ServerResponse, maxBytes: number, filter: (value: unknown) => AnswerFilterResult): void {
  const writeHead = res.writeHead.bind(res) as (status: number, headers?: OutgoingHttpHeaders) => ServerResponse;
  const end = res.end.bind(res) as (chunk?: unknown) => ServerResponse;
  let status = 200;
  let headStatus: number | null = null;
  const extraHeaders: OutgoingHttpHeaders = {};
  const chunks: Buffer[] = [];
  let size = 0;
  let finished = false;

  const sendPlain = (code: number, text: string): void => {
    finished = true;
    for (const name of res.getHeaderNames()) res.removeHeader(name);
    writeHead(code, { 'content-type': 'text/plain; charset=utf-8', 'content-length': String(Buffer.byteLength(text)) });
    end(text);
  };

  const toBuffer = (chunk: unknown, encoding?: unknown): Buffer | null => {
    if (chunk === undefined || chunk === null || typeof chunk === 'function') return null;
    if (Buffer.isBuffer(chunk)) return chunk;
    if (chunk instanceof Uint8Array) return Buffer.from(chunk);
    return Buffer.from(String(chunk), typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8');
  };

  const take = (chunk: unknown, encoding?: unknown): void => {
    const buffer = toBuffer(chunk, encoding);
    if (buffer === null || finished) return;
    size += buffer.length;
    if (size > maxBytes) {
      sendPlain(502, '502 Upstream response too large');
      return;
    }
    chunks.push(buffer);
  };

  const finish = (): void => {
    if (finished) return;
    finished = true;
    const headers: Record<string, Header> = {};
    for (const [name, value] of Object.entries(res.getHeaders())) if (value !== undefined) headers[name.toLowerCase()] = value;
    for (const [name, value] of Object.entries(extraHeaders)) if (value !== undefined) headers[name.toLowerCase()] = value;
    const raw = Buffer.concat(chunks);
    if (status < 200 || status >= 300) {
      for (const name of res.getHeaderNames()) res.removeHeader(name);
      writeHead(status, headers);
      end(raw);
      return;
    }
    let value: unknown;
    try {
      const encoding = String(headers['content-encoding'] ?? '').toLowerCase();
      const body = encoding.includes('gzip') ? zlib.gunzipSync(raw, { maxOutputLength: maxBytes }) : raw;
      if (encoding !== '' && !encoding.includes('gzip') && encoding !== 'identity') throw new Error('unknown encoding');
      value = JSON.parse(body.toString('utf8'));
    } catch {
      finished = false;
      sendPlain(502, '502 Upstream response unprocessable');
      return;
    }
    const verdict = filter(value);
    if (verdict.kind === 'deny') {
      finished = false;
      sendPlain(verdict.status, `${String(verdict.status)} ${verdict.reason}`);
      return;
    }
    const out = Buffer.from(JSON.stringify(verdict.value), 'utf8');
    for (const name of res.getHeaderNames()) res.removeHeader(name);
    delete headers['content-encoding'];
    delete headers['transfer-encoding'];
    headers['content-length'] = String(out.length);
    headers['content-type'] = 'application/json; charset=utf-8';
    writeHead(status, headers);
    end(out);
  };

  Object.defineProperty(res, 'headersSent', {
    configurable: true,
    get: () => headStatus !== null || finished,
  });
  const shim = res as unknown as Record<string, unknown>;
  shim.writeHead = (code: number, ...rest: unknown[]): ServerResponse => {
    headStatus = code;
    const headers = rest.find((item) => typeof item === 'object' && item !== null);
    if (headers !== undefined) {
      if (Array.isArray(headers)) {
        for (let i = 0; i + 1 < headers.length; i += 2) extraHeaders[String(headers[i]).toLowerCase()] = headers[i + 1] as Header;
      } else {
        for (const [name, value] of Object.entries(headers as OutgoingHttpHeaders)) extraHeaders[name.toLowerCase()] = value;
      }
    }
    return res;
  };
  shim.write = (chunk: unknown, encoding?: unknown, callback?: unknown): boolean => {
    take(chunk, encoding);
    const done = [encoding, callback].find((item) => typeof item === 'function') as (() => void) | undefined;
    if (done !== undefined) process.nextTick(done);
    return true;
  };
  shim.end = (chunk?: unknown, encoding?: unknown, callback?: unknown): ServerResponse => {
    const done = [chunk, encoding, callback].find((item) => typeof item === 'function') as (() => void) | undefined;
    if (finished) {
      if (done !== undefined) process.nextTick(done);
      return res;
    }
    // Express `send` sets the status on `res.statusCode` and writes no head of its own.
    status = headStatus ?? res.statusCode;
    take(chunk, encoding);
    finish();
    if (done !== undefined) process.nextTick(done);
    return res;
  };
}
