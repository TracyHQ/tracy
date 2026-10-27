/**
 * Run one model process of the daily QA (plan §4.7, §5, §6): Opus plans the cases of a PR (no tools,
 * outside the fence), the `sonnet` and `sol` lanes write and run tests, the `verify` lane (astra)
 * classifies red tests. Every process:
 *   - gets an environment built by hand from an allow-list (nothing of the caller leaks through);
 *   - gets its own config dir (`CLAUDE_CONFIG_DIR` / `CODEX_HOME`), never the user's;
 *   - is spawned through `spawnTracked` (lock.mjs: procs.jsonl intent/spawned/result, argv marker);
 *   - is wrapped in `sandbox-exec` with the lane's rendered profile (fence/render.mjs) unless the
 *     caller passes `sandbox: false` (only the tool-less `plan` role runs unfenced by design);
 *   - has an absolute deadline: past it the whole process group is killed (status `timeout`);
 *   - has a money cap: claude `--max-budget-usd` / `--max-turns`; codex usage read from every
 *     `turn.completed` event, the group killed once the total passes the cap (status `over-budget`;
 *     off by at most one turn, there is no hard cap inside a turn);
 *   - leaves one line in the agents journal (`r/<runId>/agents.jsonl`) with the REAL model and effort
 *     (claude: `modelUsage` keys; codex: `turn_context` of its session file), even a resumed session.
 *
 * Exports:
 *   LANES = ['opus','sonnet','sol','verify']    ROLE_LANES = { plan:['opus'], write:['sonnet','sol'], verify:['verify'] }
 *   LANE_CLI, LANE_MODEL, CLAUDE_TOOLS, DEFAULT_CAPS, ENV_ALLOW, SHELL_ENV
 *   readCodexEffort(configText: string): string | null          // top-level model_reasoning_effort
 *   prepareCliHome({ lane, cliHome, codexAuthFile?, effort? }): { home, tmp, configDir }
 *   childEnv({ lane, cliHome, token?, proxy?, extra?, binDir? }): Record<string,string>
 *   cliArgs({ lane, role, cwd, caps, effort?, jsonSchema?, pluginDir?, resume? }): string[]
 *   invocation({ lane, role, bin, args, sandboxProfile?, sandbox? = true }): { cmd, args }
 *   runAgent(opts): Promise<Outcome>
 *     opts = { role, lane, key, runId, procsPath, agentsLog, prompt, cwd, cliHome, deadline (epoch ms),
 *              caps?, effort?, claudeTokenFile?, codexAuthFile?, proxy?, extraEnv?, jsonSchema?,
 *              pluginDir?, resume?, sandboxProfile?, sandbox?, bins?: { claude, codex }, killGraceMs? }
 *     Outcome = { status: 'ok'|'error'|'timeout'|'over-budget'|'schema-invalid', key, role, lane,
 *                 resumeOf, sessionId, model, models, effort, usd, tokens, turns, output, text,
 *                 schemaErrors, code, signal, pid, startedAt, endedAt, durationMs, stderrTail }
 *   applyOutcome(entry, lane, outcome): QueueEntry     // timeout / over-budget -> state.recordTimeout
 *   findCodexSession(codexHome, sessionId): string | null
 *   readCodexSession(file): { models: string[], efforts: string[] }
 *
 * Plan, prompts, schemas:
 *   SCHEMAS = { plan, result, verdict }   (parsed scripts/qa/schemas/*.schema.json)
 *   validate(schema, value): string[]     // a small JSON Schema subset; [] = valid
 *   untrusted(name, text): string         // a data block with a random boundary absent from the text
 *   fillPrompt(template, vars): string    // {{NAME}} -> value, single pass, throws on a missing var
 *   loadTddSkill({ repoRoot?, home? }): { text, source }
 *   planPrompt({ pr: { key, title, body }, maxCases? }): string
 *   writePrompt({ lane, prKey, cases, testDir, origin, gate, cdp, testlib, sites, src, laneKeyFile, skill? }): string
 *   verifyPrompt({ prKey, cases: { id, quote, expected, lane, testFile, testText, output }[], diffFile, testDir, origin, gate, cdp, testlib, laneKeyFile, maxChats? }): string
 *   checkPlan(plan, { title, body, prefix }): { ok, errors, plan }   // schema + ids + verbatim quotes
 *   planPr({ pr, ...runAgent opts }): Promise<{ outcome, plan|null, errors }>
 *   writePlanOnce(path, doc): boolean     // false when the file already exists (a plan is never rewritten)
 *   filterDiff(patch, bundledDirs): string  // drop built bundles of BUNDLED packages and pnpm-lock.yaml
 *   readBundled(checkBundlesTs: string): string[]
 *   loadCalibration(dir?): { key, title, body, diff, calibration: true, expected }[]
 */
