/**
 * RED proofs: recorded mutations of product code, applied to a SCRATCH COPY (the product tree is
 * never written). A mutant is valid only when it boots (every positive control of the case still
 * passes) and the case's own assertion then fails — import / boot / module-missing failures are
 * recorded as an invalid mutant, never as RED.
 *
 * What is copied: only the files a mutation edits plus the siblings Node needs to load them
 * (`node_modules` is symlinked, never copied). Each mutant reports the sha256 of every file it
 * changed, so a proof can be tied to exactly that artifact.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { REPO } from './runtime.mjs'
import { DEFAULT_PATHS, editPreset, presetPlugins } from './staticchecks.mjs'
import { readTextSync } from '../../lib/bounded-reader.mjs'

const sha = (data) => createHash('sha256').update(data).digest('hex')

const PROVIDER_SRC = path.join(REPO, 'packages/tools/tracy-subprocess-docker')
const SANDBOX_SRC = path.join(REPO, 'packages/tools/tracy-sandbox-docker')
const SITE_TABS_SRC = path.join(REPO, 'packages/site/tracy-site-tabs')
const SITE_TOOLS_SRC = path.join(REPO, 'packages/tools/tracy-site-tools')

/** Copy a package folder (without node_modules, tests, docs) and link its node_modules. */
function copyPackage(src, dst, { include }) {
  fs.mkdirSync(dst, { recursive: true })
  for (const rel of include) {
    fs.mkdirSync(path.dirname(path.join(dst, rel)), { recursive: true })
    fs.cpSync(path.join(src, rel), path.join(dst, rel), {
      recursive: true,
      filter: (from) => !from.includes(`${path.sep}node_modules`)
    })
  }
  const modules = path.join(src, 'node_modules')
  if (fs.existsSync(modules)) fs.symlinkSync(fs.realpathSync(modules), path.join(dst, 'node_modules'))
}

/** Replace `find` exactly `count` times (a mutation that does not apply must say so, not no-op). */
function edit(file, find, replacement, { count = 1, all = false } = {}) {
  const text = readTextSync(file)
  const parts = typeof find === 'string' ? text.split(find) : null
  const hits = parts
    ? parts.length - 1
    : (text.match(new RegExp(find.source, `${find.flags.replace('g', '')}g`)) ?? []).length
  if (!all && hits !== count)
    throw new Error(
      `mutation anchor matched ${hits} times in ${path.basename(file)} (expected ${count}): ${String(find).slice(0, 80)}`
    )
  if (hits === 0)
    throw new Error(`mutation anchor not found in ${path.basename(file)}: ${String(find).slice(0, 80)}`)
  const out = parts
    ? parts.join(replacement)
    : text.replace(new RegExp(find.source, `${find.flags.replace('g', '')}g`), replacement)
  fs.writeFileSync(file, out)
  return { file, sha256: sha(out) }
}

/** Remove one `FS_TOOL_ARGS` entry by brace matching. */
function removeEntry(file, tool) {
  const text = readTextSync(file)
  const start = text.indexOf(`\n  ${tool}: {`)
  if (start === -1) throw new Error(`FS_TOOL_ARGS entry ${tool} not found`)
  let depth = 0
  let i = text.indexOf('{', start)
  for (; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1
    if (text[i] === '}') {
      depth -= 1
      if (depth === 0) break
    }
  }
  const end = text[i + 1] === ',' ? i + 2 : i + 1
  const out = text.slice(0, start) + text.slice(end)
  fs.writeFileSync(file, out)
  return { file, sha256: sha(out), note: `removed FS_TOOL_ARGS.${tool}` }
}

/** Remove ONE path argument from the `paths` list of one `FS_TOOL_ARGS` entry. */
function removePathArg(file, tool, arg) {
  const text = readTextSync(file)
  const start = text.indexOf(`\n  ${tool}: {`)
  if (start === -1) throw new Error(`FS_TOOL_ARGS entry ${tool} not found`)
  const open = text.indexOf('paths: [', start)
  const close = text.indexOf(']', open)
  if (open === -1 || close === -1) throw new Error(`FS_TOOL_ARGS.${tool}.paths not found`)
  const list = text.slice(open + 'paths: ['.length, close)
  const items = list
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  if (!items.includes(`'${arg}'`)) throw new Error(`FS_TOOL_ARGS.${tool}.paths has no ${arg}`)
  const out = `${text.slice(0, open)}paths: [${items.filter((x) => x !== `'${arg}'`).join(', ')}${text.slice(close)}`
  fs.writeFileSync(file, out)
  return { file, sha256: sha(out), note: `removed ${arg} from FS_TOOL_ARGS.${tool}.paths` }
}

