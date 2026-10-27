/**
 * The harness QA runtime: a REAL Cordis context carrying dsh's own agent loop, tool runtime, file
 * and shell tools, approval and permission services, plus Tracy's `DockerSandbox` and
 * `DockerSubprocessRuntime`, driven by a scripted fake model.
 *
 * What is real: session store, agent loop, tool dispatcher (`tools/pre-execute` hooks, schema
 * validation, `tools/result`), the Tracy path fence / workdir guard / approval guard / approval
 * answer, the dsh file tools and their sandbox, the bash tool and its sandbox executor, and — when
 * asked for — the shipped `@tracy/dsh-site-tabs` and `@tracy/dsh-site-tools` host bundles.
 *
 * What is a SEAM (named, never counted as end-to-end proof of the part behind it):
 *  - `docker`: the provider spawns a real process, but it is `fixtures/harness/fake-docker.mjs`, which
 *    records the `docker exec` argv and answers as scripted. No container runs.
 *  - tracy-web: the doors (`/turn`, `/moment`, `/apply`, `/changed`) are a local HTTP recorder. No
 *    Postgres, no Site changes table, no CMS plugin sits behind them.
 *  - the model: `ScriptedModel` below.
 *  - `pwsh` and `terminal_open`: not loaded on this host (their backends are Windows / PTY), so a
 *    recording fixture tool of the same name stands behind the REAL hooks and dispatcher.
 *
 * Module layout: this file imports no `tests/qa/lib` code (W0 builds that in parallel).
 */
import { createHash } from 'node:crypto'
import zlib from 'node:zlib'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readBytesSync, readTextSync } from '../../lib/bounded-reader.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
export const REPO = path.resolve(here, '../../../..')
export const HARNESS_PACKAGES = path.join(REPO, 'vendor/tracy/deepseek-harness/packages')
export const FIXTURES = path.join(REPO, 'tests/qa/fixtures/harness')

const fromLoop = createRequire(path.join(HARNESS_PACKAGES, 'core/agent-loop/package.json'))
const url = (file) => pathToFileURL(file).href
const MARKER = 'tracy-sandbox'

/** A dependency of the agent loop, by package name. */
export const dep = (name) => import(url(fromLoop.resolve(name)))
/** A built dsh package by its folder under `vendor/tracy/deepseek-harness/packages`. */
export const dsh = (folder) => import(url(path.join(HARNESS_PACKAGES, folder, 'lib/index.js')))

/** The built pieces the runtime needs; a missing one is an ENV fact (probed), never a product FAIL. */
export const REQUIRED_BUILDS = Object.freeze([
  'core/agent-loop/lib/index.js',
  'core/tools/lib/index.js',
  'fs/tool-fs/lib/index.js',
  'fs/fs-sandbox/lib/index.js',
  'shell/tool-bash/lib/index.js',
  'shell/bash-sandbox/lib/index.js',
  'interaction/user-approval/lib/index.js',
  'interaction/permission-presets/lib/index.js',
  'sandbox/sandbox-policy/lib/index.js'
])

/**
 * Probe the prerequisites of the runtime. Returns the missing ones with the path that was looked up.
 * @returns {string[]}
 */
export function probeRuntime() {
  const missing = []
  for (const rel of REQUIRED_BUILDS) {
    if (!fs.existsSync(path.join(HARNESS_PACKAGES, rel))) missing.push(path.join(HARNESS_PACKAGES, rel))
  }
  for (const rel of [
    'packages/tools/tracy-subprocess-docker/index.js',
    'packages/tools/tracy-sandbox-docker/index.js'
  ]) {
    if (!fs.existsSync(path.join(REPO, rel))) missing.push(path.join(REPO, rel))
  }
  return missing
}

export const sha256 = (data) => createHash('sha256').update(data).digest('hex')
export const hashFile = (file) => {
  try {
    return sha256(readBytesSync(file))
  } catch (error) {
    return `missing:${error.code ?? 'error'}`
  }
}