import { randomBytes } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sandboxArgv } from '../fence/render.mjs'
import { appendLine } from './journal.mjs'
import { spawnTracked } from './lock.mjs'
import { recordTimeout, writeJsonAtomic } from './state.mjs'

const QA_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const REPO_ROOT = dirname(dirname(QA_DIR))

export const LANES = ['opus', 'sonnet', 'sol', 'verify']
export const ROLE_LANES = { plan: ['opus'], write: ['sonnet', 'sol'], verify: ['verify'] }
export const LANE_CLI = { opus: 'claude', sonnet: 'claude', sol: 'codex', verify: 'codex' }
export const LANE_MODEL = { opus: 'opus', sonnet: 'sonnet', sol: 'gpt-6.1-sol', verify: 'gpt-6-astra' }
export const CLAUDE_TOOLS = 'Bash,Read,Edit,Write,Glob,Grep,Skill'

/** Per-process caps of plan §6 (time in minutes; the caller turns minutes into an absolute deadline). */
export const DEFAULT_CAPS = {
  opus: { minutes: 3, usd: 1, maxTurns: 4 },
  sonnet: { minutes: 12, usd: 1.5, maxTurns: 80 },
  sol: { minutes: 12, tokens: 3_000_000 },
  verify: { minutes: 10, tokens: 4_000_000 }
}

const BASE_ENV = [
  'PATH',
  'HOME',
  'TMPDIR',
  'LANG',
  'CI',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_KEY_0',
  'GIT_CONFIG_VALUE_0',
  'GIT_TERMINAL_PROMPT'
]
const CLAUDE_ENV = [
  'CLAUDE_CONFIG_DIR',
  'CLAUDE_CODE_TMPDIR',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  'DISABLE_AUTOUPDATER'
]
const CODEX_ENV = ['CODEX_HOME']
const PROXY_ENV = ['HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy']
/** Every variable a model process may see. Extra variables must be NODE_OPTIONS or start with QA_. */
export const ENV_ALLOW = [...BASE_ENV, ...CLAUDE_ENV, ...CODEX_ENV, ...PROXY_ENV, 'NODE_OPTIONS', 'QA_RUN_ID']
/** Variables /bin/sh (the spawnTracked wrapper) adds by itself. */
export const SHELL_ENV = ['PWD', 'SHLVL', '_', 'OLDPWD']
const EXTRA_OK = (name) => name === 'NODE_OPTIONS' || /^QA_[A-Z0-9_]+$/.test(name)

// ---------------------------------------------------------------------------------------------
// Process environment and arguments