const FILE_TOOLS = ['read', 'read_image', 'write', 'edit', 'str_replace_editor', 'glob', 'grep']
const SHELL_TOOLS = ['bash', 'pwsh', 'terminal_open']
const DENY_VARIANTS = [
  'boundary-prefix-sibling',
  'traversal-abs',
  'traversal-rel',
  'symlink-file',
  'symlink-dir-new',
  'other-site',
  'host-deskhome',
  'host-outside',
  'host-etc',
  'missing-cwd',
  'repeat',
  'escalation',
  'empty'
]
const ALLOW_VARIANTS = ['happy-inside', 'boundary-dotdot-inside', 'symlink-inside']

/** Assertion id → `{ family, tool, variant }` for fence/guard ids, else null. */
const fenceParts = (id) => {
  const [, family, tk, variant] = id.split('.')
  return family === 'fence' || family === 'guard'
    ? { family, tool: tk.replace('+', ':').split(':')[0], tk, variant }
    : null
}

/**
 * The mutant catalogue. `applies(assertionId)` says which assertions the mutant is meant to turn
 * red; the runner tries applicable mutants in order and keeps the first one that does.
 */
export const MUTANTS = []

const def = (mutant) => MUTANTS.push(mutant)

// ── the path fence and the workdir guard (tracy-subprocess-docker) ───────────────────────────────
// One mutated runtime serves every tool of a group: each case still runs on it individually and must
// turn red on its own assertion (plan §2: a mutant may prove many cases only if each one really ran).
const providerCopy = (scratch) => {
  const dst = path.join(scratch, 'provider')
  copyPackage(PROVIDER_SRC, dst, { include: ['index.js', 'src', 'package.json'] })
  return dst
}
const GUARD_ANCHOR =
  "    ctx.on('tools/pre-execute', async (exec, next) => {\n      const sessionCwd = exec.agent?.session.header.cwd\n      const reason = workdirDecision({"
const tools = (group) => (group === 'file' ? FILE_TOOLS : SHELL_TOOLS)
const nameTest = (names) => `[${names.map((n) => `'${n}'`).join(', ')}].includes(exec.name)`

