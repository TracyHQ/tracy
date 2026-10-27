#!/usr/bin/env node
// Give a new EmDash site its mail path through the Tracy relay (#803).
//
// An EmDash site sends mail through the emdash-smtp plugin, and its "PHP Mail / local sendmail"
// provider (`phpmail`) spawns `sendmail` from PATH — the tracy-sendmail shim in Tracy's web image,
// which hands the message to tracy-web. Until this step existed nothing chose that provider, set a
// sender or selected emdash-smtp for EmDash's exclusive `email:deliver` hook, so a site stored its
// form submissions and mailed nobody.
//
//   node configure-mail.mjs --origin http://127.0.0.1:<port> --token-file <site>/tracy-agent.token
//        [--sender <address>]
//
// Run by platform/emdash.sh ON THE HOST, from the fleet's own scripts, against the site's loopback
// port (or, on the macOS stack, the web container's own docker-network address) — never copied into
// the site's /app, which the site's agent can write.
//
// What it does, in this order, and nothing else:
//   1. reads the exclusive hook list and emdash-smtp's global settings form;
//   2. ADDS what is missing — primary provider `phpmail`, the sender, the hook selection. A provider,
//      sender or any other field that is already set is kept; another plugin already chosen for
//      `email:deliver` is left alone with no write at all;
//   3. reads everything back and compares it with what it meant to leave.
// It sends no test message and touches no provider form, so no secret is ever read or resent.
//
// It REFUSES (exit 1, one line on stderr, no secret in it) instead of guessing: an answer that is
// not the shape below, a redirect, a timeout, a missing plugin or provider, a site with no sender
// when none was passed. The API offers no transaction, so a failure after the first write leaves
// that write in place; the next run reads the state and finishes only what is left.
//
// The PAT is read from the file — a small regular file, opened without following a symlink and
// without blocking — and travels only in the Authorization header of requests to --origin.
// Exit: 0 configured and read back · 1 refused or failed · 2 bad arguments.
import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const PLUGIN_ID = 'emdash-smtp'
export const RELAY_PROVIDER_ID = 'phpmail'
export const DELIVER_HOOK = 'email:deliver'

const HOOKS_PATH = '/_emdash/api/admin/hooks/exclusive'
const ADMIN_PATH = `/_emdash/api/plugins/${PLUGIN_ID}/admin`
const FORM_ID = 'global-settings'
// The six values `save_global` stores. It REPLACES all of them, so every one is resent, and a form
// with any other field is a version this file does not know how to save without losing something.
const FIELD_TYPES = {
  primaryProviderId: 'select',
  fallbackProviderId: 'select',
  fromEmail: 'text_input',
  fromName: 'text_input',
  replyTo: 'text_input',
  logLevel: 'select'
}
const FIELD_KEYS = Object.keys(FIELD_TYPES)
const TOKEN_RE = /^ec_pat_[A-Za-z0-9_-]{16,}$/
const TOKEN_MAX_BYTES = 512
const BODY_MAX_CHARS = 2_000_000
export const DEFAULT_TIMEOUT_MS = 15_000

export class MailConfigError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}
const refuse = (code, message) => {
  throw new MailConfigError(code, message)
}
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

/** `--name value` pairs only: each known flag at most once, each with a non-empty value. */
export function parseArgs(argv) {
  const names = { '--origin': 'origin', '--token-file': 'tokenFile', '--sender': 'sender' }
  const out = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = Object.hasOwn(names, argv[i]) ? names[argv[i]] : undefined
    if (!key) refuse('USAGE', 'unknown argument')
    if (Object.hasOwn(out, key)) refuse('USAGE', `${argv[i]} was passed twice`)
    const value = argv[i + 1]
    if (typeof value !== 'string' || value === '' || value.startsWith('--'))
      refuse('USAGE', `${argv[i]} needs a value`)
    out[key] = value
  }
  if (!out.origin || !out.tokenFile) refuse('USAGE', '--origin and --token-file are required')
  return { origin: out.origin, tokenFile: out.tokenFile, sender: out.sender }
}

/**
 * The site's own address and nothing else: the PAT is never sent off this machine. That is the
 * site's published loopback port, or — where the caller is itself a container on a bridge (the
 * macOS stack), whose loopback is its own — the web container's private IPv4 on the docker network,
 * read by platform/emdash.sh from `docker inspect`. A NAME is never accepted (`localhost` aside): a
 * lookup would decide where the PAT goes. A public address is never accepted either.
 */