/** A deterministic PRNG: the scripted model's call ids and the order of its filler text derive from it. */
export function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The platform markers `platformOf` reads (`.tracy/site.json`), plus the CMS's own config file. */
export const CMS = Object.freeze(['wordpress', 'joomla', 'emdash'])
const CMS_FILES = Object.freeze({
  wordpress: { '.webroot/wp-config.php': '<?php // qa fixture' },
  joomla: { '.webroot/configuration.php': '<?php // qa fixture' },
  emdash: { 'emdash.config.ts': '// qa fixture' }
})

/**
 * Canary text. Each is a unique sentinel: if it ever shows up in a tool output the tool read it.
 */
export const SENTINEL = Object.freeze({
  siteB: 'QA-CANARY-SITE-B-7f3a9c',
  host: 'QA-CANARY-HOST-SECRET-2e81d4',
  siteA: 'QA-OWN-SITE-A-5b60e1'
})

/**
 * Build the on-disk world of one runtime: sites under `<root>/sites`, the host's own folder
 * (`desk-home`, where the seat book and keys live in the real image) beside it, canaries in both.
 * @param {string} root
 * @param {{ label: string, cms: string }[]} sites
 */
export function buildWorld(root, sites) {
  const sitesRoot = path.join(root, 'sites')
  const deskHome = path.join(root, 'desk-home')
  fs.mkdirSync(sitesRoot, { recursive: true })
  fs.mkdirSync(deskHome, { recursive: true })
  const world = { root, sitesRoot, deskHome, sites: {}, canaries: {} }
  for (const { label, cms, sealed = false } of sites) {
    const dir = path.join(sitesRoot, label)
    if (sealed) {
      // A sealed quickstart: the contract marker beside the sites (`.content-contracts/<label>.json`).
      fs.mkdirSync(path.join(sitesRoot, '.content-contracts'), { recursive: true })
      fs.writeFileSync(
        path.join(sitesRoot, '.content-contracts', `${label}.json`),
        JSON.stringify({ contract: 'tracy-business/j6/1.2.0' })
      )
    }
    fs.mkdirSync(path.join(dir, '.webroot'), { recursive: true })
    fs.mkdirSync(path.join(dir, '.tracy'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.tracy', 'site.json'), JSON.stringify({ platform: cms }))
    for (const [file, body] of Object.entries(CMS_FILES[cms] ?? {})) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      fs.writeFileSync(path.join(dir, file), body)
    }
    fs.writeFileSync(path.join(dir, '.webroot', 'own.txt'), `${SENTINEL.siteA} ${label}\n`)
    const canary = path.join(dir, 'canary.txt')
    fs.writeFileSync(canary, `${SENTINEL.siteB} ${label}\n`)
    world.sites[label] = { label, cms, dir, own: path.join(dir, '.webroot', 'own.txt'), canary }
    world.canaries[`site:${label}`] = canary
  }
  const hostCanary = path.join(deskHome, 'dsh-passwords.env')
  fs.writeFileSync(hostCanary, `MCP_SEAT_SECRET=${SENTINEL.host}\n`)
  world.canaries.host = hostCanary
  fs.mkdirSync(path.join(root, 'outside'), { recursive: true })
  const outside = path.join(root, 'outside', 'canary.txt')
  fs.writeFileSync(outside, `${SENTINEL.host} outside\n`)
  world.canaries.outside = outside
  return world
}

/** sha256 of every canary, to compare before and after a scenario. */
export function canaryHashes(world, only = null) {
  const out = {}
  for (const [name, file] of Object.entries(world.canaries)) {
    if (only !== null && !only.includes(name)) continue
    out[name] = hashFile(file)
  }
  return out
}

/** A dependency this machine lacks, proven by a probe: the case is ENV, not a product verdict. */
export class EnvProbeError extends Error {
  constructor(probe, detail) {
    super(`${probe}: ${detail}`)
    this.probe = probe
  }
}

/** Bind a server to an ephemeral loopback port within a deadline; a refusal is an ENV probe result. */
function listenLoopback(server, deadlineMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close()
      reject(new EnvProbeError('loopback-bind', `listen on 127.0.0.1 did not finish within ${deadlineMs}ms`))
    }, deadlineMs)
    server.once('error', (error) => {
      clearTimeout(timer)
      reject(new EnvProbeError('loopback-bind', `listen on 127.0.0.1 failed: ${error.code ?? error.message}`))
    })
    server.listen(0, '127.0.0.1', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

/** A node http server standing in for tracy-web's doors; records every request. */
export async function startDoor() {
  /** @type {{ method: string, url: string, headers: Record<string, string | string[] | undefined>, body: any }[]} */
  const requests = []
  const behaviour = { status: 200, answer: (request) => ({ ok: true, echo: request.url }), delayMs: 0 }
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      let body = null
      try {
        body = raw === '' ? null : JSON.parse(raw)
      } catch {
        body = raw
      }
      const record = { method: req.method ?? '', url: req.url ?? '', headers: { ...req.headers }, body }
      requests.push(record)
      const reply = () => {
        const status = typeof behaviour.status === 'function' ? behaviour.status(record) : behaviour.status
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(behaviour.answer(record)))
      }
      if (behaviour.delayMs > 0) setTimeout(reply, behaviour.delayMs)
      else reply()
    })
  })
  await listenLoopback(server)
  const port = server.address().port
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    behaviour,
    close: () => new Promise((resolve) => (server.closeAllConnections?.(), server.close(resolve)))
  }
}

