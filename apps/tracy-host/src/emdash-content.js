/**
 * `POST /_host/emdash-content` — a short list of the site's own MCP tool calls on an EmDash site's entries, menus,
 * settings and terms, for tracy-web's Apply door: `content.contract` on an EmDash site (`sites/emdash-contract.js`),
 * the write step of a step chain build. EmDash has no Tracy component, so its content is written through its own MCP
 * server, as `media.upload` is (`emdash-media.js`).
 *
 * 🔒 THE TOKEN NEVER LEAVES THE SITE'S CONTAINER. One `docker exec` runs {@link BATCH_SCRIPT} in the site's web
 * container as root: it reads the agent token from its root-only mount (`emdash-media.js` `MCP_TOKEN_PRELUDE`) and
 * makes the calls one after another on the container's loopback, the way `tracy_emdash` does. Only the answers come
 * back, with the token redacted. tracy-web keeps only its read-only `content:read` PAT (ADR 0020).
 *
 * 🔒 ONLY THESE TOOLS, ON ONE SITE. {@link CONTENT_TOOLS} names what a contract write needs and nothing more: no
 * schema, no deletion, no import, no user or plugin tool, and of the media library only its two reads (a picture the
 * write names is found by file name; it is uploaded through `emdash-media.js`). The label passed `SAFE_LABEL` at the route; the site must be
 * EmDash (`siteShape`); at most {@link MAX_CALLS} calls and {@link MAX_BODY_BYTES} of arguments per request.
 */
import path from 'node:path'
import { dataOf, EMDASH_MCP_LOOPBACK, MCP_TOKEN_PRELUDE, replyOf } from './emdash-media.js'
import { siteShape } from './webroot.js'

/** The site's own MCP tools a contract read or write may call. */
export const CONTENT_TOOLS = Object.freeze(
  new Set([
    'content_get',
    'content_list',
    'content_update',
    'content_publish',
    'content_unpublish',
    'media_get',
    'media_list',
    'menu_get',
    'menu_set_items',
    'settings_get',
    'settings_update',
    'taxonomy_list_terms',
    'taxonomy_update_term'
  ])
)
/** The most calls one request makes: a JA Diner contract read is about 60 entries, its write one update per entry. */
export const MAX_CALLS = 200
/** The most argument bytes one request carries (words, never pictures: those go through `emdash-media`). */
export const MAX_BODY_BYTES = 4 * 1024 * 1024
/** Each call's own bound inside the container, and the docker client's bound for the whole list. */
const CALL_ABORT_MS = 110_000
const EXEC_TIMEOUT_MS = 10 * 60_000

/**
 * The in-container script: a JSON array of JSON-RPC requests on stdin, each posted in order to the site's MCP with
 * the agent token, then `TRACY_MCP_BATCH <json array of {status, body}>` out, the token redacted. A call that throws
 * is `{status: 0, body: <message>}`, and the next call is still made: the caller reads each answer on its own.
 */
export const BATCH_SCRIPT =
  MCP_TOKEN_PRELUDE +
  'let b="";process.stdin.on("data",d=>b+=d);process.stdin.on("end",async()=>{' +
  'let calls=[];try{calls=JSON.parse(b)}catch{process.stdout.write("TRACY_MCP_ERR SITE the call list is not JSON");return}' +
  'const out=[];for(const c of calls){try{' +
  `const r=await fetch(${JSON.stringify(EMDASH_MCP_LOOPBACK)},{method:"POST",redirect:"error",signal:AbortSignal.timeout(${CALL_ABORT_MS}),` +
  'headers:{authorization:"Bearer "+t,"content-type":"application/json",' +
  'accept:"application/json, text/event-stream","X-EmDash-Request":"1"},body:JSON.stringify(c)});' +
  'out.push({status:r.status,body:red(await r.text())})' +
  '}catch(e){out.push({status:0,body:red((e&&e.message)||String(e))})}}' +
  'process.stdout.write("TRACY_MCP_BATCH "+JSON.stringify(out))});'

/** The docker argv that runs {@link BATCH_SCRIPT} in a site's web container. */
export function batchArgv(container) {
  return ['exec', '-i', '-u', '0', container, 'node', '-e', BATCH_SCRIPT]
}

const refuse = (code, detail) => ({ ok: false, code, ...(detail ? { detail } : {}) })
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

