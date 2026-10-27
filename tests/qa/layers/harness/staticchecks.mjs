/**
 * Checks that read declarations, not a running runtime: the mode matrix against the presets and
 * skill sets generated from it, the native / fleet profile rows against the boundary rules, and the
 * `tracy_site` surface catalogue against the surface table the code carries. Each takes `paths` so a
 * RED run can point it at a mutated scratch copy of exactly one input.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { REPO } from './runtime.mjs'
import { readTextSync } from '../../lib/bounded-reader.mjs'

export const DEFAULT_PATHS = Object.freeze({
  matrix: path.join(REPO, 'config/mode-matrix.json'),
  presets: path.join(REPO, 'packages/bundle/tracy-native/presets.patch.yml'),
  skillSets: path.join(REPO, 'packages/fleet/tracy-fleet-operation/dsh/skill-sets.json'),
  native: path.join(REPO, 'packages/bundle/tracy-native/cordis.patch.yml'),
  fleet: path.join(REPO, 'packages/fleet/tracy-fleet-operation/dsh/profile/cordis.patch.yml'),
  catalogue: path.join(REPO, 'apps/tracy-web/src/api-reference/sources/agent-tools.json'),
  surface: path.join(REPO, 'packages/tools/tracy-site-tools/src/host/surface.mjs')
})

const read = (file) => readTextSync(file)

// ── mode matrix ─────────────────────────────────────────────────────────────────────────────────

/**
 * The plugin ids of every preset in the generated `presets.patch.yml`, by `<role>-<platform>`.
 * Nested ids (plan-mode inside the planning group) count: they are plugins of the preset too.
 * @returns {Map<string, Set<string>>}
 */
export function presetPlugins(text) {
  const out = new Map()
  let current = null
  for (const line of text.split('\n')) {
    const preset = /^ {4}- id: preset-([a-z0-9-]+)$/.exec(line)
    if (preset) {
      current = new Set()
      out.set(preset[1], current)
      continue
    }
    if (current === null) continue
    const plugin = /^ {10,}- id: ([A-Za-z0-9._-]+)\s*$/.exec(line)
    if (plugin) current.add(plugin[1])
  }
  return out
}

/**
 * Edit one preset block of `presets.patch.yml`: `drop` removes one plugin entry with its continuation
 * lines, `add` puts a bare entry at the top of the plugin list. Returns the new text, or null when
 * the preset / entry was not found (a mutation that cannot be applied is not a RED proof).
 */
export function editPreset(text, presetId, pluginId, mode) {
  const lines = text.split('\n')
  let inPreset = false
  const escaped = pluginId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (let i = 0; i < lines.length; i += 1) {
    const preset = /^ {4}- id: preset-([a-z0-9-]+)$/.exec(lines[i])
    if (preset) inPreset = preset[1] === presetId
    if (!inPreset) continue
    if (mode === 'add' && /^ {8}plugins:\s*$/.test(lines[i])) {
      lines.splice(i + 1, 0, `          - id: ${pluginId}`, '            name: qa-mutant')
      return lines.join('\n')
    }
    if (mode !== 'drop') continue
    const m = new RegExp(`^( {10,})- id: ${escaped}\\s*$`).exec(lines[i])
    if (!m) continue
    const indent = m[1].length
    let end = i + 1
    while (end < lines.length && (lines[end].trim() === '' || lines[end].search(/\S/) > indent)) end += 1
    lines.splice(i, end - i)
    return lines.join('\n')
  }
  return null
}

/**
 * One tool row of the matrix against every preset. Oracle: the matrix's own statement of its
 * semantics (a real preset = role ∪ platform) — expected membership is computed here from the
 * matrix, never read from the generated files.
 */
export function matrixToolRow(rowId, paths = DEFAULT_PATHS) {
  const matrix = JSON.parse(read(paths.matrix))
  const row = matrix.tools.find((r) => r.id === rowId)
  if (row === undefined)
    return { controls: [{ id: 'row-exists', ok: false, detail: rowId }], checks: [], evidence: {} }
  const presets = presetPlugins(read(paths.presets))
  const checks = []
  for (const role of matrix.roles) {
    for (const platform of matrix.platforms) {
      const key = `${role.id}-${platform.id}`
      const expected = row.roles?.[role.id] === true || row.platforms?.[platform.id] === true
      const actual = presets.get(key)?.has(rowId) === true
      checks.push({
        id: `preset-${key}`,
        ok: expected === actual,
        detail: `matrix=${expected} preset=${actual}`
      })
    }
  }
  return {
    controls: [
      {
        id: 'all-presets-present',
        ok: presets.size === matrix.roles.length * matrix.platforms.length,
        detail: `presets=${presets.size}`
      }
    ],
    checks,
    evidence: { row: rowId, roles: row.roles, platforms: row.platforms }
  }
}

