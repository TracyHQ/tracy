/**
 * Extractors: what the harness layer is responsible for, read from the declarations in the tree.
 * Nothing here is typed by hand except the four write paths and the three CMS (SYSTEM.md §4 names
 * both). Every extractor reports its source, its hash and what it could not resolve; the generator
 * turns that into `denominator.json`. A source that cannot be read becomes `unresolved` and marks the
 * denominator incomplete — an item is never dropped silently.
 */
import { createHash } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { REPO } from './runtime.mjs'
import { readBytesSync } from '../../lib/bounded-reader.mjs'
import { docRel } from '../../lib/doc-source.mjs'

export const COMMON_TAGS = Object.freeze([
  'happy',
  'empty',
  'invalid',
  'boundary',
  'dependency-failure',
  'repeat',
  'cleanup'
])
export const HARNESS_TAGS = Object.freeze([
  'schema-invalid',
  'unknown-tool',
  'routing',
  'missing-cwd',
  'traversal',
  'symlink',
  'other-site',
  'host-path',
  'permission-escalation',
  'tool-failure',
  'stream-failure',
  'cancel',
  'audit-seam',
  'audit-effect'
])
export const ALL_TAGS = Object.freeze([...COMMON_TAGS, ...HARNESS_TAGS])

export const WRITE_PATHS = Object.freeze(['shell', 'file-tool', 'apply', 'changed'])
export const CMS_LIST = Object.freeze(['wordpress', 'joomla', 'emdash'])

export const SOURCE_FILES = Object.freeze({
  agentTools: 'apps/tracy-web/src/api-reference/sources/agent-tools.json',
  modeMatrix: 'config/mode-matrix.json',
  route: 'packages/tools/tracy-subprocess-docker/src/route.mjs',
  presets: 'packages/bundle/tracy-native/presets.patch.yml',
  skillSets: 'packages/fleet/tracy-fleet-operation/dsh/skill-sets.json',
  native: 'packages/bundle/tracy-native/cordis.patch.yml',
  fleet: 'packages/fleet/tracy-fleet-operation/dsh/profile/cordis.patch.yml',
  base: 'vendor/tracy/deepseek-harness/packages/bundle/base/cordis.patch.yml',
  surface: 'packages/tools/tracy-site-tools/src/host/surface.mjs',
  system: 'SYSTEM.md',
  adr: 'docs/adr/0014-one-dsh-per-host-commands-in-web-container.md'
})

const sha = (data) => createHash('sha256').update(data).digest('hex')
const readSource = (rel, repo = REPO) => {
  const file = path.join(repo, docRel(repo, rel))
  const data = readBytesSync(file)
  return { path: rel, sha256: sha(data), text: data.toString('utf8') }
}

/** Top-level rows of a cordis patch file: `{ id, disabled }`, plus rows inserted by `- insert:`. */
export function patchRows(text) {
  const rows = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const top = /^- id: (\S+)\s*$/.exec(lines[i])
    const nested = /^ {4,}- id: ([A-Za-z0-9._-]+)\s*$/.exec(lines[i])
    const match = top ?? nested
    if (!match) continue
    let disabled = false
    let dynamic = false
    for (let j = i + 1; j < lines.length && !/^\s*- /.test(lines[j]) && !/^\S/.test(lines[j]); j += 1) {
      if (/^\s+disabled: true\s*$/.test(lines[j])) disabled = true
      if (/^\s+disabled: !!js/.test(lines[j])) dynamic = true
    }
    rows.push({ id: match[1], disabled, dynamic, inserted: nested !== null && top === null })
  }
  return rows
}

/**
 * Run every extractor. Returns the raw material the generator turns into items.
 * @param {{ liveTools?: { name: string, schema: any }[] | null, liveError?: string | null }} live - the registry of the real runtime.
 */