/** The top-level `model_reasoning_effort` of a Codex config.toml (keys under a [table] do not count). */
export function readCodexEffort(configText) {
  for (const line of String(configText).split('\n')) {
    if (/^\s*\[/.test(line)) break
    const m = line.match(/^\s*model_reasoning_effort\s*=\s*["']([a-z]+)["']\s*(#.*)?$/)
    if (m) return m[1]
  }
  return null
}

function assertLane(lane) {
  if (!LANES.includes(lane)) throw new Error(`unknown lane: ${lane}`)
}

/** Create the process's private home, tmp and CLI config dir. Codex: a copied auth.json + one effort line. */
export function prepareCliHome({ lane, cliHome, codexAuthFile, effort }) {
  assertLane(lane)
  const home = join(cliHome, 'home')
  const tmp = join(cliHome, 'tmp')
  const configDir = join(cliHome, LANE_CLI[lane] === 'claude' ? 'claude' : 'codex')
  for (const d of [home, tmp, configDir]) mkdirSync(d, { recursive: true })
  if (LANE_CLI[lane] === 'codex') {
    if (!effort || !/^[a-z]+$/.test(effort)) throw new Error(`codex lane ${lane}: unusable effort ${effort}`)
    if (!codexAuthFile || !existsSync(codexAuthFile))
      throw new Error(`codex lane ${lane}: auth.json missing (no fallback to ~/.codex)`)
    const auth = join(configDir, 'auth.json')
    copyFileSync(codexAuthFile, auth)
    chmodSync(auth, 0o600)
    writeFileSync(join(configDir, 'config.toml'), `model_reasoning_effort = "${effort}"\n`)
  }
  return { home, tmp, configDir }
}

/** The whole environment of a model process, built from nothing. */
export function childEnv({ lane, cliHome, token, proxy, extra = {}, binDir }) {
  assertLane(lane)
  const pathDirs = [binDir, dirname(process.execPath), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].filter(
    Boolean
  )
  const env = {
    PATH: [...new Set(pathDirs)].join(delimiter),
    HOME: join(cliHome, 'home'),
    TMPDIR: join(cliHome, 'tmp'),
    LANG: 'en_US.UTF-8',
    CI: '1',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.hooksPath',
    GIT_CONFIG_VALUE_0: '/dev/null',
    GIT_TERMINAL_PROMPT: '0'
  }
  if (LANE_CLI[lane] === 'claude') {
    if (!token) throw new Error(`claude lane ${lane}: no token`)
    Object.assign(env, {
      CLAUDE_CONFIG_DIR: join(cliHome, 'claude'),
      CLAUDE_CODE_TMPDIR: join(cliHome, 'tmp'),
      CLAUDE_CODE_OAUTH_TOKEN: token,
      CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_AUTOUPDATER: '1'
    })
  } else {
    env.CODEX_HOME = join(cliHome, 'codex')
  }
  if (proxy) {
    env.HTTPS_PROXY = env.https_proxy = proxy
    env.NO_PROXY = env.no_proxy = '127.0.0.1,localhost,.qa.tracy.test,qa.tracy.test'
  }
  for (const [k, v] of Object.entries(extra)) {
    if (!EXTRA_OK(k)) throw new Error(`environment variable not allowed for a model process: ${k}`)
    env[k] = String(v)
  }
  return env
}

/** CLI arguments (without the binary). The prompt always goes through stdin. */
export function cliArgs({
  lane,
  role,
  cwd,
  caps = DEFAULT_CAPS[lane],
  effort,
  jsonSchema,
  pluginDir,
  resume,
  addDirs
}) {
  assertLane(lane)
  if (!ROLE_LANES[role]?.includes(lane)) throw new Error(`lane ${lane} cannot play role ${role}`)
  if (LANE_CLI[lane] === 'claude') {
    const tools = role === 'plan' ? '' : CLAUDE_TOOLS
    const a = [
      '-p',
      '--model',
      LANE_MODEL[lane],
      '--output-format',
      'json',
      '--strict-mcp-config',
      '--no-chrome'
    ]
    // `--permission-prompts none` wins over the skip flag and denies every tool (measured), so a
    // tool lane gets only the skip flag; the tool-less plan role keeps the explicit none.
    a.push('--tools', tools)
    if (!tools) a.push('--permission-prompts', 'none')
    // With tools, nothing may prompt (it would be denied); the fence is the boundary, not the prompt.
    // A fresh config dir has never accepted bypass mode, so `--permission-mode bypassPermissions`
    // alone still denies; the fence is the boundary, so skip the checks outright.
    if (tools) a.push('--dangerously-skip-permissions')
    // Inside sandbox-exec the CLI has been seen to fall back to the default mode (03/10: the
    // session reported permissionMode "default" and refused reads of ../lib). Pre-allow the lane's
    // tools and name the folders it must read, so the lane works either way; the fence stays the
    // boundary.
    if (tools) a.push('--allowedTools', tools.replaceAll(',', ' '))
    for (const d of addDirs ?? []) a.push('--add-dir', d)
    if (pluginDir) a.push('--plugin-dir', pluginDir)
    if (caps?.usd != null) a.push('--max-budget-usd', String(caps.usd))
    if (caps?.maxTurns != null) a.push('--max-turns', String(caps.maxTurns))
    if (jsonSchema) a.push('--json-schema', JSON.stringify(jsonSchema))
    if (resume) a.push('--resume', resume)
    return a
  }
  if (!effort) throw new Error(`codex lane ${lane}: effort is required`)
  const a = ['exec', '--json', '-m', LANE_MODEL[lane], '-c', `model_reasoning_effort="${effort}"`]
  a.push('--ignore-rules', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox')
  if (cwd) a.push('-C', cwd)
  if (resume) a.push('resume', resume)
  a.push('-')
  return a
}

/** Wrap in sandbox-exec. Fenced roles (write, verify) refuse to run without a profile unless sandbox:false. */
export function invocation({ role, bin, args, sandboxProfile, sandbox = true }) {
  if (sandbox === false) return { cmd: bin, args }
  if (!sandboxProfile) {
    if (role === 'plan') return { cmd: bin, args } // tool-less, outside the fence by design (plan §3.2)
    throw new Error(`role ${role}: a sandbox profile is required (pass sandbox:false only in tests)`)
  }
  const [cmd, ...rest] = sandboxArgv(sandboxProfile, [bin, ...args])
  return { cmd, args: rest }
}

function resolveBin(name, pathEnv = process.env.PATH ?? '') {
  if (name.includes('/')) return resolve(name)
  for (const d of pathEnv.split(delimiter)) {
    const p = join(d, name)
    try {
      if (statSync(p).isFile()) return p
    } catch {}
  }
  throw new Error(`${name}: not found on PATH`)
}

// ---------------------------------------------------------------------------------------------
// Codex session files

export function findCodexSession(codexHome, sessionId) {
  if (!sessionId) return null
  const root = join(codexHome, 'sessions')
  if (!existsSync(root)) return null
  const stack = [root]
  let found = null
  while (stack.length) {
    const d = stack.pop()
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (e.name.endsWith(`${sessionId}.jsonl`)) found = p
    }
  }
  return found
}

export function readCodexSession(file) {
  const models = []
  const efforts = []
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    if (!raw.includes('"turn_context"')) continue
    try {
      const l = JSON.parse(raw)
      if (l.type !== 'turn_context') continue
      const p = l.payload ?? {}
      const model = p.model ?? p.collaboration_mode?.settings?.model
      const effort = p.effort ?? p.collaboration_mode?.settings?.reasoning_effort
      if (model) models.push(model)
      if (effort) efforts.push(effort)
    } catch {}
  }
  return { models, efforts }
}

// ---------------------------------------------------------------------------------------------
// Running one process

const killGroup = (pid, sig) => {
  try {
    process.kill(-pid, sig)
  } catch {}
}

function parseClaude(stdout) {
  const lines = stdout.trim().split('\n').filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const d = JSON.parse(lines[i])
      if (d && typeof d === 'object' && ('is_error' in d || d.type === 'result')) return d
    } catch {}
  }
  try {
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

function tryJson(s) {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

export async function runAgent(o) {
  const {
    role,
    lane,
    key = '',
    runId,
    procsPath,
    agentsLog,
    prompt,
    cwd,
    cliHome,
    deadline,
    caps = DEFAULT_CAPS[lane],
    effort,
    claudeTokenFile,
    codexAuthFile,
    proxy,
    extraEnv = {},
    jsonSchema,
    pluginDir,
    addDirs,
    resume,
    sandboxProfile,
    sandbox = true,
    bins = {},
    killGraceMs = 2000
  } = o
  assertLane(lane)
  if (!runId || !procsPath || !agentsLog || !cliHome || !Number.isFinite(deadline))
    throw new Error('runAgent needs runId, procsPath, agentsLog, cliHome and an absolute deadline')
  const cli = LANE_CLI[lane]
  const bin = resolveBin(bins[cli] ?? cli)
  const startedAt = Date.now()
  const base = { key, role, lane, resumeOf: resume ?? null }

  // Invariants checked before anything is spawned: a bad argument throws, a late start is a timeout.
  const args = cliArgs({ lane, role, cwd, caps, effort, jsonSchema, pluginDir, resume, addDirs })
  const inv = invocation({ role, bin, args, sandboxProfile, sandbox })
  prepareCliHome({ lane, cliHome, codexAuthFile, effort })
  const token = cli === 'claude' ? readFileSync(claudeTokenFile, 'utf8').trim() : undefined
  const env = childEnv({ lane, cliHome, token, proxy, extra: extraEnv, binDir: dirname(bin) })

  const finish = (fields) => {
    const endedAt = Date.now()
    const outcome = {
      ...base,
      sessionId: null,
      model: null,
      models: [],
      effort: null,
      usd: null,
      tokens: null,
      turns: null,
      output: null,
      text: null,
      schemaErrors: [],
      code: null,
      signal: null,
      pid: null,
      stderrTail: '',
      ...fields,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationMs: endedAt - startedAt
    }
    const { output: _o, text: _t, stderrTail: _s, ...line } = outcome
    appendLine(agentsLog, { t: 'agent', runId, ...line, at: outcome.endedAt })
    return outcome
  }

  if (deadline <= Date.now()) return finish({ status: 'timeout', reason: 'deadline already passed' })

  const child = spawnTracked(
    procsPath,
    { runId, label: `agent:${role}:${lane}:${key}`, key, role, lane },
    inv.cmd,
    inv.args,
    {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    }
  )
  const pid = child.pid
  let killed = null
  let stdout = ''
  let stderr = ''
  let pending = ''
  const tokens = { input: 0, cached: 0, output: 0, total: 0 }
  let turns = 0
  let threadId = null
  let lastMessage = null
  let failed = null

  const kill = (why) => {
    if (killed || !pid) return
    killed = why
    killGroup(pid, 'SIGTERM')
    setTimeout(() => killGroup(pid, 'SIGKILL'), killGraceMs).unref()
  }

  const onCodexLine = (line) => {
    const ev = tryJson(line)
    if (!ev) return
    if (ev.type === 'thread.started') threadId = ev.thread_id ?? threadId
    else if (ev.type === 'item.completed' && ev.item?.type === 'agent_message') lastMessage = ev.item.text
    else if (ev.type === 'turn.failed' || ev.type === 'error')
      failed = ev.error?.message ?? ev.message ?? 'failed'
    else if (ev.type === 'turn.completed') {
      turns++
      const u = ev.usage ?? {}
      tokens.input += u.input_tokens ?? 0
      tokens.cached += u.cached_input_tokens ?? 0
      tokens.output += u.output_tokens ?? 0
      tokens.total = tokens.input + tokens.output
      if (caps?.tokens != null && tokens.total > caps.tokens) kill('over-budget')
    }
  }

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (d) => {
    stdout += d
    if (cli !== 'codex') return
    pending += d
    let nl = pending.indexOf('\n')
    while (nl !== -1) {
      onCodexLine(pending.slice(0, nl))
      pending = pending.slice(nl + 1)
      nl = pending.indexOf('\n')
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (d) => {
    stderr = (stderr + d).slice(-8000)
  })
  child.stdin.on('error', () => {})
  child.stdin.end(prompt)

  const timer = setTimeout(() => kill('timeout'), Math.max(0, deadline - Date.now()))
  const { code, signal } = await new Promise((res) => {
    let exit = null
    let done = false
    const settle = () => {
      if (done) return
      done = true
      res(exit ?? { code: null, signal: null })
    }
    child.once('close', (c, s) => {
      exit = exit ?? { code: c, signal: s }
      settle()
    })
    child.once('exit', (c, s) => {
      exit = { code: c, signal: s }
      // A grandchild that escaped the group may hold stdout open; do not wait for it forever.
      setTimeout(settle, 1500).unref()
    })
    child.once('error', () => setTimeout(settle, 10))
  })
  clearTimeout(timer)
  if (pending) onCodexLine(pending)
  // Nothing of the process may outlive it.
  if (pid) killGroup(pid, 'SIGKILL')

  const f = { code, signal, pid, stderrTail: stderr.slice(-2000) }
  if (cli === 'claude') {
    const d = parseClaude(stdout)
    if (d) {
      f.sessionId = d.session_id ?? null
      f.usd = d.total_cost_usd ?? null
      f.turns = d.num_turns ?? null
      f.models = Object.keys(d.modelUsage ?? {})
      f.model = f.models.at(-1) ?? null
      f.text = typeof d.result === 'string' ? d.result : null
      f.output = d.structured_output ?? (f.text != null ? tryJson(f.text) : null)
      if (d.modelUsage)
        f.tokens = Object.values(d.modelUsage).reduce(
          (t, m) => ({
            input:
              t.input +
              (m.inputTokens ?? 0) +
              (m.cacheReadInputTokens ?? 0) +
              (m.cacheCreationInputTokens ?? 0),
            output: t.output + (m.outputTokens ?? 0)
          }),
          { input: 0, output: 0 }
        )
    }
    if (killed) f.status = killed
    else if (!d) f.status = 'error'
    else if (d.is_error) f.status = /budget|max_turns/.test(String(d.subtype)) ? 'over-budget' : 'error'
    else f.status = 'ok'
    if (d?.is_error) f.reason = String(d.subtype ?? d.result ?? 'error').slice(0, 300)
  } else {
    f.sessionId = threadId
    f.tokens = { ...tokens }
    f.turns = turns
    f.text = lastMessage
    f.output = lastMessage != null ? tryJson(lastMessage) : null
    const file = findCodexSession(join(cliHome, 'codex'), threadId)
    if (file) {
      const s = readCodexSession(file)
      f.models = [...new Set(s.models)]
      f.model = s.models.at(-1) ?? null
      f.effort = s.efforts.at(-1) ?? null
      f.sessionFile = file
    }
    if (killed) f.status = killed
    else if (failed) {
      f.status = 'error'
      f.reason = String(failed).slice(0, 300)
    } else f.status = code === 0 && turns > 0 ? 'ok' : 'error'
  }
  if (f.status === 'ok' && jsonSchema) {
    f.schemaErrors = f.output == null ? ['no JSON output'] : validate(jsonSchema, f.output)
    if (f.schemaErrors.length) f.status = 'schema-invalid'
  }
  return finish(f)
}

/** Feed a finished process back into the PR's queue entry: out of time or money -> state.recordTimeout. */
export function applyOutcome(entry, lane, outcome) {
  if (outcome.status === 'timeout' || outcome.status === 'over-budget') return recordTimeout(entry, lane)
  return entry
}

// ---------------------------------------------------------------------------------------------
// Schemas

const loadSchema = (name) => JSON.parse(readFileSync(join(QA_DIR, 'schemas', `${name}.schema.json`), 'utf8'))
export const SCHEMAS = {
  plan: loadSchema('plan'),
  result: loadSchema('result'),
  verdict: loadSchema('verdict')
}

function typeOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number'
  return typeof v
}

/** Validate against the subset of JSON Schema the QA schemas use. Returns error strings, [] when valid. */
export function validate(schema, value, at = '$') {
  const errors = []
  if (schema.type) {
    const types = [].concat(schema.type)
    const t = typeOf(value)
    if (!types.includes(t) && !(t === 'integer' && types.includes('number'))) {
      return [`${at}: expected ${types.join('|')}, got ${t}`]
    }
  }
  if (schema.enum && !schema.enum.some((e) => e === value))
    errors.push(`${at}: not one of ${schema.enum.join(', ')}`)
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength)
      errors.push(`${at}: shorter than ${schema.minLength}`)
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      errors.push(`${at}: does not match ${schema.pattern}`)
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errors.push(`${at}: below ${schema.minimum}`)
    if (schema.maximum != null && value > schema.maximum) errors.push(`${at}: above ${schema.maximum}`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems)
      errors.push(`${at}: fewer than ${schema.minItems} items`)
    if (schema.maxItems != null && value.length > schema.maxItems)
      errors.push(`${at}: more than ${schema.maxItems} items`)
    if (schema.items) value.forEach((v, i) => errors.push(...validate(schema.items, v, `${at}[${i}]`)))
  }
  if (typeOf(value) === 'object') {
    for (const r of schema.required ?? []) if (!(r in value)) errors.push(`${at}: missing ${r}`)
    const props = schema.properties ?? {}
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) errors.push(...validate(props[k], v, `${at}.${k}`))
      else if (schema.additionalProperties === false) errors.push(`${at}: unexpected property ${k}`)
    }
  }
  return errors
}