for (const group of ['file', 'shell']) {
  const names = tools(group)
  def({
    id: `fence-bypass:${group}-tools`,
    title: `the path fence${group === 'shell' ? ' and the workdir guard are' : ' is'} skipped for ${names.join(', ')}`,
    applies: (id) => {
      const p = fenceParts(id)
      return p?.family === 'fence' && names.includes(p.tool) && DENY_VARIANTS.includes(p.variant)
    },
    prepare(scratch) {
      const dst = providerCopy(scratch)
      const changed = [
        edit(
          path.join(dst, 'index.js'),
          '  async pathFenceDecision(exec) {\n',
          `  async pathFenceDecision(exec) {\n    if (${nameTest(names)}) return null\n`
        )
      ]
      if (group === 'shell')
        changed.push(
          edit(
            path.join(dst, 'index.js'),
            GUARD_ANCHOR,
            `    ctx.on('tools/pre-execute', async (exec, next) => {\n      if (${nameTest(names)}) return next()\n      const sessionCwd = exec.agent?.session.header.cwd\n      const reason = workdirDecision({`
          )
        )
      return { productDirs: { subprocessDocker: dst }, changed }
    }
  })
  def({
    id: `fence-deny-all:${group}-tools`,
    title: `every ${names.join(' / ')} call is refused by the fence`,
    applies: (id) => {
      const p = fenceParts(id)
      return (
        (p?.family === 'fence' &&
          names.includes(p.tool) &&
          (ALLOW_VARIANTS.includes(p.variant) || p.variant === 'happy-content')) ||
        (p?.family === 'guard' && names.includes(p.tool) && p.variant === 'happy-inside')
      )
    },
    prepare(scratch) {
      const dst = providerCopy(scratch)
      return {
        productDirs: { subprocessDocker: dst },
        changed: [
          edit(
            path.join(dst, 'index.js'),
            '  async pathFenceDecision(exec) {\n',
            `  async pathFenceDecision(exec) {\n    if (${nameTest(names)}) return 'subprocess-docker: qa mutant refuses every call'\n`
          )
        ]
      }
    }
  })
}
// One entry, or one path argument, at a time: each case must be caught by the change to ITS entry.
const PATH_ARGS = [
  ['read', 'file_path', 'read'],
  ['read_image', 'file_path', 'read_image'],
  ['write', 'file_path', 'write'],
  ['edit', 'file_path', 'edit'],
  ['str_replace_editor', 'path', 'str_replace_editor'],
  ['glob', 'path', 'glob'],
  ['glob', 'pattern', 'glob+pattern'],
  ['grep', 'path', 'grep'],
  ['bash', 'workdir', 'bash'],
  ['pwsh', 'workdir', 'pwsh'],
  ['terminal_open', 'cwd', 'terminal_open']
]
for (const [tool, arg, tk] of PATH_ARGS) {
  def({
    id: `fence-path-arg-removed:${tool}.${arg}`,
    title: `${arg} is no longer a declared path argument of ${tool} in FS_TOOL_ARGS`,
    applies: (id) => {
      const p = fenceParts(id)
      return p?.family === 'fence' && p.tk === tk && p.variant === 'empty'
    },
    prepare(scratch) {
      const dst = providerCopy(scratch)
      return {
        productDirs: { subprocessDocker: dst },
        changed: [removePathArg(path.join(dst, 'src/route.mjs'), tool, arg)]
      }
    }
  })
}
for (const tool of [...FILE_TOOLS, ...SHELL_TOOLS]) {
  def({
    id: `fence-entry-removed:${tool}`,
    title: `the FS_TOOL_ARGS entry of ${tool} is removed (the fence keeps only its generous fallback)`,
    applies: (id) => {
      const p = fenceParts(id)
      return (
        p?.family === 'fence' &&
        p.tool === tool &&
        ['empty', 'symlink-dir-new', 'missing-cwd'].includes(p.variant)
      )
    },
    prepare(scratch) {
      const dst = providerCopy(scratch)
      return {
        productDirs: { subprocessDocker: dst },
        changed: [removeEntry(path.join(dst, 'src/route.mjs'), tool)]
      }
    }
  })
}
def({
  id: 'fence-entry-removed:all',
  title: 'every FS_TOOL_ARGS entry is removed (the fence keeps only its generous fallback)',
  applies: (id) => {
    const p = fenceParts(id)
    return p?.family === 'fence' && ['empty', 'symlink-dir-new', 'missing-cwd'].includes(p.variant)
  },
  prepare(scratch) {
    const dst = providerCopy(scratch)
    return {
      productDirs: { subprocessDocker: dst },
      changed: [...FILE_TOOLS, ...SHELL_TOOLS]
        .filter((t) => t !== 'glob:pattern')
        .map((t) => removeEntry(path.join(dst, 'src/route.mjs'), t))
    }
  }
})
def({
  id: 'content-args-as-paths',
  title: 'content arguments are read as paths',
  applies: (id) => fenceParts(id)?.family === 'fence' && fenceParts(id).variant === 'happy-content',
  prepare(scratch) {
    const dst = providerCopy(scratch)
    return {
      productDirs: { subprocessDocker: dst },
      changed: [
        edit(path.join(dst, 'src/route.mjs'), '    if (known && table.content.includes(arg)) continue\n', '')
      ]
    }
  }
})
def({
  id: 'workdir-guard-drop:all',
  title: 'the workdir guard does not run',
  applies: (id) => {
    const p = fenceParts(id)
    return p?.family === 'guard' && p.variant !== 'happy-inside'
  },
  prepare(scratch) {
    const dst = providerCopy(scratch)
    return {
      productDirs: { subprocessDocker: dst },
      changed: [
        edit(
          path.join(dst, 'index.js'),
          GUARD_ANCHOR,
          "    ctx.on('tools/pre-execute', async (exec, next) => {\n      if (exec.name !== undefined) return next()\n      const sessionCwd = exec.agent?.session.header.cwd\n      const reason = workdirDecision({"
        )
      ]
    }
  }
})
def({
  id: 'fence-no-realpath',
  title: 'the fence compares the path as written, without resolving symlinks',
  applies: (id) =>
    fenceParts(id)?.family === 'fence' &&
    ['symlink-file', 'symlink-dir-new'].includes(fenceParts(id).variant),
  prepare(scratch) {
    const dst = path.join(scratch, 'provider')
    copyPackage(PROVIDER_SRC, dst, { include: ['index.js', 'src', 'package.json'] })
    const changed = [
      edit(
        path.join(dst, 'index.js'),
        '  async resolveForFence(value, sessionCwd) {\n    const intended = isAbsolute(value) ? value : resolvePath(sessionCwd, value)\n',
        '  async resolveForFence(value, sessionCwd) {\n    const intended = isAbsolute(value) ? value : resolvePath(sessionCwd, value)\n    return { resolved: intended, existed: true, target: intended }\n'
      )
    ]
    return { productDirs: { subprocessDocker: dst }, changed }
  }
})
def({
  id: 'fence-prefix-compare',
  title: 'insideSite compares by string prefix without the path separator',
  applies: (id) =>
    fenceParts(id)?.family === 'fence' &&
    fenceParts(id).variant === 'boundary-prefix-sibling' &&
    FILE_TOOLS.includes(fenceParts(id).tool),
  prepare(scratch) {
    const dst = path.join(scratch, 'provider')
    copyPackage(PROVIDER_SRC, dst, { include: ['index.js', 'src', 'package.json'] })
    return {
      productDirs: { subprocessDocker: dst },
      changed: [
        edit(
          path.join(dst, 'src/route.mjs'),
          'resolved === siteRoot || resolved.startsWith(`${siteRoot}/`)',
          'resolved === siteRoot || resolved.startsWith(siteRoot)'
        )
      ]
    }
  }
})