/** Why a call list cannot be sent, or null. */
export function callsProblem(calls) {
  if (!Array.isArray(calls) || calls.length === 0) return 'calls: a non-empty list'
  if (calls.length > MAX_CALLS) return `calls: at most ${MAX_CALLS}`
  for (const [i, c] of calls.entries()) {
    if (!isObject(c) || typeof c.tool !== 'string') return `calls[${i}]: {tool, args}`
    if (!CONTENT_TOOLS.has(c.tool)) return `calls[${i}].tool: ${JSON.stringify(c.tool)} is not a content tool`
    if (c.args !== undefined && !isObject(c.args)) return `calls[${i}].args: an object`
  }
  if (Buffer.byteLength(JSON.stringify(calls)) > MAX_BODY_BYTES)
    return `calls: at most ${MAX_BODY_BYTES} bytes`
  return null
}

/** One call's answer: `{ok: true, data}` or `{ok: false, code, detail}`, read as `emdash-media.js` reads its one. */
function answerOf({ status, body }) {
  if (status === 0) return refuse('SITE_UNREACHABLE', String(body).slice(0, 200))
  if (!(status >= 200 && status < 300))
    return refuse('SITE_REFUSED', `HTTP ${status}: ${String(body).slice(0, 200)}`)
  const reply = replyOf(body)
  if (!reply) return refuse('NOT_MCP', String(body).slice(0, 200))
  if (reply.error) return refuse('TOOL_FAILED', String(reply.error.message ?? 'JSON-RPC error').slice(0, 300))
  if (reply.result?.isError === true)
    return refuse(
      'TOOL_FAILED',
      (Array.isArray(reply.result.content) ? reply.result.content : [])
        .map((p) => String(p?.text ?? ''))
        .join(' ')
        .slice(0, 300)
    )
  return { ok: true, data: dataOf(reply.result) }
}

/**
 * @param {{ body: { label: string, calls?: unknown }, config: { privateRoot: string }, run: Function }} input
 * @returns {Promise<{ ok: true, results: ({ ok: true, data: any } | { ok: false, code: string, detail?: string })[] }
 *   | { ok: false, code: string, detail?: string }>}
 */
export async function emdashContentCalls({ body, config, run }) {
  const label = String(body.label)
  const problem = callsProblem(body.calls)
  if (problem) return refuse('BAD_REQUEST', problem)
  if ((await siteShape(path.join(config.privateRoot, label))) !== 'emdash') return refuse('NOT_EMDASH')
  const calls = /** @type {{tool: string, args?: object}[]} */ (body.calls)
  const requests = calls.map((c, i) => ({
    jsonrpc: '2.0',
    id: i + 1,
    method: 'tools/call',
    params: { name: c.tool, arguments: c.args ?? {} }
  }))
  const container = `${label}-web-1`
  const ran = await run({
    script: 'docker',
    args: batchArgv(container),
    env: process.env,
    stdin: JSON.stringify(requests),
    timeoutMs: EXEC_TIMEOUT_MS
  })
  const out = (ran?.tail ?? []).join('\n')
  const start = out.search(/TRACY_MCP(_ERR|_BATCH)? /)
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
  let answers
  try {
    answers = JSON.parse(said.slice('TRACY_MCP_BATCH '.length))
  } catch {
    return refuse('NOT_MCP', 'the call list answered no list')
  }
  if (!Array.isArray(answers) || answers.length !== calls.length)
    return refuse('NOT_MCP', `${answers?.length ?? 0} answers to ${calls.length} calls`)
  return { ok: true, results: answers.map(answerOf) }
}

const STATUS = { BAD_REQUEST: 400, NOT_EMDASH: 404, NO_TOKEN: 409, NOT_MCP: 502, SITE_UNREACHABLE: 502 }

/** The route: `{label, calls: [{tool, args}]}` → `{ok, results}` in the order asked, or the refusal with its status. */
export function emdashContentRoute({ config, run, safeLabel }) {
  return async (c) => {
    let body
    try {
      body = JSON.parse(c.get('rawBody') || '{}')
    } catch {
      return c.json({ code: 'BAD_REQUEST', detail: 'not json' }, 400)
    }
    if (!body?.label || !safeLabel.test(String(body.label)))
      return c.json({ code: 'BAD_REQUEST', detail: 'refused label' }, 400)
    const done = await emdashContentCalls({ body, config, run })
    if (done.ok) return c.json(done)
    return c.json(done, STATUS[done.code] ?? 500)
  }
}