// ---------------------------------------------------------------------------------------------
// Prompts

const readPrompt = (name) => readFileSync(join(QA_DIR, 'prompts', `${name}.md`), 'utf8')

/** Wrap untrusted text in a block whose boundary is random and absent from the text itself. */
export function untrusted(name, text) {
  const body = String(text ?? '')
  let b
  do b = `QA-${randomBytes(8).toString('hex')}`
  while (body.includes(b))
  return `<untrusted-data name="${name}" boundary="${b}">\n${body}\n</untrusted-data boundary="${b}">`
}

/** Replace every {{NAME}} in one pass (values are never re-scanned); a missing value throws. */
export function fillPrompt(template, vars) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
    if (!(k in vars) || vars[k] == null) throw new Error(`prompt variable without a value: ${k}`)
    return String(vars[k])
  })
}

const TDD_REL = join('skills', 'engineering', 'tdd', 'SKILL.md')

/**
 * The tdd skill text: the copy pinned in this tree (vendor/tracy/mattpocock-skills) first, else the
 * user-level plugin cache. `source` says which file was used, for the run record.
 */
export function loadTddSkill({ repoRoot = REPO_ROOT, home = homedir() } = {}) {
  const pinned = join(repoRoot, 'vendor', 'tracy', 'mattpocock-skills', TDD_REL)
  if (existsSync(pinned)) return { text: readFileSync(pinned, 'utf8'), source: pinned }
  const cache = join(home, '.claude', 'plugins', 'cache', 'mattpocock', 'mattpocock-skills')
  if (existsSync(cache)) {
    const versions = readdirSync(cache).sort().reverse()
    for (const v of versions) {
      const p = join(cache, v, TDD_REL)
      if (existsSync(p)) return { text: readFileSync(p, 'utf8'), source: p }
    }
  }
  throw new Error('tdd skill not found (vendor/tracy/mattpocock-skills or ~/.claude/plugins cache)')
}