/**
 * One skill row against every skill set. Oracle: the matrix comment — a skill with a platform column
 * follows the platform, otherwise it follows the role.
 */
export function matrixSkillRow(skillId, paths = DEFAULT_PATHS) {
  const matrix = JSON.parse(read(paths.matrix))
  const row = matrix.skills.find((r) => r.id === skillId)
  if (row === undefined)
    return { controls: [{ id: 'row-exists', ok: false, detail: skillId }], checks: [], evidence: {} }
  const sets = JSON.parse(read(paths.skillSets)).presets
  const names = matrix.platforms.map((p) => p.id)
  const namesPlatform = names.some((p) => row.platforms?.[p] === true)
  const checks = []
  for (const role of matrix.roles) {
    for (const platform of matrix.platforms) {
      const key = `${role.id}-${platform.id}`
      const expected = namesPlatform ? row.platforms?.[platform.id] === true : row.roles?.[role.id] === true
      const actual = (sets[key] ?? []).includes(skillId)
      checks.push({
        id: `skill-set-${key}`,
        ok: expected === actual,
        detail: `matrix=${expected} set=${actual}`
      })
    }
  }
  return {
    controls: [
      {
        id: 'all-skill-sets-present',
        ok: Object.keys(sets).length === matrix.roles.length * matrix.platforms.length,
        detail: `sets=${Object.keys(sets).length}`
      }
    ],
    checks,
    evidence: { skill: skillId, namesPlatform }
  }
}

// ── profile rows ────────────────────────────────────────────────────────────────────────────────

/** The text of one top-level patch row (`- id: x` until the next row), or null. */
export function rowText(text, id) {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line === `- id: ${id}`)
  if (start === -1) return null
  let end = start + 1
  while (end < lines.length && !lines[end].startsWith('- ') && !/^\S/.test(lines[end] ?? '')) end += 1
  return lines.slice(start, end).join('\n')
}

/** The boundary-rule facts about the profile rows the harness stands on. Each key is one row. */
export const PROFILE_FACTS = Object.freeze({
  subprocess: {
    file: 'fleet',
    why: 'the container is the sandbox; dsh-base subprocess must stand down (two ctx.subprocess registrations throw)',
    check: (text) => /^- id: subprocess\n {2}disabled: true/m.test(text)
  },
  sandbox: {
    file: 'fleet',
    why: 'dsh-base sandbox must stand down for @tracy/dsh-sandbox-docker (the mode stamp comes from it)',
    check: (text) => /^- id: sandbox\n {2}disabled: true/m.test(text)
  },
  'tracy-sandbox-docker': {
    file: 'fleet',
    why: 'the docker sandbox provider is inserted by the image profile',
    check: (text) => /- id: tracy-sandbox-docker\n\s+name: '@tracy\/dsh-sandbox-docker'/.test(text)
  },
  'tracy-subprocess-docker': {
    file: 'fleet',
    why: 'the subprocess provider that carries the path fence is inserted by the image profile',
    check: (text) => /- id: tracy-subprocess-docker\n\s+name: '@tracy\/dsh-subprocess-docker'/.test(text)
  },
  'ptc-runtime': {
    file: 'fleet',
    why: 'model-written code must not run in the container that holds the docker socket',
    check: (text) => /^- id: ptc-runtime\n {2}disabled: true/m.test(text)
  },
  tools: {
    file: 'fleet',
    why: 'tool mode pinned to native so no environment variable can turn the PTC runtime back on',
    check: (text) => /^- id: tools\n {2}config:\n {4}mode: native/m.test(text)
  },
  approval: {
    file: 'native',
    why: 'no approval step for a customer: the service default is never',
    check: (text) => /^- id: approval\n {2}config:\n {4}policy: never/m.test(text)
  },
  permission: {
    file: 'native',
    why: 'every preset says approval: never, each with its own sandbox mode',
    check: (text) => {
      const row = rowText(text, 'permission') ?? ''
      return ['read-only', 'workspace-write', 'danger-full-access'].every((mode) =>
        new RegExp(`${mode}:\\n\\s+sandbox: ${mode}\\n\\s+approval: never`).test(row)
      )
    }
  }
})