// ── routing, approval, sandbox mode, shell lifecycle ─────────────────────────────────────────────
def({
  id: 'routing-mislabel',
  title: 'every command is routed to the container of site a1',
  applies: (id) =>
    /^harness\.(route\.shell\.|writepath\.shell\.)/.test(id) ||
    (id.startsWith('harness.fence.bash.') && id.endsWith('.happy-inside')),
  prepare(scratch) {
    const dst = path.join(scratch, 'provider')
    copyPackage(PROVIDER_SRC, dst, { include: ['index.js', 'src', 'package.json'] })
    return {
      productDirs: { subprocessDocker: dst },
      changed: [
        edit(
          path.join(dst, 'src/route.mjs'),
          "cfg.containerName.replace('{label}', label)",
          "cfg.containerName.replace('{label}', 'a1')",
          { all: true }
        )
      ]
    }
  }
})
def({
  id: 'approval-hang',
  title: 'the host no longer answers approval questions',
  applies: (id) => id.startsWith('harness.approval.legacy.'),
  prepare(scratch) {
    const dst = path.join(scratch, 'provider')
    copyPackage(PROVIDER_SRC, dst, { include: ['index.js', 'src', 'package.json'] })
    return {
      productDirs: { subprocessDocker: dst },
      changed: [edit(path.join(dst, 'index.js'), '    this.registerApprovalAnswer(ctx)\n', '')]
    }
  }
})
def({
  id: 'approval-guard-drop',
  title: 'the profile asks for approval instead of never',
  applies: (id) => id.startsWith('harness.approval.never.'),
  prepare(scratch) {
    const dst = path.join(scratch, 'native.cordis.patch.yml')
    fs.copyFileSync(DEFAULT_PATHS.native, dst)
    const changed = [
      edit(dst, /(- id: approval\n {2}config:\n {4}policy: )never/, '$1ask'),
      edit(dst, /(sandbox: [a-z-]+\n\s+approval: )never/, '$1ask', { all: true })
    ]
    return { paths: { native: dst }, profile: { native: dst }, changed }
  }
})
def({
  id: 'sandbox-mode-ignored',
  title: 'the docker sandbox stamps workspace-write whatever the session mode',
  applies: (id) => id === 'harness.dispatch.permission-revoked',
  prepare(scratch) {
    const dst = path.join(scratch, 'sandbox')
    copyPackage(SANDBOX_SRC, dst, { include: ['index.js', 'stamp.mjs', 'package.json'] })
    return {
      productDirs: { sandboxDocker: dst },
      changed: [
        edit(
          path.join(dst, 'index.js'),
          'argv: stamp(argv, policy.mode, policy.workspaceRoot)',
          "argv: stamp(argv, 'workspace-write', policy.workspaceRoot)"
        )
      ]
    }
  }
})
def({
  id: 'terminate-noop',
  title: 'terminating a spawned command does nothing',
  applies: (id) => id === 'harness.dispatch.cancel.shell-hang' || id === 'harness.cleanup.runtime',
  prepare(scratch) {
    const dst = path.join(scratch, 'provider')
    copyPackage(PROVIDER_SRC, dst, { include: ['index.js', 'src', 'package.json'] })
    return {
      productDirs: { subprocessDocker: dst },
      changed: [
        edit(
          path.join(dst, 'index.js'),
          '    handle.terminate = (/** @type {unknown[]} */ ...args) => {\n',
          '    handle.terminate = (/** @type {unknown[]} */ ...args) => {\n      if (args !== undefined) return\n'
        )
      ]
    }
  }
})