const SKILL_TOOL = [
  'Before writing any test, call the `Skill` tool with the skill `mattpocock-skills:tdd` and follow it.',
  'It is the required method for this job; a run that does not load it is not counted.'
].join(' ')

function skillBlock(lane, skill) {
  if (LANE_CLI[lane] === 'claude') return SKILL_TOOL
  const s = skill ?? loadTddSkill()
  return [
    'Follow this skill, `mattpocock-skills:tdd`, given here verbatim (it is trusted, unlike the cases below):',
    '',
    '<skill name="mattpocock-skills:tdd">',
    s.text.trimEnd(),
    '</skill>'
  ].join('\n')
}

export function planPrompt({ pr, maxCases = 8 }) {
  return fillPrompt(readPrompt('plan'), {
    CASE_PREFIX: pr.key,
    MAX_CASES: maxCases,
    TITLE: untrusted('pr-title', pr.title),
    BODY: untrusted('pr-description', pr.body || '(empty)')
  })
}

const schemaText = (s) => JSON.stringify(s, null, 2)

/**
 * Fixed sites as the write lanes see them: `{ label, siteKey, platform? }`. Entries may be plain
 * labels (`qa-fixedwp`, the shape of state/fixed-sites.json) or objects `{ key, platform }`; the site
 * key follows the gate's rule (gate/gate.mjs `fixedSites`): a name with a dot is already a key,
 * otherwise `<label>.<siteDomain>`.
 */
