/**
 * `POST /_host/emdash-media` — one picture into an EmDash site's media library, for a caller that holds
 * the bytes but no EmDash token: tracy-web's Apply door `media.upload` on an EmDash site (a Website
 * Opportunity hand-off places the restaurant's own photographs this way on Joomla and WordPress too).
 *
 * 🔒 THE TOKEN NEVER LEAVES THE SITE'S CONTAINER. The call is the site's own `media_upload` MCP tool, made
 * by the container's node as root with the agent token it reads from its root-only mount — the same
 * script and custody `tracy_emdash` uses (`tracy-site-tools` `exec.mjs` `MCP_SCRIPT`). tracy-web keeps
 * only its read-only `content:read` PAT (ADR 0020); this host hands back `{id, url}`, never a token.
 *
 * 🔒 THE SCRIPT IS A COPY, HELD IN STEP BY A TEST. The site tools live in the dsh image; this image copies
 * only `apps/tracy-host/src` (`Dockerfile`), as `look-css.js` says for its PHP. `test/emdash-media.test.mjs`
 * imports both and fails when they differ.
 *
 * 🔒 ONE SITE, ONE PICTURE. The label passed `SAFE_LABEL` at the route; the site must be EmDash
 * (`siteShape`); only a PNG, JPEG or WebP whose header says so, at most 8 MiB, with a plain file name.
 */
import path from 'node:path'
import { siteShape } from './webroot.js'

/** Where the site's agent token is mounted, root-owned and read-only (`exec.mjs` `AGENT_TOKEN_PATH`). */
const AGENT_TOKEN_PATH = '/run/tracy-agent.token'
/** The EmDash MCP endpoint, on loopback inside the container (`exec.mjs` `EMDASH_MCP_LOOPBACK`). */
const EMDASH_MCP_LOOPBACK = 'http://127.0.0.1:4321/_emdash/api/mcp'
/** The in-container fetch aborts itself first (`exec.mjs` `MCP_FETCH_ABORT_MS`). */
const MCP_FETCH_ABORT_MS = 110_000
/** The docker client's own bound: the script's plus room to answer. */
const MCP_EXEC_TIMEOUT_MS = 120_000

/** The most one upload carries: the components' `MAX_MEDIA_BYTES`, as `media.upload {file}` (`upload.mjs`). */
export const EMDASH_MEDIA_MAX_BYTES = 8_388_608

/** A copy of `exec.mjs` `MCP_TOKEN_PRELUDE` — see the module comment. */
const MCP_TOKEN_PRELUDE =
  'const fs=require("fs");let t="";' +
  `try{t=fs.readFileSync(${JSON.stringify(AGENT_TOKEN_PATH)},"utf8").trim()}` +
  'catch{process.stdout.write("TRACY_MCP_ERR NO_TOKEN the agent token file is not present");process.exit(0)}' +
  'if(!/^ec_pat_[A-Za-z0-9_-]{16,}$/.test(t)){process.stdout.write("TRACY_MCP_ERR NO_TOKEN the agent token file is malformed");process.exit(0)}' +
  'const red=s=>String(s).split(t).join("[REDACTED]");'

/** A copy of `exec.mjs` `MCP_SCRIPT`: the JSON-RPC body on stdin, `TRACY_MCP <status>\n<body>` out. */
export const MCP_SCRIPT =
  MCP_TOKEN_PRELUDE +
  'let b="";process.stdin.on("data",d=>b+=d);process.stdin.on("end",()=>{' +
  `fetch(${JSON.stringify(EMDASH_MCP_LOOPBACK)},{method:"POST",redirect:"error",signal:AbortSignal.timeout(${MCP_FETCH_ABORT_MS}),` +
  'headers:{authorization:"Bearer "+t,"content-type":"application/json",' +
  'accept:"application/json, text/event-stream","X-EmDash-Request":"1"},body:b})' +
  '.then(r=>r.text().then(x=>process.stdout.write("TRACY_MCP "+r.status+"\\n"+red(x))))' +
  '.catch(e=>process.stdout.write("TRACY_MCP_ERR SITE "+red((e&&e.message)||String(e))))});'

/** The docker argv that runs {@link MCP_SCRIPT} in a site's web container (`exec.mjs` `mcpArgv`). */
export function mcpArgv(container) {
  return ['exec', '-i', '-u', '0', container, 'node', '-e', MCP_SCRIPT]
}

const TYPES = {
  'image/png': (b) =>
    b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) =>
    b.length > 12 &&
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP'
}
/** A plain file name: no folder, no leading dot, a picture extension. */
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(png|jpe?g|webp)$/i
const ITEM_ID = /^[\p{L}\p{N}._:-]{1,128}$/u
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

const refuse = (code, detail) => ({ ok: false, code, ...(detail ? { detail } : {}) })

/** The JSON-RPC reply in a body that may be an event stream (`emdash.mjs` `parseMcpBody`: the last `data:` line). */
function replyOf(body) {
  const text = String(body ?? '').trim()
  const data = text
    .split(/\r?\n/)
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .filter((l) => l !== '')
  try {
    return JSON.parse(data.length > 0 ? data[data.length - 1] : text)
  } catch {
    return null
  }
}