// ── the Site changes record (tracy-site-tabs, tracy-site-tools bundles) ──────────────────────────
def({
  id: 'activity-drop',
  title: 'the turn moment (the Site changes row) is never sent',
  applies: (id) => /^harness\.(audit\.|writepath\.(shell|file-tool|changed|apply))/.test(id),
  prepare(scratch) {
    const dst = path.join(scratch, 'site-tabs')
    copyPackage(SITE_TABS_SRC, dst, { include: ['lib/index.js', 'package.json'] })
    return {
      productDirs: { siteTabs: dst },
      changed: [
        edit(
          path.join(dst, 'lib/index.js'),
          'const answer = await once("moment", body, record.who, deadline);',
          'const answer = { ok: true };'
        )
      ]
    }
  }
})
def({
  id: 'turn-source-mislabel',
  title: 'every chat turn is recorded with source "comment"',
  applies: (id) => /^harness\.(audit\.|writepath\.(shell|file-tool|changed|apply))/.test(id),
  prepare(scratch) {
    const dst = path.join(scratch, 'site-tabs')
    copyPackage(SITE_TABS_SRC, dst, { include: ['lib/index.js', 'package.json'] })
    return {
      productDirs: { siteTabs: dst },
      changed: [
        edit(
          path.join(dst, 'lib/index.js'),
          /(title: opening\.title,\n\s+)source: opening\.source,(\n\s+promptMessageId)/,
          '$1source: "comment",$2'
        )
      ]
    }
  }
})
def({
  id: 'actor-drop',
  title: "site-tools sends its door calls without the typist's actor header",
  applies: (id) =>
    /^harness\.writepath\.(apply|changed)\./.test(id) || id.startsWith('harness.surface.dispatch.'),
  prepare(scratch) {
    const dst = path.join(scratch, 'site-tools')
    copyPackage(SITE_TOOLS_SRC, dst, { include: ['lib/index.js', 'package.json'] })
    return {
      productDirs: { siteTools: dst },
      changed: [
        edit(path.join(dst, 'lib/index.js'), '"x-tracy-actor"', '"x-tracy-actor-dropped"', { all: true })
      ]
    }
  }
})
def({
  id: 'label-mislabel',
  title: 'site-tools names no site on its door calls',
  applies: (id) =>
    /^harness\.writepath\.(apply|changed)\./.test(id) || id.startsWith('harness.surface.dispatch.'),
  prepare(scratch) {
    const dst = path.join(scratch, 'site-tools')
    copyPackage(SITE_TOOLS_SRC, dst, { include: ['lib/index.js', 'package.json'] })
    return {
      productDirs: { siteTools: dst },
      changed: [
        edit(
          path.join(dst, 'lib/index.js'),
          '"x-tracy-workspace-label"',
          '"x-tracy-workspace-label-dropped"',
          { all: true }
        )
      ]
    }
  }
})
def({
  id: 'changed-drop',
  title: 'a write outside Apply is reported to the wrong door',
  applies: (id) => id.startsWith('harness.writepath.changed.'),
  prepare(scratch) {
    const dst = path.join(scratch, 'site-tools')
    copyPackage(SITE_TOOLS_SRC, dst, { include: ['lib/index.js', 'package.json'] })
    return {
      productDirs: { siteTools: dst },
      changed: [
        edit(
          path.join(dst, 'lib/index.js'),
          '/api/sites/_conversation/changed`',
          '/api/sites/_conversation/changed-dropped`',
          { all: true }
        )
      ]
    }
  }
})
def({
  id: 'turn-header-drop',
  title: 'door calls do not carry the chat turn they belong to',
  applies: (id) => /^harness\.writepath\.(apply|changed)\./.test(id),
  prepare(scratch) {
    const dst = path.join(scratch, 'site-tools')
    copyPackage(SITE_TOOLS_SRC, dst, { include: ['lib/index.js', 'package.json'] })
    return {
      productDirs: { siteTools: dst },
      changed: [
        edit(path.join(dst, 'lib/index.js'), '"x-tracy-turn"', '"x-tracy-turn-dropped"', { all: true })
      ]
    }
  }
})
def({
  id: 'record-failure-blocks',
  title: 'a failing record door makes the turn wait for its full timeout and give up the write',
  applies: (id) => id === 'harness.writepath.record-failure',
  prepare(scratch) {
    const dst = path.join(scratch, 'site-tabs')
    copyPackage(SITE_TABS_SRC, dst, { include: ['lib/index.js', 'package.json'] })
    return {
      productDirs: { siteTabs: dst },
      changed: [edit(path.join(dst, 'lib/index.js'), 'attempts = 3,', 'attempts = 50,')]
    }
  }
})

