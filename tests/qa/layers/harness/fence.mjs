/**
 * The path-fence scenarios: every (tool, path argument) entry of `FS_TOOL_ARGS` driven through the
 * real session → dispatcher → `tools/pre-execute` hook → tool path, with canaries in site B and on
 * the host. One table of variants (partitions of the input space); `runFenceVariant` executes one.
 *
 * Verdict rule for a DENY variant: the call's result is an error, the error text is the Tracy hook's
 * (`subprocess-docker:`) or dsh's schema validation — never an incidental failure — the backend
 * (fs service / docker / fixture) saw nothing of the call, no canary changed, and no sentinel
 * reached the model. For an ALLOW variant: the call succeeds and the backend was reached (the
 * positive control that stops a deny test from passing because the tool is simply broken).
 */
import fs from 'node:fs'
import path from 'node:path'

import { SENTINEL, canaryHashes, pngBytes } from './runtime.mjs'
import { readTextSync } from '../../lib/bounded-reader.mjs'

/** Tool → how to build its arguments around one path value, and what proves an allowed call worked. */
export const FENCE_TOOLS = Object.freeze({
  read: {
    arg: 'file_path',
    shape: 'file',
    build: (v) => ({ file_path: v }),
    leaf: 'own.txt',
    proof: (r) => (r.text.includes(SENTINEL.siteA) ? null : 'read output lacks the site sentinel')
  },
  read_image: {
    arg: 'file_path',
    shape: 'file',
    build: (v) => ({ file_path: v }),
    leaf: 'p.png',
    proof: (r) => (r.text.includes('image/png') ? null : 'read_image output is not an image')
  },
  write: {
    arg: 'file_path',
    shape: 'file',
    build: (v) => ({ file_path: v, content: 'QA-WRITE' }),
    leaf: 'w.txt',
    linkLeaf: 'e.txt',
    pre: (leafAbs) => [{ name: 'read', args: { file_path: leafAbs } }],
    content: 'content',
    proof: (r, ctx) => (readIf(ctx.leafPath) === 'QA-WRITE' ? null : 'write did not land in the site folder')
  },
  edit: {
    arg: 'file_path',
    shape: 'file',
    build: (v) => ({ file_path: v, old_string: 'QA-OLD', new_string: 'QA-NEW' }),
    leaf: 'e.txt',
    content: 'new_string',
    pre: (leafAbs) => [{ name: 'read', args: { file_path: leafAbs } }],
    proof: (r, ctx) => (readIf(ctx.leafPath).includes('QA-NEW') ? null : 'edit did not change the site file')
  },
  str_replace_editor: {
    arg: 'path',
    shape: 'file',
    build: (v) => ({ command: 'view', path: v }),
    leaf: 'own.txt',
    proof: (r) => (r.text.includes(SENTINEL.siteA) ? null : 'view output lacks the site sentinel')
  },
  glob: {
    arg: 'path',
    shape: 'dir',
    build: (v) => ({ pattern: '*', path: v }),
    leaf: '',
    proof: (r) => (r.text.includes('own.txt') ? null : 'glob did not list the site files')
  },
  'glob:pattern': {
    tool: 'glob',
    arg: 'pattern',
    shape: 'pattern',
    build: (v) => ({ pattern: v }),
    leaf: '*.txt',
    proof: (r) => (r.text.includes('own.txt') ? null : 'glob did not list the site files')
  },
  grep: {
    arg: 'path',
    shape: 'dir',
    build: (v) => ({ pattern: 'QA-OWN', path: v }),
    leaf: '',
    content: 'pattern',
    proof: (r) => (r.text.includes(SENTINEL.siteA) ? null : 'grep did not find the site sentinel')
  },
  bash: {
    arg: 'workdir',
    shape: 'dir',
    build: (v) => ({ command: 'echo qa', description: 'qa', workdir: v }),
    leaf: '',
    content: 'command',
    docker: true,
    proof: () => null
  },
  pwsh: {
    arg: 'workdir',
    shape: 'dir',
    build: (v) => ({ command: 'echo qa', description: 'qa', workdir: v }),
    leaf: '',
    content: 'command',
    fixture: true,
    proof: () => null
  },
  terminal_open: {
    arg: 'cwd',
    shape: 'dir',
    build: (v) => ({ cwd: v }),
    leaf: '',
    fixture: true,
    proof: () => null
  }
})