export function normalizeOrigin(origin) {
  const m =
    typeof origin === 'string'
      ? /^http:\/\/([0-9.]{7,15}|localhost|\[::1\]):([1-9][0-9]{0,4})$/.exec(origin)
      : null
  if (!m || Number(m[2]) > 65535 || !isOwnAddress(m[1]))
    refuse('BAD_ORIGIN', 'the origin must be http://127.0.0.1:<port> or the web container private address')
  return origin
}

/** `localhost`, `[::1]`, 127.0.0.1, or a canonical dotted quad in 10/8, 172.16/12 or 192.168/16. */
function isOwnAddress(host) {
  if (host === 'localhost' || host === '[::1]' || host === '127.0.0.1') return true
  const q = /^(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})$/.exec(host)
  if (!q) return false
  const [a, b, c, d] = q.slice(1).map(Number)
  if (a > 255 || b > 255 || c > 255 || d > 255) return false
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

/** One plain address. No display name, no list, no whitespace or control character (header injection). */
export function validateSender(sender) {
  const local = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+"
  const label = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?'
  const re = new RegExp(`^${local}(?:\\.${local})*@${label}(?:\\.${label})+$`)
  if (typeof sender !== 'string' || sender.length > 254 || sender.indexOf('@') > 64 || !re.test(sender)) {
    refuse('BAD_SENDER', 'the sender is not a plain email address')
  }
  return sender
}

export function validateToken(token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token))
    refuse('BAD_TOKEN', 'the agent token is missing or not the minted shape')
  return token
}

/**
 * The PAT from the site's private file. O_NOFOLLOW refuses a symlink at the path, O_NONBLOCK keeps a
 * FIFO from hanging the open, and the fstat is on the descriptor that was opened.
 */
export function readToken(file) {
  let fd
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch {
    refuse('BAD_TOKEN', 'the agent token file is missing, unreadable or a symlink')
  }
  try {
    const st = fstatSync(fd)
    if (!st.isFile()) refuse('BAD_TOKEN', 'the agent token file is not a regular file')
    if (st.size === 0 || st.size > TOKEN_MAX_BYTES)
      refuse('BAD_TOKEN', 'the agent token file is empty or too large')
    const buf = Buffer.alloc(TOKEN_MAX_BYTES + 1)
    let n
    try {
      n = readSync(fd, buf, 0, buf.length, 0)
    } catch {
      refuse('BAD_TOKEN', 'the agent token file could not be read')
    }
    return validateToken(buf.toString('utf8', 0, n).replace(/\n$/, ''))
  } finally {
    closeSync(fd)
  }
}

/** A short code EmDash put in an error envelope, when it is one: never the message, never a body. */
function errorCode(body) {
  const code = isRecord(body) && isRecord(body.error) ? body.error.code : undefined
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,47}$/.test(code) ? ` (${code})` : ''
}

/**
 * One request, one `data` object back — or a refusal. A redirect is never followed, and the timeout
 * rejects even when the transport ignores the abort signal, so a late answer resumes nothing.
 */