// ── tracy_site surfaces ──────────────────────────────────────────────────────────────────────────
for (const surface of [
  'wordpress',
  'joomla',
  'joomla-sealed',
  'emdash',
  'wordpress-contract',
  'wordpress-sealed',
  'joomla-derived',
  'wordpress-derived'
]) {
  def({
    id: `surface-extra-action:${surface}`,
    title: `the ${surface} surface offers one action the catalogue does not list`,
    applies: (id) => id === `harness.surface.compat.${surface}`,
    prepare(scratch) {
      const dst = path.join(scratch, 'site-tools')
      copyPackage(SITE_TOOLS_SRC, dst, { include: ['src/host'] })
      const key = surface.includes('-') ? `'${surface}'` : surface
      const changed = [
        edit(
          path.join(dst, 'src/host/surface.mjs'),
          new RegExp(`(${key}: withReplace\\('${surface}', \\[)`),
          "$1'qa.extra', "
        )
      ]
      return { paths: { surface: path.join(dst, 'src/host/surface.mjs') }, changed }
    }
  })
}
def({
  id: 'surface-dispatch-wordpress-widened',
  title: 'the wordpress surface also offers extension.list in the bundle that runs',
  applies: (id) => id === 'harness.surface.dispatch.wordpress',
  prepare(scratch) {
    const dst = path.join(scratch, 'site-tools')
    copyPackage(SITE_TOOLS_SRC, dst, { include: ['lib/index.js', 'package.json'] })
    return {
      productDirs: { siteTools: dst },
      changed: [
        edit(
          path.join(dst, 'lib/index.js'),
          '  wordpress: withReplace("wordpress", [...WORDPRESS_ACTIONS]),',
          '  wordpress: withReplace("wordpress", [...WORDPRESS_ACTIONS, "extension.list"]),'
        )
      ]
    }
  }
})