/**
 * The scripted model. `script` is a finite list; each model call consumes one entry:
 *  - `{ calls: [{ name, args, id? }], text? }` — emit tool calls
 *  - `{ text }`                                — a final answer
 *  - `{ error: 'message' }`                    — the provider fails before any chunk
 *  - `{ breakStream: 'message', partial? }`    — a stream that yields part of a text then breaks
 *  - `{ hang: true }`                          — a stream that sends nothing until aborted
 * When the script is exhausted the model answers `done`, so a scenario never depends on a live
 * model. Call ids are derived from `seed`, so a rerun produces identical requests.
 */
export function scriptedModelFactory({ LlmAdapter, ToolCallId }) {
  return class ScriptedModel extends LlmAdapter {
    constructor(seed = 1) {
      super()
      this.seed = seed
      this.random = seeded(seed)
      this.scripts = new Map()
      this.requests = []
      this.calls = 0
    }

    script(sessionId, entries) {
      this.scripts.set(String(sessionId), [...entries])
    }

    resolveModel(provider, model) {
      return Promise.resolve({ provider, id: model, name: model, inputModalities: ['text', 'image'] })
    }

    callId(n) {
      return ToolCallId(`qa-${this.seed}-${n}-${Math.floor(this.random() * 1e6).toString(36)}`)
    }

    async *stream(options) {
      this.requests.push(options)
      this.calls += 1
      const queue = this.scripts.get(String(options.sessionId)) ?? []
      const entry = queue.shift() ?? { text: 'done' }
      const usage = { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
      if (entry.error !== undefined) throw new Error(entry.error)
      if (entry.hang === true) {
        await new Promise((_resolve, reject) => {
          if (options.signal?.aborted) return reject(new Error('aborted'))
          options.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        })
        return
      }
      if (entry.breakStream !== undefined) {
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: entry.partial ?? 'partial' }
        throw new Error(entry.breakStream)
      }
      let index = 0
      if (entry.text !== undefined) {
        yield { type: 'block-start', index, blockType: 'text' }
        yield { type: 'text-delta', index, text: entry.text }
        yield { type: 'block-end', index, block: { type: 'text', text: entry.text } }
        index += 1
      }
      for (const call of entry.calls ?? []) {
        const id = call.id === undefined ? this.callId(this.calls * 100 + index) : ToolCallId(call.id)
        const argumentsJson = typeof call.args === 'string' ? call.args : JSON.stringify(call.args ?? {})
        yield { type: 'block-start', index, blockType: 'tool-call' }
        yield {
          type: 'block-end',
          index,
          block: { type: 'tool-call', id, name: call.name, arguments: argumentsJson }
        }
        index += 1
      }
      yield usage
      yield { type: 'finish', reason: { kind: (entry.calls ?? []).length > 0 ? 'tool-calls' : 'stop' } }
    }
  }
}

/** Plugin = a cordis plugin object or module namespace. */
const pluginOf = (mod) => (mod.default !== undefined && mod.apply === undefined ? mod.default : mod)