export async function request(ctx, method, path, body) {
  const what = `${method} ${path}`
  const controller = new AbortController()
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new MailConfigError('TIMEOUT', `${what} did not answer in ${ctx.timeoutMs} ms`))
    }, ctx.timeoutMs)
  })
  const exchange = async () => {
    let res
    let text
    try {
      res = await ctx.fetch(`${ctx.origin}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${ctx.token}`,
          'X-EmDash-Request': '1',
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'manual',
        signal: controller.signal
      })
      if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
        refuse('REDIRECT', `${what} answered with a redirect — not followed`)
      }
      text = await res.text()
    } catch (err) {
      if (err instanceof MailConfigError) throw err
      // The transport's own message is not repeated: it is not ours to vouch for.
      refuse('NETWORK', `${what} could not reach the site`)
    }
    let parsed
    try {
      parsed = text.length > 0 && text.length <= BODY_MAX_CHARS ? JSON.parse(text) : undefined
    } catch {
      parsed = undefined
    }
    if (res.status === 401 || res.status === 403)
      refuse('AUTH', `${what} was refused: HTTP ${res.status}${errorCode(parsed)}`)
    if (res.status === 404)
      refuse('NOT_FOUND', `${what} is not a route of this site: HTTP 404${errorCode(parsed)}`)
    if (res.status !== 200) refuse('HTTP', `${what} answered HTTP ${res.status}${errorCode(parsed)}`)
    if (!isRecord(parsed)) refuse('BAD_RESPONSE', `${what} did not answer with a JSON object`)
    if (parsed.success !== true || 'error' in parsed) {
      if (parsed.success === false || 'error' in parsed)
        refuse('API_ERROR', `${what} answered with an error${errorCode(parsed)}`)
      refuse('BAD_RESPONSE', `${what} answered without a success flag`)
    }
    if (!isRecord(parsed.data)) refuse('BAD_RESPONSE', `${what} answered without data`)
    return parsed.data
  }
  try {
    return await Promise.race([exchange(), timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** The one `email:deliver` row of the exclusive hook list: its providers and the current selection. */
async function readHook(ctx) {
  const data = await request(ctx, 'GET', HOOKS_PATH)
  if (!Array.isArray(data.items) || !data.items.every(isRecord))
    refuse('UNKNOWN_STATE', 'the exclusive hook list has an unknown shape')
  const rows = data.items.filter((item) => item.hookName === DELIVER_HOOK)
  if (rows.length === 0)
    refuse('NO_PLUGIN', `this site registers no ${DELIVER_HOOK} hook — no mail plugin is installed`)
  if (rows.length > 1) refuse('UNKNOWN_STATE', `the exclusive hook list names ${DELIVER_HOOK} more than once`)
  const [row] = rows
  if (
    !Array.isArray(row.providers) ||
    !row.providers.every((p) => isRecord(p) && typeof p.pluginId === 'string' && p.pluginId !== '')
  ) {
    refuse('UNKNOWN_STATE', `the providers of ${DELIVER_HOOK} have an unknown shape`)
  }
  const providers = row.providers.map((p) => p.pluginId)
  const selected = row.selectedPluginId
  if (selected !== null && (typeof selected !== 'string' || !providers.includes(selected))) {
    refuse('UNKNOWN_STATE', `the selection of ${DELIVER_HOOK} is not one of its providers`)
  }
  return { providers, selected }
}

/** emdash-smtp's global settings, read off the one form its providers page renders. */
async function readSettings(ctx) {
  const data = await request(ctx, 'POST', ADMIN_PATH, { type: 'page_load', page: '/providers' })
  return settingsOf(data)
}

function settingsOf(data) {
  const unknown = (why) => refuse('UNKNOWN_STATE', `the ${PLUGIN_ID} settings form ${why}`)
  if (!Array.isArray(data.blocks)) unknown('is missing')
  const forms = data.blocks.filter(
    (block) => isRecord(block) && block.type === 'form' && block.block_id === FORM_ID
  )
  if (forms.length !== 1) unknown(forms.length === 0 ? 'is missing' : 'appears more than once')
  const fields = forms[0].fields
  if (!Array.isArray(fields) || !fields.every(isRecord)) unknown('has no readable fields')
  const seen = fields.map((field) => field.action_id)
  if (
    seen.length !== FIELD_KEYS.length ||
    !FIELD_KEYS.every((key) => seen.filter((id) => id === key).length === 1)
  ) {
    unknown('does not have exactly the six known fields')
  }
  const values = {}
  const options = {}
  for (const field of fields) {
    const key = field.action_id
    if (field.type !== FIELD_TYPES[key]) unknown(`has an unknown type for ${key}`)
    if (field.initial_value !== undefined && typeof field.initial_value !== 'string')
      unknown(`has a non-text value for ${key}`)
    const value = (field.initial_value ?? '').trim()
    values[key] = value === '' ? undefined : value
    if (field.type !== 'select') continue
    if (
      !Array.isArray(field.options) ||
      !field.options.every((o) => isRecord(o) && typeof o.value === 'string')
    ) {
      unknown(`has no readable options for ${key}`)
    }
    options[key] = field.options.map((o) => o.value)
    if (values[key] !== undefined && !options[key].includes(values[key]))
      unknown(`holds a ${key} that is not one of its options`)
  }
  if (values.logLevel === undefined) unknown('has no log level')
  return { values, relayAvailable: options.primaryProviderId.includes(RELAY_PROVIDER_ID) }
}

/**
 * Configure the site at `origin`. Resolves to what happened to each of the three things
 * (`set` · `kept` · `preserved` · `other`/`untouched`); rejects with a MailConfigError otherwise.
 */
export async function configureMail({
  origin,
  token,
  sender,
  fetch: fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const ctx = { origin: normalizeOrigin(origin), token: validateToken(token), fetch: fetchImpl, timeoutMs }
  const from = sender === undefined || sender === '' ? undefined : validateSender(sender)

  const hook = await readHook(ctx)
  // Someone chose another mail plugin for this site. That is a decision, not a gap: leave all of it.
  if (hook.selected !== null && hook.selected !== PLUGIN_ID)
    return { hook: 'other', provider: 'untouched', sender: 'untouched' }
  if (!hook.providers.includes(PLUGIN_ID))
    refuse('NO_PLUGIN', `${PLUGIN_ID} is not a ${DELIVER_HOOK} provider on this site`)

  const { values: current, relayAvailable } = await readSettings(ctx)
  const want = { ...current }
  if (current.primaryProviderId === undefined) {
    if (!relayAvailable)
      refuse(
        'NO_RELAY_PROVIDER',
        `${PLUGIN_ID} on this site does not offer the ${RELAY_PROVIDER_ID} provider`
      )
    want.primaryProviderId = RELAY_PROVIDER_ID
  }
  if (current.fromEmail === undefined) {
    if (from === undefined)
      refuse('NO_SENDER', 'the site has no sender address and no owner email was passed — none is invented')
    want.fromEmail = from
  }
  const saveSettings = FIELD_KEYS.some((key) => want[key] !== current[key])
  const selectHook = hook.selected === null

  if (saveSettings) {
    const saved = await request(ctx, 'POST', ADMIN_PATH, {
      type: 'form_submit',
      action_id: 'save_global',
      block_id: FORM_ID,
      values: Object.fromEntries(FIELD_KEYS.map((key) => [key, want[key] ?? '']))
    })
    if (!isRecord(saved.toast) || saved.toast.type !== 'success')
      refuse('WRITE_FAILED', `${PLUGIN_ID} did not confirm the settings save`)
  }
  if (selectHook) {
    const chosen = await request(ctx, 'PUT', `${HOOKS_PATH}/${DELIVER_HOOK}`, { pluginId: PLUGIN_ID })
    if (chosen.hookName !== DELIVER_HOOK || chosen.selectedPluginId !== PLUGIN_ID) {
      refuse('WRITE_FAILED', `the site did not confirm ${PLUGIN_ID} for ${DELIVER_HOOK}`)
    }
  }
  if (saveSettings || selectHook) {
    // An acknowledged write is not the stored state: read both back and compare every value.
    const hookNow = await readHook(ctx)
    const { values: now } = await readSettings(ctx)
    if (hookNow.selected !== PLUGIN_ID || !FIELD_KEYS.every((key) => now[key] === want[key])) {
      refuse(
        'UNVERIFIED',
        'the site does not hold the mail settings that were just written — state not verified'
      )
    }
  }
  return {
    hook: selectHook ? 'set' : 'kept',
    provider:
      current.primaryProviderId === undefined
        ? 'set'
        : current.primaryProviderId === RELAY_PROVIDER_ID
          ? 'kept'
          : 'preserved',
    sender: current.fromEmail === undefined ? 'set' : 'kept'
  }
}

async function main(argv) {
  let args
  try {
    args = parseArgs(argv)
    normalizeOrigin(args.origin)
    if (args.sender !== undefined) validateSender(args.sender)
  } catch (err) {
    console.error(`configure-mail: ${err.message}`)
    return 2
  }
  try {
    const result = await configureMail({ ...args, token: readToken(args.tokenFile) })
    console.log(`mail: ${DELIVER_HOOK} ${result.hook}, provider ${result.provider}, sender ${result.sender}`)
    return 0
  } catch (err) {
    console.error(`configure-mail: ${err instanceof MailConfigError ? err.message : 'unexpected failure'}`)
    return 1
  }
}

const invoked = (() => {
  try {
    return (
      Boolean(process.argv[1]) &&
      realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
    )
  } catch {
    return false
  }
})()
if (invoked) process.exitCode = await main(process.argv.slice(2))