const readIf = (file) => {
  try {
    return readTextSync(file)
  } catch {
    return ''
  }
}

/** `fs-fence:<tool>.<arg>` → the FENCE_TOOLS key. */
export function fenceKey(itemId) {
  const [, rest] = itemId.split(':')
  const [tool, arg] = rest.split('.')
  if (tool === 'glob' && arg === 'pattern') return 'glob:pattern'
  return tool
}

/** The sites every fence scenario shares. */
export const FENCE_SITES = Object.freeze([
  { label: 'a1', cms: 'wordpress' },
  { label: 'a1x', cms: 'wordpress' },
  { label: 'b1', cms: 'joomla' },
  { label: 'c1', cms: 'emdash' },
  { label: 'js', cms: 'joomla', sealed: true }
])

/** Put the files every scenario expects in site A / B (idempotent, called before each case). */
export function prepareWorld(rt) {
  const { sites, root, deskHome } = rt.world
  for (const label of ['a1', 'b1']) {
    const web = path.join(sites[label].dir, '.webroot')
    fs.mkdirSync(web, { recursive: true })
    fs.writeFileSync(path.join(web, 'e.txt'), 'QA-OLD here\n')
    fs.writeFileSync(path.join(web, 'p.png'), pngBytes())
    fs.writeFileSync(path.join(web, `only-${label}.txt`), `${SENTINEL.siteA} only ${label}\n`)
    fs.rmSync(path.join(web, 'w.txt'), { force: true })
    for (const name of fs.readdirSync(web))
      if (name.startsWith('lnk-')) fs.rmSync(path.join(web, name), { force: true })
  }
  const web = path.join(sites.a1.dir, '.webroot')
  fs.symlinkSync(sites.b1.canary, path.join(web, 'lnk-file'))
  fs.symlinkSync(sites.b1.dir, path.join(web, 'lnk-dir'))
  for (const leaf of ['own.txt', 'p.png', 'e.txt'])
    fs.symlinkSync(path.join(web, leaf), path.join(web, `lnk-in-${leaf}`))
  fs.symlinkSync(web, path.join(web, 'lnk-dir-in'))
  return { deskHome, root }
}

/** The absolute allowed value for a tool, in one site. */
export function allowedValue(spec, site) {
  const web = path.join(site.dir, '.webroot')
  if (spec.shape === 'pattern') return '.webroot/*.txt'
  if (spec.shape === 'dir') return spec.docker || spec.fixture ? site.dir : web
  return path.join(web, spec.leaf)
}