export function fixedSiteView(sites, siteDomain = 'qa.tracy.test') {
  return (sites ?? []).map((s) => {
    const name = String(typeof s === 'string' ? s : (s?.siteKey ?? s?.key ?? s?.label ?? '')).toLowerCase()
    const siteKey = name.includes('.') ? name : `${name}.${siteDomain}`
    const view = { label: siteKey.split('.')[0], siteKey }
    if (s && typeof s === 'object' && s.platform) view.platform = s.platform
    return view
  })
}

export function writePrompt({
  lane,
  prKey,
  cases,
  testDir,
  origin,
  gate,
  cdp,
  testlib,
  sites,
  src,
  laneKeyFile,
  skill
}) {
  if (!ROLE_LANES.write.includes(lane)) throw new Error(`lane ${lane} does not write tests`)
  const slim = cases.map(({ id, quote, statement, seam, expected, needsChat, needsSite }) => ({
    id,
    quote,
    statement,
    seam,
    expected,
    needsChat,
    needsSite
  }))
  return fillPrompt(readPrompt('write-tests'), {
    LANE: lane,
    PR_KEY: prKey,
    SKILL: skillBlock(lane, skill),
    CASES: untrusted('cases', JSON.stringify(slim, null, 2)),
    SRC: src,
    ORIGIN: origin,
    GATE: gate,
    CDP: cdp,
    TESTLIB: testlib,
    SITES: JSON.stringify(fixedSiteView(sites)),
    TEST_DIR: testDir,
    LANE_KEY_FILE: laneKeyFile,
    RESULT_SCHEMA: schemaText(SCHEMAS.result)
  })
}