export async function extractAll(live, { repo = REPO } = {}) {
  const sources = []
  const unresolved = []
  const take = (key) => {
    try {
      const src = readSource(SOURCE_FILES[key], repo)
      sources.push({ key, path: src.path, sha256: src.sha256 })
      return src
    } catch (error) {
      unresolved.push({ source: SOURCE_FILES[key], reason: `unreadable: ${error.code ?? error.message}` })
      return null
    }
  }

  const items = []
  const excluded = []

  // 1. agent tools × surfaces
  const tools = take('agentTools')
  let catalogue = null
  if (tools !== null) {
    try {
      catalogue = JSON.parse(tools.text)
    } catch (error) {
      unresolved.push({ source: tools.path, reason: `malformed JSON: ${error.message}` })
    }
  }
  const surfaces = catalogue?.surfaces ?? []
  const allTools = [...(catalogue?.tools ?? []), ...(catalogue?.otherTools ?? [])]
  if (catalogue !== null && (surfaces.length === 0 || allTools.length === 0)) {
    unresolved.push({
      source: SOURCE_FILES.agentTools,
      reason: 'no surfaces or no tools found: refusing to emit an empty denominator'
    })
  }
  for (const tool of allTools) {
    for (const surface of surfaces) {
      const applies = tool.platforms == null || tool.platforms.includes(surface.platform)
      items.push({
        id: `tool-surface:${tool.name}@${surface.id}`,
        kind: 'tool-surface',
        meta: {
          tool: tool.name,
          surface: surface.id,
          platform: surface.platform,
          applies,
          plugin: tool.plugin,
          hasSurfaceTable: tool.surfaces?.[surface.id] !== undefined
        }
      })
    }
  }

  // 2. FS_TOOL_ARGS / WORKDIR_ARG, imported — the table is the declaration, no parser to get wrong
  const route = take('route')
  let FS_TOOL_ARGS = null
  let WORKDIR_ARG = null
  if (route !== null) {
    try {
      const mod = await import(pathToFileURL(path.join(repo, SOURCE_FILES.route)).href)
      FS_TOOL_ARGS = mod.FS_TOOL_ARGS
      WORKDIR_ARG = mod.WORKDIR_ARG
    } catch (error) {
      unresolved.push({ source: route.path, reason: `import failed: ${error.message}` })
    }
  }
  const required = (name) => live.liveTools?.find((t) => t.name === name)?.schema?.required ?? null
  if (FS_TOOL_ARGS !== null) {
    for (const [tool, entry] of Object.entries(FS_TOOL_ARGS).sort(([a], [b]) => a.localeCompare(b))) {
      for (const arg of entry.paths) {
        items.push({
          id: `fs-fence:${tool}.${arg}`,
          kind: 'fs-fence',
          meta: {
            tool,
            arg,
            content: entry.content,
            required: required(tool)?.includes(arg) ?? null,
            escalation:
              live.liveTools?.find((t) => t.name === tool)?.schema?.properties?.sandbox_permissions !==
              undefined
          }
        })
      }
    }
  }
  if (WORKDIR_ARG !== null) {
    for (const [tool, arg] of Object.entries(WORKDIR_ARG).sort(([a], [b]) => a.localeCompare(b))) {
      items.push({ id: `workdir-guard:${tool}.${arg}`, kind: 'workdir-guard', meta: { tool, arg } })
    }
  }

  // 3. the four write paths × CMS (SYSTEM.md §4)
  take('system')
  take('adr')
  for (const p of WRITE_PATHS)
    for (const cms of CMS_LIST)
      items.push({ id: `write-path:${p}@${cms}`, kind: 'write-path', meta: { path: p, cms } })

  // 4. mode matrix rows: tools and skills
  const matrixSrc = take('modeMatrix')
  /** @type {Map<string, boolean>} */
  const offeredByRow = new Map()
  if (matrixSrc !== null) {
    try {
      const matrix = JSON.parse(matrixSrc.text)
      if (!Array.isArray(matrix.tools) || !Array.isArray(matrix.skills))
        throw new Error('tools or skills is not a list')
      for (const row of matrix.tools)
        offeredByRow.set(
          row.id,
          [...Object.values(row.roles ?? {}), ...Object.values(row.platforms ?? {})].some(Boolean)
        )
      for (const row of matrix.tools)
        items.push({
          id: `mode-matrix:tool:${row.id}`,
          kind: 'mode-matrix',
          meta: { group: row.group, tools: row.tools }
        })
      for (const row of matrix.skills)
        items.push({ id: `mode-matrix:skill:${row.id}`, kind: 'mode-matrix', meta: { group: 'skill' } })
    } catch (error) {
      unresolved.push({ source: matrixSrc.path, reason: `unsupported shape: ${error.message}` })
    }
  }
  take('presets')
  take('skillSets')

  // 5. live registry of the real composition (dsh tool registrations + schemas)
  if (live.liveTools == null) {
    unresolved.push({
      source: 'live tool registry (real Cordis composition)',
      reason: live.liveError ?? 'not extracted'
    })
  } else {
    for (const tool of live.liveTools
      .filter((t) => !t.name.startsWith('qa_'))
      .sort((a, b) => a.name.localeCompare(b.name))) {
      items.push({
        id: `dsh-tool:${tool.name}`,
        kind: 'dsh-tool',
        meta: {
          required: tool.schema?.required ?? [],
          escalation: tool.schema?.properties?.sandbox_permissions !== undefined,
          schemaSha256: sha(JSON.stringify(tool.schema ?? null))
        }
      })
    }
    excluded.push({
      kind: 'dsh-tool',
      reason: "registrations prefixed qa_ are the layer's own fixture backends, not product tools",
      ids: live.liveTools
        .filter((t) => t.name.startsWith('qa_'))
        .map((t) => t.name)
        .sort()
    })
  }

  // 6. profile rows: the ones the harness stands on; every other row is listed as excluded
  const native = take('native')
  const fleet = take('fleet')
  const base = take('base')
  const harnessRows = [
    'subprocess',
    'sandbox',
    'tracy-sandbox-docker',
    'tracy-subprocess-docker',
    'ptc-runtime',
    'tools',
    'approval',
    'permission'
  ]
  for (const id of harnessRows) items.push({ id: `native-row:${id}`, kind: 'native-row', meta: { row: id } })
  for (const src of [native, fleet]) {
    if (src === null) continue
    const rows = patchRows(src.text).map((r) => r.id)
    const skipped = [...new Set(rows.filter((id) => !harnessRows.includes(id)))].sort()
    excluded.push({
      kind: 'native-row',
      source: src.path,
      reason:
        'profile rows that are not part of the agent-execution boundary (UI, locale, telemetry, account rows); judged by other layers',
      count: skipped.length,
      ids: skipped
    })
  }
  // dsh-base tool rows: which of them the native profile stands down (a disabled row is N-A with a source)
  const baseRows =
    base === null
      ? []
      : patchRows(base.text)
          .filter((r) => r.id.startsWith('tool-'))
          .map((r) => r.id)
  const nativeRows = native === null ? [] : patchRows(native.text)
  const fleetRows = fleet === null ? [] : patchRows(fleet.text)
  const disabledHere = new Set([...nativeRows, ...fleetRows].filter((r) => r.disabled).map((r) => r.id))
  for (const id of [...new Set(baseRows)].sort()) {
    items.push({
      id: `dsh-tool-row:${id}`,
      kind: 'dsh-tool-row',
      meta: {
        row: id,
        disabledInNative: disabledHere.has(id),
        offered: offeredByRow.has(id) ? offeredByRow.get(id) : null
      }
    })
  }
  if (live.liveTools != null) {
    // The registry above is the tool set of a SELECTIVE composition (createRuntime loads the plugins the
    // harness stands on). It is not the native host's plugin graph, so it cannot prove that no tool is
    // missing: the profile rows whose backend is not loaded are named, and the denominator stays incomplete.
    const notBooted = [...new Set([...nativeRows, ...fleetRows].filter((r) => !r.disabled).map((r) => r.id))]
      .filter((id) => !harnessRows.includes(id))
      .sort()
    unresolved.push({
      source: 'live tool registry (selective composition)',
      reason: `dsh-tool items are read from the plugins the harness composition loads, not from the native host graph: ${notBooted.length} enabled native/fleet profile rows are not booted here, so a tool only they register is not extracted; reconcile against a booted native host before calling the tool denominator complete`,
      rows: notBooted
    })
  }
  if (base === null)
    unresolved.push({
      source: SOURCE_FILES.base,
      reason: 'dsh-base profile unreadable: tool rows not enumerated'
    })

  // 7. approval policy variants and the dispatcher itself
  for (const id of ['never', 'escalation-denied', 'legacy-ask'])
    items.push({ id: `approval:${id}`, kind: 'approval', meta: {} })
  items.push({ id: 'dispatcher:session-loop', kind: 'dispatcher', meta: {} })

  items.sort((a, b) => a.id.localeCompare(b.id))
  const ids = items.map((i) => i.id)
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (dup.length > 0)
    unresolved.push({ source: 'items', reason: `duplicate item ids: ${[...new Set(dup)].join(', ')}` })
  sources.sort((a, b) => a.key.localeCompare(b.key))
  return { sources, items, unresolved, excluded, catalogue }
}

export const revisionOf = (sources) => sha(sources.map((s) => `${s.path}:${s.sha256}`).join('\n'))