/** What each variant asks for. `value(world, spec)` is the path value; `deny` its expectation. */
export const FENCE_VARIANTS = Object.freeze({
  'happy-inside': { deny: false, value: (w, spec) => allowedValue(spec, w.sites.a1) },
  'happy-content': { deny: false, content: true },
  empty: { deny: true, value: () => '' },
  'invalid-type': { deny: true, schema: true, value: () => 123 },
  'schema-missing': { deny: true, schema: true, omit: true },
  'boundary-prefix-sibling': { deny: true, value: (w) => path.join(w.sites.a1x.dir, 'canary.txt') },
  'boundary-dotdot-inside': {
    // A `..` segment inside the site still stays inside it for the file tools; the shell providers
    // refuse any `..` in a working directory (SYSTEM.md §4a: the provider checks the label and `..`).
    deny: (spec) => spec.docker === true || spec.fixture === true,
    value: (w, spec) => {
      const web = path.join(w.sites.a1.dir, '.webroot')
      if (spec.shape === 'pattern') return '.webroot/../.webroot/*.txt'
      if (spec.shape === 'dir')
        return spec.docker || spec.fixture ? `${w.sites.a1.dir}/.webroot/..` : `${web}/../.webroot`
      return `${web}/../.webroot/${spec.leaf}`
    }
  },
  'traversal-abs': { deny: true, value: (w) => `${w.sites.a1.dir}/.webroot/../../b1/canary.txt` },
  'traversal-rel': { deny: true, value: () => '../b1/canary.txt' },
  'symlink-file': { deny: true, value: (w) => path.join(w.sites.a1.dir, '.webroot', 'lnk-file') },
  'symlink-dir-new': {
    deny: true,
    value: (w) => path.join(w.sites.a1.dir, '.webroot', 'lnk-dir', 'new.txt')
  },
  'symlink-inside': {
    deny: false,
    value: (w, spec) =>
      spec.shape === 'pattern'
        ? '.webroot/lnk-dir-in/*.txt'
        : path.join(
            w.sites.a1.dir,
            '.webroot',
            spec.shape === 'file' ? `lnk-in-${spec.linkLeaf ?? spec.leaf}` : 'lnk-dir-in'
          ),
    // The file the link leads to, for the effect proof.
    target: (spec) => spec.linkLeaf ?? spec.leaf
  },
  'other-site': { deny: true, value: (w) => w.sites.b1.canary, owner: true },
  'host-deskhome': { deny: true, value: (w) => w.canaries.host },
  'host-outside': { deny: true, value: (w) => w.canaries.outside },
  'host-etc': { deny: true, value: () => '/etc/hosts' },
  'missing-cwd': { deny: true, noCwd: true, value: (w, spec) => allowedValue(spec, w.sites.a1) },
  repeat: { deny: true, repeat: true, value: (w) => w.sites.b1.canary },
  escalation: { deny: true, escalate: true, value: (w) => w.canaries.host }
})

const FENCE_MARK = 'subprocess-docker:'

/** Tools whose live schema carries the escalation field. */
export function hasEscalation(schemaByTool, tool) {
  return schemaByTool?.[tool]?.properties?.sandbox_permissions !== undefined
}

function backendTouched(trace, execsNew) {
  // `spawns` includes the ripgrep run glob/grep make on the harness side and every docker exec.
  return trace.fsOps.length + execsNew.length + trace.fixtures.length + trace.harnessSpawns.length
}

/**
 * Run one fence variant for one tool entry on a shared runtime.
 * @returns {Promise<{ controls: any[], checks: any[], evidence: any }>}
 */