/**
 * cases: { id, quote, expected, lane, testFile, output }[] — every red case of the PR, both lanes.
 * The test file text and its output are untrusted too.
 */
export function verifyPrompt({
  prKey,
  cases,
  diffFile,
  testDir,
  origin,
  gate,
  cdp,
  testlib,
  laneKeyFile,
  maxChats = 2
}) {
  const blocks = cases
    .map((c) =>
      [
        `### Case \`${c.id}\` (lane ${c.lane})`,
        untrusted(`${c.id}-claim`, JSON.stringify({ quote: c.quote, expected: c.expected }, null, 2)),
        `Failed test file \`${c.testFile}\`:`,
        untrusted(`${c.id}-test`, c.testText ?? ''),
        'Its output on the stand:',
        untrusted(`${c.id}-output`, c.output ?? '')
      ].join('\n\n')
    )
    .join('\n\n')
  return fillPrompt(readPrompt('verify'), {
    PR_KEY: prKey,
    CASES: blocks,
    DIFF_FILE: diffFile,
    MAX_CHATS: maxChats,
    ORIGIN: origin,
    GATE: gate,
    CDP: cdp,
    TESTLIB: testlib,
    TEST_DIR: testDir,
    LANE_KEY_FILE: laneKeyFile,
    VERDICT_SCHEMA: schemaText(SCHEMAS.verdict)
  })
}