/**
 * Create the runtime.
 * @param {object} options
 * @param {string} options.root - scratch folder owned by this runtime (removed by `dispose`).
 * @param {{ label: string, cms: string }[]} [options.sites]
 * @param {'workspace-write' | 'read-only' | 'danger-full-access'} [options.mode]
 * @param {'never' | 'legacy-ask'} [options.approval] - `legacy-ask`: dsh's own `ask` default with browsers that never answer.
 * @param {{ subprocessDocker?: string, siteTabs?: string, siteTools?: string }} [options.productDirs] - scratch copies of product folders (RED).
 * @param {boolean} [options.siteTabs] - load the shipped @tracy/dsh-site-tabs host bundle.
 * @param {boolean} [options.siteTools] - load the shipped @tracy/dsh-site-tools host bundle.
 * @param {number} [options.seed]
 * @param {(line: string) => void} [options.warn]
 */
export async function createRuntime(options) {
  /** @type {(() => unknown)[]} undo steps, run last-first if boot fails part-way */
  const undo = []
  try {
    return await bootRuntime(options, undo)
  } catch (error) {
    for (const step of undo.reverse()) {
      try {
        await step()
      } catch {
        // best effort: the original error is what the caller needs
      }
    }
    throw error
  }
}

async function bootRuntime(options, undo) {
  const {
    root,
    sites = [
      { label: 'a1', cms: 'wordpress' },
      { label: 'b1', cms: 'joomla' }
    ],
    mode = 'workspace-write',
    approval = 'never',
    productDirs = {},
    seed = 20261005,
    warn = () => {}
  } = options
  const world = buildWorld(root, sites)
  const door = await startDoor()
  undo.push(() => door.close())
  const saved = {}
  const env = {
    TRACY_SITES_ROOT: world.sitesRoot,
    MCP_TRACY_ORIGIN: door.origin,
    DSH_HOME: world.deskHome
  }
  const restoreEnv = () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
  undo.push(restoreEnv)
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key]
    process.env[key] = value
  }
  // The provider logs every denial to stderr; capture it instead of letting it scroll.
  const denials = []
  const originalError = console.error
  undo.push(() => {
    console.error = originalError
  })
  console.error = (...args) => {
    const line = args.map(String).join(' ')
    if (line.startsWith('subprocess-docker: DENY')) denials.push(line)
    else originalError.apply(console, args)
  }

  const { Context } = await dep('@deepseek-ai/cordis')
  const llm = await dep('@deepseek-ai/dsh-llm')
  const sessionPkg = await dep('@deepseek-ai/dsh-session')
  const toolsPkg = await dep('@deepseek-ai/dsh-tools')
  const ctx = new Context()
  undo.push(() => ctx.fiber.dispose())
  await ctx.plugin(llm.default ?? llm.LlmRuntime)
  await ctx.plugin((await dep('@deepseek-ai/dsh-session')).default)
  await ctx.plugin((await dep('@deepseek-ai/dsh-session-projection')).default)
  await ctx.plugin((await dep('@deepseek-ai/dsh-system-prompt')).default, { personaPrefix: '' })
  await ctx.plugin(toolsPkg.default)
  await ctx.plugin((await dep('@deepseek-ai/dsh-agent')).default)
  await ctx.plugin((await dep('@deepseek-ai/dsh-agent-loop')).default, { agents: [] })

  const subprocessDir =
    productDirs.subprocessDocker ?? path.join(REPO, 'packages/tools/tracy-subprocess-docker')
  const sandboxDir = productDirs.sandboxDocker ?? path.join(REPO, 'packages/tools/tracy-sandbox-docker')
  const { DockerSandbox } = await import(url(path.join(sandboxDir, 'index.js')))
  const { DockerSubprocessRuntime } = await import(url(path.join(subprocessDir, 'index.js')))

  // The docker seam: a wrapper script (so the provider can exec it as `docker`) over fake-docker.mjs.
  const dockerLog = path.join(root, 'docker.jsonl')
  const dockerMode = `${dockerLog}.mode`
  fs.writeFileSync(dockerLog, '')
  const wrapper = path.join(root, 'docker')
  fs.writeFileSync(
    wrapper,
    `#!/bin/sh\nexec "${process.execPath}" "${path.join(FIXTURES, 'fake-docker.mjs')}" "${dockerLog}" "$@"\n`,
    {
      mode: 0o755
    }
  )

  // The approval policy and the permission presets are READ FROM the native bundle's profile rows
  // (what a host actually loads), so a profile that stops saying `never` changes this composition.
  const profile = readNativeApproval(
    options.profile?.native ?? path.join(REPO, 'packages/bundle/tracy-native/cordis.patch.yml')
  )
  const permissionPresets =
    approval === 'never'
      ? profile.presets
      : Object.fromEntries(
          ['read-only', 'workspace-write', 'danger-full-access'].map((name) => [
            name,
            { sandbox: name, approval: 'ask' }
          ])
        )
  // Legacy `ask`: browsers that are forwarded the question and never answer (what dsh-passwords does).
  let forwardedToBrowsers = 0
  let forwarderRegistered = false
  if (approval === 'legacy-ask') {
    // Registered BEFORE the provider, as the gateway can be up before this plugin loads.
    await ctx.plugin(pluginOf(await dsh('interaction/user-approval')), { policy: 'ask' })
    forwarderRegistered = true
    ctx.on('approval/request', () => {
      forwardedToBrowsers += 1
      return new Promise(() => {})
    })
  }
  await ctx.plugin(DockerSandbox, {})
  await ctx.plugin(pluginOf(await dsh('sandbox/sandbox-policy')), { mode, workspaceRoot: world.sitesRoot })
  await ctx.plugin(DockerSubprocessRuntime, { sitesRoot: world.sitesRoot, docker: wrapper })
  await ctx.plugin(pluginOf(await dsh('shell/bash-sandbox')), { timeoutMs: 20000 })
  if (approval === 'never') {
    await ctx.plugin(pluginOf(await dsh('interaction/user-approval')), { policy: profile.policy })
    // Browsers that would be forwarded a question and never answer — present so that "no question
    // reached a customer" is something the run MEASURES, not an absence it assumes.
    forwarderRegistered = true
    ctx.on('approval/request', () => {
      forwardedToBrowsers += 1
      return new Promise(() => {})
    })
  }
  await ctx.plugin(pluginOf(await dsh('interaction/permission-presets')), { presets: permissionPresets })
  await ctx.plugin(pluginOf(await dsh('shell/shell-env')), {})
  await ctx.plugin(pluginOf(await dsh('shell/tool-bash')), {})
  await ctx.plugin(pluginOf(await dsh('attachment/attachment-local')), {})
  await ctx.plugin(pluginOf(await dsh('fs/fs-sandbox')), {})
  await ctx.plugin(pluginOf(await dsh('fs/fs-observation-policy')), {})
  await ctx.plugin(pluginOf(await dsh('fs/tool-fs')), {})
  await ctx.plugin(pluginOf(await dsh('fs/tool-fs-search')), { sampleOverCapGlobResults: false })
  await ctx.plugin(pluginOf(await dsh('fs/tool-str-replace-editor')), {})

  // Spies — they observe, never alter: which paths the fs backend and the process backend were given.
  const backend = { fs: [], spawn: [], fixtures: [] }
  const fsService = ctx.fs
  for (const method of [
    'stat',
    'readText',
    'streamText',
    'readBytes',
    'readByteRange',
    'listDir',
    'writeText',
    'editText'
  ]) {
    const original = fsService[method]
    if (typeof original !== 'function') continue
    fsService[method] = function spy(target, ...rest) {
      let where = null
      try {
        where = fsService.processPath(target)
      } catch {
        where = String(target)
      }
      backend.fs.push({ method, path: where })
      return original.call(this, target, ...rest)
    }
  }
  for (const method of ['resolve', 'lstat']) {
    const original = fsService[method]
    if (typeof original !== 'function') continue
    fsService[method] = function spy(target, ...rest) {
      backend.fs.push({ method, path: typeof target === 'string' ? target : String(target) })
      return original.call(this, target, ...rest)
    }
  }
  const originalSpawn = ctx.subprocess.spawn
  ctx.subprocess.spawn = function spy(spec) {
    backend.spawn.push({ argv: [...spec.argv], cwd: spec.cwd })
    return originalSpawn.call(this, spec)
  }

  // Fixture tools standing in for backends this host does not load.
  const { defineContentToolFixture } = toolsPkg
  const fixtureTool = (name, parameters, extra = {}) =>
    ctx.tools.register(
      defineContentToolFixture({
        name,
        description: `qa fixture backend for ${name}`,
        parameters,
        async execute(args, token) {
          backend.fixtures.push({ name, args })
          if (extra.execute !== undefined) return extra.execute(args, token)
          return [{ type: 'text', text: `fixture:${name}:ok` }]
        }
      })
    )
  fixtureTool('pwsh', {
    command: { type: 'string', required: true },
    description: { type: 'string', required: true },
    workdir: { type: 'string' }
  })
  fixtureTool('terminal_open', { cwd: { type: 'string' } })
  fixtureTool(
    'qa_throw',
    {},
    {
      execute: async () => {
        throw new Error('qa-tool-failure')
      }
    }
  )
  // A tool that writes a file after a delay unless it is cancelled first: the probe for "no writes
  // after quiescence" (`cancel`). It honours the abort signal the way a well-behaved tool must.
  fixtureTool(
    'qa_slow_write',
    { file: { type: 'string', required: true } },
    {
      execute: async (args, token) => {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 600)
          token?.signal?.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true })
        })
        if (token?.signal?.aborted) throw new Error('aborted before the write')
        fs.writeFileSync(args.file, 'late-write')
        return [{ type: 'text', text: 'written' }]
      }
    }
  )

  const ScriptedModel = scriptedModelFactory(llm)
  const model = new ScriptedModel(seed)
  ctx.llm.registerAdapter(['qa'], model)

  const agentsBySession = new Map()
  const facadeServices = {
    sessions: { get: (id) => agentsBySession.get(String(id))?.session },
    tracyAssertion: { mint: (email) => `signed:${email}` }
  }
  const facade = (extraWebRoutes = []) => ({
    webServer: { register: (route) => (extraWebRoutes.push(route), () => {}) },
    tools: ctx.tools,
    agents: ctx.agents,
    effect: (setup) => {
      const dispose = setup()
      if (typeof dispose === 'function') cleanups.push(dispose)
    },
    on: (...args) => ctx.on(...args),
    get: (name) => facadeServices[name]
  })
  const cleanups = []

  const loadedProduct = {}
  if (options.siteTabs === true) {
    const dir = productDirs.siteTabs ?? path.join(REPO, 'packages/site/tracy-site-tabs')
    const mod = await import(url(path.join(dir, 'lib/index.js')))
    mod.apply(facade())
    loadedProduct.siteTabs = dir
  }
  if (options.siteTools === true) {
    const dir = productDirs.siteTools ?? path.join(REPO, 'packages/tools/tracy-site-tools')
    const mod = await import(url(path.join(dir, 'lib/index.js')))
    mod.apply(facade(), { origin: door.origin, ...options.siteToolsConfig })
    loadedProduct.siteTools = dir
  }

  let counter = 0
  const agents = []

  /**
   * Open one session on a site (or on no site) as a person typing.
   * @param {object} [opts]
   * @param {string | null} [opts.cwd]
   * @param {string} [opts.email]
   * @param {string} [opts.policy] - `ask` to pin a legacy session.
   */
  async function session(opts = {}) {
    counter += 1
    const id = sessionPkg.SessionId(`qa-${seed}-${counter}`)
    const meta = opts.cwd === null ? {} : { cwd: opts.cwd }
    const agent = await ctx.agentLoop.create(id, { provider: 'qa', model: 'qa' }, meta)
    agentsBySession.set(String(id), agent)
    agents.push(agent)
    if (opts.policy !== undefined) {
      const { setApprovalPolicy } = await dsh('interaction/user-approval')
      setApprovalPolicy(agent.session, opts.policy)
    }
    return { agent, id, email: opts.email ?? 'an@example.test' }
  }

  /**
   * Run one turn of a script on a session, bounded by `deadlineMs`. On timeout the turn is cancelled
   * and the result says so — a hang is a finding, never a wait.
   */
  async function drive(
    sess,
    script,
    { prompt = 'go', deadlineMs = 15000, cancelAfterMs = null, cancelWhen = null } = {}
  ) {
    const { agent, id, email } = sess
    model.script(id, script)
    const before = {
      fs: backend.fs.length,
      spawn: backend.spawn.length,
      fixtures: backend.fixtures.length,
      denials: denials.length,
      door: door.requests.length
    }
    const started = Date.now()
    const eventsBefore = agent.session.snapshotEvents().length
    agent.followup(
      llm.createUserMessage({
        content: [{ type: 'text', text: prompt }],
        source: { kind: 'user', prompter: { user: 'An', email } }
      })
    )
    let cancelTimer
    // Cancel when the thing to be cancelled has actually started (`cancelWhen`), never on a wall clock
    // alone: a loaded machine can take longer than any fixed delay to get the call going.
    let poll
    let cancelledAt = null
    if (cancelWhen !== null) {
      poll = setInterval(() => {
        if (cancelWhen()) {
          clearInterval(poll)
          cancelledAt = Date.now()
          agent.cancel({ kind: 'user' })
        }
      }, 20)
    } else if (cancelAfterMs !== null)
      cancelTimer = setTimeout(() => agent.cancel({ kind: 'user' }), cancelAfterMs)
    let timer
    const outcome = await Promise.race([
      agent.whenIdle().then(() => 'idle'),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve('timeout'), deadlineMs)
      })
    ])
    clearTimeout(timer)
    clearTimeout(cancelTimer)
    clearInterval(poll)
    if (outcome === 'timeout') {
      agent.cancel({ kind: 'user' })
      await Promise.race([agent.whenIdle(), new Promise((resolve) => setTimeout(resolve, 5000))])
    }
    const allEvents = agent.session.snapshotEvents()
    const events = allEvents.slice(eventsBefore)
    const calls = events
      .filter((e) => e.type === 'tool/call')
      .map((e) => ({ callId: e.data.callId, name: e.data.name, arguments: safeJson(e.data.arguments) }))
    const results = events
      .filter((e) => e.type === 'tool/result')
      .map((e) => ({
        callId: e.data.message?.toolCallId,
        isError: e.data.message?.isError === true,
        text: (e.data.message?.content ?? []).map((part) => part.text ?? '').join('\n')
      }))
    const turnEnds = events.filter((e) => e.type === 'turn/end').map((e) => e.data.reason)
    return {
      settled: outcome === 'idle',
      ms: Date.now() - started,
      msAfterCancel: cancelledAt === null ? null : Date.now() - cancelledAt,
      events,
      calls,
      results,
      turnEnds,
      trace: {
        modelRequests: model.requests.filter((r) => String(r.sessionId) === String(id)).length,
        toolCalls: calls.length,
        toolResults: results.length,
        fsOps: backend.fs.slice(before.fs),
        spawns: backend.spawn.slice(before.spawn),
        // Spawns that ran on the harness host itself (ripgrep for glob/grep); stamped shell argv goes to docker.
        harnessSpawns: backend.spawn.slice(before.spawn).filter((spawn) => spawn.argv[0] !== MARKER),
        fixtures: backend.fixtures.slice(before.fixtures),
        denials: denials.slice(before.denials),
        doorRequests: door.requests.slice(before.door)
      }
    }
  }

  const dockerCalls = () =>
    readTextSync(dockerLog)
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  /** The `docker exec` calls that carried a command, with container / user / workdir pulled out. */
  const execs = () =>
    dockerCalls()
      .filter((call) => call.argv[0] === 'exec')
      .map((call) => {
        const argv = call.argv
        let user = null
        let workdir = null
        let index = 1
        while (index < argv.length) {
          const token = argv[index]
          if (token === '-u') {
            user = argv[index + 1]
            index += 2
          } else if (token === '-w') {
            workdir = argv[index + 1]
            index += 2
          } else if (token === '-e') index += 2
          else if (token.startsWith('-')) index += 1
          else break
        }
        const program = argv.slice(index + 1)
        const reaper = program.some((part) => String(part).includes('TRACY_EXEC_ID'))
        return { container: argv[index], user, workdir, program, reaper, argv }
      })
  const setDocker = (script) => fs.writeFileSync(dockerMode, JSON.stringify(script))

  async function dispose() {
    for (const stop of cleanups.splice(0)) {
      try {
        stop()
      } catch {
        // best effort
      }
    }
    try {
      await ctx.fiber.dispose()
    } catch (error) {
      warn(`dispose: ${error.message}`)
    }
    await door.close()
    console.error = originalError
    restoreEnv()
  }

  return {
    ctx,
    world,
    door,
    model,
    backend,
    denials,
    session,
    drive,
    execs,
    dockerCalls,
    setDocker,
    dispose,
    forwardedToBrowsers: () => forwardedToBrowsers,
    forwarderRegistered: () => forwarderRegistered,
    loadedProduct,
    tools: () => ctx.tools.schemas(),
    productDirs: { subprocessDocker: subprocessDir }
  }
}