export function profileRow(rowId, paths = DEFAULT_PATHS) {
  const fact = PROFILE_FACTS[rowId]
  if (fact === undefined)
    return { controls: [{ id: 'fact-known', ok: false, detail: rowId }], checks: [], evidence: {} }
  const text = read(paths[fact.file])
  return {
    controls: [
      { id: 'profile-file-has-the-row', ok: text.includes(`id: ${rowId}`), detail: `file=${fact.file}` }
    ],
    checks: [{ id: `row-${rowId}`, ok: fact.check(text), detail: fact.why }],
    evidence: { file: fact.file, why: fact.why }
  }
}

// ── tracy_site surfaces ─────────────────────────────────────────────────────────────────────────

/** The pinned catalogue's action list for one surface against the surface table the code carries. */
export async function surfaceCompat(surface, paths = DEFAULT_PATHS) {
  const catalogue = JSON.parse(read(paths.catalogue))
  const pinned = catalogue.tools.find((t) => t.name === 'tracy_site')?.surfaces?.[surface]
  if (pinned === undefined)
    return { controls: [{ id: 'surface-pinned', ok: false, detail: surface }], checks: [], evidence: {} }
  const mod = await import(`${pathToFileURL(paths.surface).href}?qa=${Date.now()}`)
  const code = [...(mod.SURFACE_ACTIONS?.[surface] ?? [])].sort()
  const want = pinned.actions.map((a) => a.action).sort()
  const params = mod.siteToolParameters(surface)?.properties?.action?.enum ?? []
  return {
    controls: [{ id: 'surface-pinned', ok: want.length > 0, detail: `${want.length} actions` }],
    checks: [
      {
        id: 'actions-match-catalogue',
        ok: JSON.stringify(code) === JSON.stringify(want),
        detail: `missing=${want.filter((a) => !code.includes(a))} extra=${code.filter((a) => !want.includes(a))}`
      },
      {
        id: 'schema-enum-matches-catalogue',
        ok: JSON.stringify([...params].sort()) === JSON.stringify(want),
        detail: `enum=${params.length}`
      }
    ],
    evidence: { surface, actions: want.length }
  }
}

/** Surfaces the dispatch probe has a site fixture for, and the site that has it. */
export const SURFACE_SITES = Object.freeze({
  wordpress: 'a1',
  joomla: 'b1',
  'joomla-sealed': 'js',
  emdash: 'c1'
})

/**
 * `tracy_site` on a site of the surface, through the real dispatcher: every relay action the
 * catalogue lists for the surface is not refused as off-surface, and every relay action it does not
 * list is refused before the Apply door.
 */
export async function surfaceDispatch(rt, surface, paths = DEFAULT_PATHS) {
  const label = SURFACE_SITES[surface]
  const catalogue = JSON.parse(read(paths.catalogue))
  const tool = catalogue.tools.find((t) => t.name === 'tracy_site')
  const listed = new Set(Object.values(tool.surfaces).flatMap((s) => s.actions.map((a) => a.action)))
  const mine = new Map(tool.surfaces[surface].actions.map((a) => [a.action, a]))
  const sess = await rt.session({ cwd: rt.world.sites[label].dir })
  const checks = []
  const evidence = { surface, label, probed: [], notProbed: [] }
  let probedIn = 0
  for (const action of [...listed].sort()) {
    const inList = mine.has(action)
    const entry = mine.get(action)
    // A local action runs code in the container (screenshots, file writes); it is probed only when
    // the catalogue says the surface does NOT have it, where the refusal comes before any of that.
    const local = tool.localActions.includes(action)
    if (inList && (local || entry?.door !== 'apply')) {
      evidence.notProbed.push(`${action}: local action needs a container`)
      continue
    }
    const n0 = rt.door.requests.length
    const r = await rt.drive(sess, [{ calls: [{ name: 'tracy_site', args: { action, params: {} } }] }])
    const applyCalls = rt.door.requests
      .slice(n0)
      .filter((d) => d.url.endsWith('/apply') && d.method === 'POST')
    const text = r.results[0]?.text ?? ''
    const refused = /NOT_ON_THIS_PLATFORM|BAD_ACTION/.test(text)
    evidence.probed.push(`${action}:${inList ? 'in' : 'out'}`)
    if (inList) {
      probedIn += 1
      checks.push({ id: `in-surface:${action}`, ok: !refused, detail: text.slice(0, 160) })
    } else {
      checks.push({
        id: `off-surface:${action}`,
        ok: refused && applyCalls.length === 0,
        detail: `door=${applyCalls.length} ${text.slice(0, 120)}`
      })
    }
  }
  return {
    controls: [{ id: 'some-relay-action-probed', ok: probedIn > 0, detail: `in-surface probes=${probedIn}` }],
    checks,
    evidence
  }
}