// ---------------------------------------------------------------------------------------------
// Plan (Opus): check, run, write once

const squash = (s) => String(s).replace(/\s+/g, ' ').trim()

/** Schema, then ids (`<prefix>-k<i>`, unique), then every quote verbatim in the title or description. */
export function checkPlan(plan, { title, body, prefix }) {
  const errors = validate(SCHEMAS.plan, plan)
  if (errors.length) return { ok: false, errors, plan: null }
  const hay = squash(`${title}\n${body ?? ''}`)
  const seen = new Set()
  const cases = plan.cases.map((c) => {
    if (!c.id.startsWith(`${prefix}-k`)) errors.push(`${c.id}: id must start with ${prefix}-k`)
    if (seen.has(c.id)) errors.push(`${c.id}: duplicate id`)
    seen.add(c.id)
    const quoteVerbatim = hay.includes(squash(c.quote))
    return quoteVerbatim
      ? { ...c, quoteVerbatim }
      : {
          ...c,
          quoteVerbatim,
          checkable: false,
          reason: `quote not found verbatim in the PR text; ${c.reason}`
        }
  })
  return { ok: errors.length === 0, errors, plan: errors.length ? null : { cases } }
}

/** One Opus run for one PR: prompt from title + description only (never the diff), then checkPlan. */
export async function planPr({ pr, maxCases = 8, ...opts }) {
  const outcome = await runAgent({
    ...opts,
    role: 'plan',
    lane: 'opus',
    key: pr.key,
    prompt: planPrompt({ pr, maxCases }),
    jsonSchema: SCHEMAS.plan
  })
  if (outcome.status !== 'ok')
    return { outcome, plan: null, errors: [outcome.status, ...outcome.schemaErrors] }
  const checked = checkPlan(outcome.output, { title: pr.title, body: pr.body, prefix: pr.key })
  if (!checked.ok) return { outcome, plan: null, errors: checked.errors }
  const plan = {
    pr: pr.key,
    title: pr.title,
    calibration: Boolean(pr.calibration),
    plannedAt: outcome.endedAt,
    model: outcome.model,
    usd: outcome.usd,
    cases: checked.plan.cases
  }
  return { outcome, plan, errors: [] }
}

/** state/plans/pr-<n>.json is written once and never rewritten. */
export function writePlanOnce(path, doc) {
  if (existsSync(path)) return false
  writeJsonAtomic(path, doc)
  return true
}

// ---------------------------------------------------------------------------------------------
// Diff for the verify lane

/** The BUNDLED package list of scripts/check-bundles.ts (string literals of the array). */
export function readBundled(checkBundlesTs) {
  const m = String(checkBundlesTs).match(/const BUNDLED\s*=\s*\[([\s\S]*?)\n\]/)
  if (!m) return []
  return [...m[1].replace(/\/\/.*$/gm, '').matchAll(/'([^']+)'/g)].map((x) => x[1])
}

/**
 * Drop exactly the built bundles (`lib/client.js`, `lib/index.js` and their `.map`) of the BUNDLED
 * packages, and `pnpm-lock.yaml`. Every other file of those packages stays.
 */
export function filterDiff(patch, bundledDirs) {
  const built = new Set(
    bundledDirs.flatMap((d) =>
      ['lib/client.js', 'lib/index.js', 'lib/client.js.map', 'lib/index.js.map'].map((f) => `${d}/${f}`)
    )
  )
  const parts = String(patch).split(/(?=^diff --git )/m)
  return parts
    .filter((p) => {
      const m = p.match(/^diff --git a\/(\S+) b\/(\S+)/)
      if (!m) return true
      const file = m[2]
      return !(file === 'pnpm-lock.yaml' || built.has(file))
    })
    .join('')
}

// ---------------------------------------------------------------------------------------------
// Calibration PRs (plan §8)

export function loadCalibration(dir = join(QA_DIR, 'calibration')) {
  const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8'))
  return ['calib-true', 'calib-false'].map((key) => {
    const md = readFileSync(join(dir, `${key}.md`), 'utf8')
    const [first, ...rest] = md.split('\n')
    const title = first.replace(/^#\s+/, '').trim()
    return {
      key,
      title,
      body: rest.join('\n').trim(),
      diff: readFileSync(join(dir, `${key}.diff`), 'utf8'),
      calibration: true,
      expected: expected[key]
    }
  })
}