// ── mode matrix and profile ──────────────────────────────────────────────────────────────────────
def({
  id: 'matrix-preset-flip',
  title: 'one preset gains or loses the row against the matrix',
  applies: (id) => id.startsWith('harness.matrix.tool.'),
  prepare(scratch, assertionId) {
    const rowId = assertionId.split('.').slice(3).join('.')
    const matrix = JSON.parse(readTextSync(DEFAULT_PATHS.matrix))
    const row = matrix.tools.find((r) => r.id === rowId)
    const text = readTextSync(DEFAULT_PATHS.presets)
    const have = presetPlugins(text)
    for (const role of matrix.roles) {
      for (const platform of matrix.platforms) {
        const key = `${role.id}-${platform.id}`
        const expected = row.roles?.[role.id] === true || row.platforms?.[platform.id] === true
        const present = have.get(key)?.has(rowId) === true
        if (expected !== present) continue
        const mutated = editPreset(text, key, rowId, expected ? 'drop' : 'add')
        if (mutated === null) continue
        const dst = path.join(scratch, 'presets.patch.yml')
        fs.writeFileSync(dst, mutated)
        return {
          paths: { presets: dst },
          changed: [
            { file: dst, sha256: sha(mutated), note: `${expected ? 'dropped' : 'added'} ${rowId} in ${key}` }
          ]
        }
      }
    }
    throw new Error(`no preset to flip for ${rowId}`)
  }
})
def({
  id: 'matrix-skill-flip',
  title: 'one skill set gains or loses the skill against the matrix',
  applies: (id) => id.startsWith('harness.matrix.skill.'),
  prepare(scratch, assertionId) {
    const skill = assertionId.split('.').slice(3).join('.')
    const matrix = JSON.parse(readTextSync(DEFAULT_PATHS.matrix))
    const row = matrix.skills.find((r) => r.id === skill)
    const doc = JSON.parse(readTextSync(DEFAULT_PATHS.skillSets))
    const named = matrix.platforms.some((p) => row.platforms?.[p.id] === true)
    const key = `${matrix.roles[0].id}-${matrix.platforms[0].id}`
    const [role, platform] = [matrix.roles[0], matrix.platforms[0]]
    const expected = named ? row.platforms?.[platform.id] === true : row.roles?.[role.id] === true
    const list = new Set(doc.presets[key])
    if (expected) list.delete(skill)
    else list.add(skill)
    doc.presets[key] = [...list]
    const dst = path.join(scratch, 'skill-sets.json')
    const out = `${JSON.stringify(doc, null, 2)}\n`
    fs.writeFileSync(dst, out)
    return {
      paths: { skillSets: dst },
      changed: [{ file: dst, sha256: sha(out), note: `${expected ? 'dropped' : 'added'} ${skill} in ${key}` }]
    }
  }
})
const PROFILE_EDITS = {
  subprocess: ['fleet', /(- id: subprocess\n {2}disabled: )true/, '$1false'],
  sandbox: ['fleet', /(- id: sandbox\n {2}disabled: )true/, '$1false'],
  'tracy-sandbox-docker': [
    'fleet',
    "name: '@tracy/dsh-sandbox-docker'",
    "name: '@deepseek-ai/dsh-sandbox-local'"
  ],
  'tracy-subprocess-docker': [
    'fleet',
    "name: '@tracy/dsh-subprocess-docker'",
    "name: '@deepseek-ai/dsh-subprocess-local'"
  ],
  'ptc-runtime': ['fleet', /(- id: ptc-runtime\n {2}disabled: )true/, '$1false'],
  tools: ['fleet', /(- id: tools\n {2}config:\n {4}mode: )native/, '$1ptc'],
  approval: ['native', /(- id: approval\n {2}config:\n {4}policy: )never/, '$1ask'],
  permission: ['native', /(workspace-write:\n\s+sandbox: workspace-write\n\s+approval: )never/, '$1ask']
}
for (const [row, [file, find, replacement]] of Object.entries(PROFILE_EDITS)) {
  def({
    id: `profile-edit:${row}`,
    title: `profile row ${row} no longer holds its boundary-rule value`,
    applies: (id) =>
      id === `harness.profile.${row}` || (id === 'harness.approval.never.bash' && row === 'approval'),
    prepare(scratch) {
      const dst = path.join(scratch, `${file}.cordis.patch.yml`)
      fs.copyFileSync(DEFAULT_PATHS[file], dst)
      const changed = [edit(dst, find, replacement)]
      return { paths: { [file]: dst }, ...(file === 'native' ? { profile: { native: dst } } : {}), changed }
    }
  })
}

/** Mutants that apply to an assertion, in catalogue order. */
export const mutantsFor = (assertionId) => MUTANTS.filter((m) => m.applies(assertionId))

/** Why an assertion has no mutant (for the PENDING reason). */
export function noMutantReason(assertionId) {
  const [, family, tk, variant] = assertionId.split('.')
  if (family === 'fence' && ['invalid-type', 'schema-missing'].includes(variant))
    return 'refused by dsh schema validation before any Tracy hook runs: no Tracy code on this path to mutate (vendor code is not mutated)'
  if (
    family === 'dispatch' ||
    family === 'cleanup' ||
    family === 'route' ||
    family === 'approval' ||
    family === 'writepath'
  )
    return `no recorded mutation of Tracy code turns ${assertionId} red (the behaviour belongs to dsh, which is not mutated here)`
  if (family === 'fence' && tk) return `no recorded mutation targets ${tk}.${variant}`
  return 'no recorded mutation targets this assertion'
}

export { sha }