/** What the tool answered: its structured content, else the JSON in its text parts. */
function dataOf(result) {
  if (result?.structuredContent && typeof result.structuredContent === 'object')
    return result.structuredContent
  const text = (Array.isArray(result?.content) ? result.content : [])
    .filter((p) => p?.type === 'text')
    .map((p) => String(p.text ?? ''))
    .join('\n')
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * @param {{ body: { label: string, filename?: unknown, contentType?: unknown, base64?: unknown, alt?: unknown },
 *   config: { privateRoot: string }, run: Function }} input
 * @returns {Promise<{ ok: true, id: string, url: string | null, deduplicated: boolean }
 *   | { ok: false, code: string, detail?: string }>}
 */
export async function emdashMediaUpload({ body, config, run }) {
  const label = String(body.label)
  const { filename, contentType, base64, alt } = body
  if (typeof filename !== 'string' || !FILE_NAME.test(filename)) return refuse('BAD_PICTURE', 'filename')
  const looksRight = typeof contentType === 'string' ? TYPES[contentType] : undefined
  if (!looksRight) return refuse('BAD_PICTURE', 'contentType: image/png, image/jpeg or image/webp')
  if (typeof base64 !== 'string' || base64 === '' || !BASE64.test(base64))
    return refuse('BAD_PICTURE', 'base64')
  if (Math.floor((base64.length * 3) / 4) > EMDASH_MEDIA_MAX_BYTES + 2) return refuse('TOO_LARGE')
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length > EMDASH_MEDIA_MAX_BYTES) return refuse('TOO_LARGE')
  if (!looksRight(bytes)) return refuse('BAD_PICTURE', `the bytes are not ${contentType}`)
  if ((await siteShape(path.join(config.privateRoot, label))) !== 'emdash') return refuse('NOT_EMDASH')

  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'media_upload',
      arguments: {
        filename,
        contentType,
        base64,
        ...(typeof alt === 'string' && alt.trim() ? { alt: alt.trim().slice(0, 500) } : {})
      }
    }
  }
  const container = `${label}-web-1`
  const ran = await run({
    script: 'docker',
    args: mcpArgv(container),
    env: process.env,
    stdin: JSON.stringify(request),
    timeoutMs: MCP_EXEC_TIMEOUT_MS
  })
  const out = (ran?.tail ?? []).join('\n')
  const start = out.search(/TRACY_MCP(_ERR)? /)
  if (start === -1)
    return refuse(
      'SITE_UNREACHABLE',
      `${container}: ${ran?.spawnError ?? (ran?.timedOut ? 'timed out' : 'no answer')}`
    )
  const said = out.slice(start)
  if (said.startsWith('TRACY_MCP_ERR ')) {
    const raw = said.slice('TRACY_MCP_ERR '.length).trim()
    return raw.startsWith('NO_TOKEN')
      ? refuse('NO_TOKEN', raw.replace(/^NO_TOKEN\s*/, '').slice(0, 200))
      : refuse('SITE_UNREACHABLE', raw.replace(/^SITE\s*/, '').slice(0, 200))
  }
  const nl = said.indexOf('\n')
  const status = Number(said.slice('TRACY_MCP '.length, nl === -1 ? undefined : nl).trim())
  const replyBody = nl === -1 ? '' : said.slice(nl + 1)
  if (!(status >= 200 && status < 300))
    return refuse('SITE_REFUSED', `HTTP ${status}: ${replyBody.slice(0, 200)}`)
  const reply = replyOf(replyBody)
  if (!reply) return refuse('NOT_MCP', replyBody.slice(0, 200))
  if (reply.error) return refuse('TOOL_FAILED', String(reply.error.message ?? 'JSON-RPC error').slice(0, 200))
  if (reply.result?.isError === true)
    return refuse(
      'TOOL_FAILED',
      (Array.isArray(reply.result.content) ? reply.result.content : [])
        .map((p) => String(p?.text ?? ''))
        .join(' ')
        .slice(0, 200)
    )
  const data = dataOf(reply.result)
  const item = data?.item ?? data
  if (typeof item?.id !== 'string' || !ITEM_ID.test(item.id)) return refuse('NO_ITEM')
  return {
    ok: true,
    id: item.id,
    url: typeof item.url === 'string' ? item.url : null,
    deduplicated: data?.deduplicated === true
  }
}

const STATUS = {
  BAD_PICTURE: 400,
  TOO_LARGE: 413,
  NOT_EMDASH: 404,
  NO_TOKEN: 409,
  NO_ITEM: 502,
  NOT_MCP: 502,
  TOOL_FAILED: 422,
  SITE_REFUSED: 502,
  SITE_UNREACHABLE: 502
}

/** The route: `{label, filename, contentType, base64, alt?}` → the item, or the refusal with its status. */
export function emdashMediaRoute({ config, run, safeLabel }) {
  return async (c) => {
    let body
    try {
      body = JSON.parse(c.get('rawBody') || '{}')
    } catch {
      return c.json({ code: 'BAD_REQUEST', detail: 'not json' }, 400)
    }
    if (!body?.label || !safeLabel.test(String(body.label)))
      return c.json({ code: 'BAD_REQUEST', detail: 'refused label' }, 400)
    const done = await emdashMediaUpload({ body, config, run })
    if (done.ok) return c.json(done)
    return c.json(done, STATUS[done.code] ?? 500)
  }
}