export async function runFenceVariant(rt, toolKey, variantKey, { expectText = null } = {}) {
  const spec = FENCE_TOOLS[toolKey]
  const tool = spec.tool ?? toolKey
  const variantDef = FENCE_VARIANTS[variantKey]
  if (spec === undefined || variantDef === undefined)
    throw new Error(`unknown fence case ${toolKey}/${variantKey}`)
  const variant = {
    ...variantDef,
    deny: typeof variantDef.deny === 'function' ? variantDef.deny(spec) : variantDef.deny
  }
  const w = rt.world
  prepareWorld(rt)
  const before = canaryHashes(w)
  const controls = []
  const checks = []
  const evidence = { tool, arg: spec.arg, variant: variantKey }
  const leafPath = spec.shape === 'file' ? path.join(w.sites.a1.dir, '.webroot', spec.leaf) : null

  const sess = await rt.session({ cwd: variant.noCwd === true ? null : w.sites.a1.dir })
  const run = async (args, { s = sess, pre = [] } = {}) => {
    const n0 = rt.execs().length
    const steps = [...pre.map((c) => ({ calls: [c] })), { calls: [{ name: tool, args }] }]
    const r = await rt.drive(s, steps)
    const last = r.results.at(-1) ?? { isError: true, text: '(no result)' }
    return {
      r,
      last,
      execsNew: rt
        .execs()
        .slice(n0)
        .filter((e) => !e.reaper)
    }
  }

  if (variant.content === true) {
    // Content arguments are never paths: text that IS an existing host path (exactly, so the generous
    // branch would fence it if the argument were read as a path) must be accepted as content.
    if (spec.content === undefined) throw new Error(`${toolKey} has no content argument`)
    const base = spec.build(allowedValue(spec, w.sites.a1))
    const hostPath = w.canaries.host
    const args = { ...base, [spec.content]: hostPath }
    if (tool === 'edit') fs.writeFileSync(leafPath, `QA-OLD ${hostPath}\n`)
    const { last, r } = await run(args, { pre: spec.pre?.(leafPath) ?? [] })
    controls.push({
      id: 'dispatch-reached-tool',
      ok: r.trace.toolCalls >= 1 && r.settled,
      detail: `settled=${r.settled}`
    })
    checks.push({
      id: 'content-not-fenced',
      ok: !last.isError || !last.text.includes(FENCE_MARK),
      detail: last.text.slice(0, 200)
    })
    checks.push({
      id: 'canaries-unchanged',
      ok: JSON.stringify(before) === JSON.stringify(canaryHashes(w)),
      detail: 'a content argument must not make the call touch the host file'
    })
    evidence.result = last.text.slice(0, 300)
    return { controls, checks, evidence, trace: r.trace }
  }

  if (variant.deny === false) {
    const value = variant.value(w, spec)
    const { last, execsNew, r } = await run(spec.build(value), { pre: spec.pre?.(value) ?? [] })
    evidence.value = value
    const proofPath = variant.target ? path.join(w.sites.a1.dir, '.webroot', variant.target(spec)) : leafPath
    controls.push({ id: 'turn-settled', ok: r.settled, detail: `ms=${r.ms}` })
    checks.push({ id: 'call-allowed', ok: !last.isError, detail: last.text.slice(0, 300) })
    const reached = backendTouched(r.trace, execsNew) > 0
    checks.push({
      id: 'backend-reached',
      ok: reached,
      detail: `fs=${r.trace.fsOps.length} exec=${execsNew.length} fixture=${r.trace.fixtures.length}`
    })
    if (spec.docker) {
      checks.push({
        id: 'routed-to-own-container',
        ok: execsNew.length === 1 && execsNew[0].container === 'a1-web-1',
        detail: JSON.stringify(execsNew.map((e) => e.container))
      })
    }
    const problem = spec.proof(last, { leafPath: proofPath })
    // A glob pattern with `..` or through a link is judged by the fence, not matched by ripgrep: the
    // fence let it through (the call is not an error) and the listing may legitimately be empty.
    const lenient =
      spec.shape === 'pattern' && ['boundary-dotdot-inside', 'symlink-inside'].includes(variantKey)
    // The effect is measured only where the harness can read it back; elsewhere no check is claimed
    // (a check that cannot fail is not a check) and the evidence says what was not measured.
    if (spec.fixture || spec.docker || lenient) {
      evidence.effectProof = `not measured: ${spec.fixture ? 'fixture backend' : spec.docker ? 'fake docker (argv only)' : 'glob judged by the fence, listing may be empty'}`
    } else checks.push({ id: 'effect-proof', ok: problem === null, detail: problem ?? 'ok' })
    evidence.result = last.text.slice(0, 300)
    return { controls, checks, evidence, trace: r.trace }
  }

  // ── deny variants ──
  if (variant.owner === true) {
    // Positive control: the canary is readable by its OWNER (a session on site B), so a deny for A
    // is the fence's doing and not a broken canary.
    const owner = await rt.session({ cwd: w.sites.b1.dir })
    const ownValue = variant.value(w, spec)
    const readOnly = ['read', 'str_replace_editor'].includes(tool)
    const ownTarget =
      readOnly || spec.shape === 'dir'
        ? spec.shape === 'dir'
          ? allowedValue(spec, w.sites.b1)
          : ownValue
        : allowedValue(spec, w.sites.b1)
    const own = await run(spec.build(ownTarget), { s: owner, pre: spec.pre?.(ownTarget) ?? [] })
    controls.push({
      id: 'owner-reaches-own-canary',
      ok: !own.last.isError && backendTouched(own.r.trace, own.execsNew) > 0,
      detail: own.last.text.slice(0, 160)
    })
  }

  let value = variant.omit === true ? undefined : variant.value?.(w, spec)
  let args = spec.build(value === undefined ? allowedValue(spec, w.sites.a1) : value)
  if (variant.omit === true) delete args[spec.arg]
  if (variant.escalate === true)
    args = { ...args, sandbox_permissions: 'danger-full-access', justification: 'qa' }
  evidence.value = value

  // Positive control for the sandboxed paths: the same tool, same session, allowed value, works.
  if (variant.noCwd !== true) {
    const control = await run(spec.build(allowedValue(spec, w.sites.a1)), {
      pre: spec.pre?.(allowedValue(spec, w.sites.a1)) ?? []
    })
    controls.push({
      id: 'same-tool-works-on-own-site',
      ok: !control.last.isError,
      detail: control.last.text.slice(0, 160)
    })
  }

  const repeats = variant.repeat === true ? 2 : 1
  const texts = []
  for (let i = 0; i < repeats; i += 1) {
    const { last, execsNew, r } = await run(args)
    texts.push(last.text)
    const denied = last.isError
    checks.push({ id: `denied-${i + 1}`, ok: denied, detail: last.text.slice(0, 220) })
    const marker =
      expectText !== null
        ? expectText.test(last.text)
        : variant.schema === true
          ? /invalid arguments|missing required|must be|expected/i.test(last.text) ||
            last.text.includes(FENCE_MARK)
          : last.text.includes(FENCE_MARK)
    checks.push({ id: `refused-by-hook-${i + 1}`, ok: marker, detail: last.text.slice(0, 220) })
    checks.push({
      id: `backend-untouched-${i + 1}`,
      ok: backendTouched(r.trace, execsNew) === 0,
      detail: `fs=${JSON.stringify(r.trace.fsOps.map((o) => o.path)).slice(0, 200)} exec=${execsNew.length} fixture=${r.trace.fixtures.length}`
    })
    checks.push({
      id: `no-sentinel-${i + 1}`,
      ok: ![SENTINEL.siteB, SENTINEL.host].some((s) => last.text.includes(s)),
      detail: 'sentinel in output'
    })
    if (!r.settled) checks.push({ id: `settled-${i + 1}`, ok: false, detail: 'turn did not settle' })
  }
  if (repeats === 2)
    checks.push({
      id: 'repeat-identical',
      ok: texts[0] === texts[1],
      detail: 'second denial differs from the first'
    })

  const after = canaryHashes(w)
  checks.push({
    id: 'canaries-unchanged',
    ok: JSON.stringify(before) === JSON.stringify(after),
    detail: JSON.stringify({ before, after })
  })
  evidence.result = texts[0]?.slice(0, 300)
  return { controls, checks, evidence }
}

/**
 * The message the workdir guard (`workdirDecision`, registered BEFORE the path fence) answers with,
 * by variant. SYSTEM.md §4a names this guard as what refuses a `workdir` outside the session's site;
 * the fence would refuse the same calls with a different sentence, so the sentence says who denied.
 */
export const GUARD_TEXT = Object.freeze({
  'other-site': /belongs to another site/,
  'boundary-prefix-sibling': /belongs to another site/,
  'traversal-abs': /"\.\." segment/,
  'host-outside': /nothing runs on the harness host/,
  'host-deskhome': /nothing runs on the harness host/,
  'missing-cwd': /no session workspace to check the working directory against/
})