function safeJson(value) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

/** Remove a scratch folder after checking it lies inside `allowedRoot` (never delete elsewhere). */
export function removeScratch(dir, allowedRoot) {
  const real = (p) => {
    try {
      return fs.realpathSync(p)
    } catch {
      return path.resolve(p)
    }
  }
  const resolved = real(dir)
  const base = real(allowedRoot)
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error(`refusing to remove ${resolved}: outside ${base}`)
  }
  fs.rmSync(resolved, { recursive: true, force: true })
}

export const tmpRootFor = (artifactRoot, label) => {
  const base = path.join(artifactRoot, 'scratch')
  fs.mkdirSync(base, { recursive: true })
  return fs.realpathSync(fs.mkdtempSync(path.join(base, `${label}-`)))
}

export { os, spawnSync }

/** A valid 2x2 RGB PNG, built here so no binary fixture is committed. */
export function pngBytes() {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(body) >>> 0)
    return Buffer.concat([head, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(2, 0)
  ihdr.writeUInt32BE(2, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const row = Buffer.from([0, 255, 0, 0, 0, 255, 0])
  const raw = Buffer.concat([row, row])
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/**
 * The EmDash MCP door as `tracy_emdash` sees it through `config.exec` (the real code runs
 * `docker exec -i <site>-web-1 …`): a scripted MCP that answers reads and writes with one entry.
 * This is the seam for the in-container EmDash server; nothing here is EmDash itself.
 */
export const EMDASH_ENTRY_ID = '01M36TA83763RSVSN5R28DZ0E1'
export function emdashExecSeam() {
  const entry = {
    id: EMDASH_ENTRY_ID,
    slug: 'home',
    locale: 'en',
    status: 'published',
    version: 3,
    updatedAt: '2026-09-24T04:36:45.040Z',
    liveRevisionId: 'r1',
    draftRevisionId: 'r1',
    data: { title: 'Home' }
  }
  const rev = 'MzoyMDI2LTA5LTI0VDA0OjM2OjQ1LjA0MFo='
  return async (input) => {
    const request = JSON.parse(String(input.stdin))
    const name = request.params?.name
    const data = name === 'content_get' ? { item: entry, _rev: rev } : { item: entry }
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'text', text: JSON.stringify(data) }] }
    })
    return { code: 0, stdout: `TRACY_MCP 200\n${body}`, stderr: '', timedOut: false }
  }
}

/**
 * The approval policy and permission presets of the native bundle, read from its profile rows.
 * Throws when the rows are not in the expected shape (an unparseable profile is an ENV fact, never a pass).
 */
export function readNativeApproval(file) {
  const text = readTextSync(file)
  const policy = /^- id: approval\n {2}config:\n {4}policy: (\w+)/m.exec(text)?.[1]
  if (policy === undefined) throw new Error(`profile ${file}: no approval row with a policy`)
  const presets = {}
  for (const mode of ['read-only', 'workspace-write', 'danger-full-access']) {
    const m = new RegExp(`${mode}:\\n\\s+sandbox: ([a-z-]+)\\n\\s+approval: (\\w+)`).exec(text)
    if (m === null) throw new Error(`profile ${file}: no permission preset ${mode}`)
    presets[mode] = { sandbox: m[1], approval: m[2] }
  }
  return { policy, presets }
}
