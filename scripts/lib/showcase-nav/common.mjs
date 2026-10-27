/**
 * What the two showcase-navigation generators share: hashing, the contract scope (latest + pinned),
 * the decisions file and the report. Pure apart from reading the files it is pointed at.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { BASE_FILES, EMDASH_BASE_FILES, baseHashOf, sha256 } from 'website-opportunities/domain'

export const MAP_FILE = 'showcase-nav-map.json'
export const PROFILE_VERSION = '1.0.0'
export { BASE_FILES, EMDASH_BASE_FILES, baseHashOf, sha256 }

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

export function baseFilesOf(dir) {
  return Object.fromEntries(BASE_FILES.map((name) => [name, sha256(readFileSync(path.join(dir, name)))]))
}

/** JSON with sorted keys, so the hash of a decisions entry does not depend on how it was typed. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`
  return JSON.stringify(value ?? null)
}
export const decisionsHashOf = (entry) => sha256(canonical(entry ?? null))

const semver = (v) => v.split('.').map((n) => Number.parseInt(n, 10) || 0)
export const bySemver = (a, b) => {
  const [x, y] = [semver(a), semver(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i += 1)
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
  return 0
}

/** Every `<slug>/<major>/<version>` under a contracts tree that has a presentation lock. */
export function contractsOnDisk(root) {
  const out = []
  if (!existsSync(root)) return out
  for (const slug of readdirSync(root).sort()) {
    const d = path.join(root, slug)
    let majors
    try {
      majors = readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory())
    } catch {
      continue
    }
    for (const major of majors)
      for (const v of readdirSync(path.join(d, major.name), { withFileTypes: true }))
        if (v.isDirectory() && existsSync(path.join(d, major.name, v.name, 'presentation-lock.json')))
          out.push({ id: `${slug}/${major.name}/${v.name}`, slug, major: major.name, version: v.name })
  }
  return out
}

/** The newest version of every `<slug>/<major>` line. */
export function latestOf(list) {
  const best = new Map()
  for (const c of list) {
    const line = `${c.slug}/${c.major}`
    if (!best.has(line) || bySemver(c.version, best.get(line).version) > 0) best.set(line, c)
  }
  return [...best.values()].map((c) => c.id)
}

/**
 * The versions a customer can be given today: what the design registry serves and what each
 * quickstart catalogue pins (`contract`, or `<key>/<version>` for an entry named after its line).
 */
export function pinnedIds({ registries, catalogues, platform, major }) {
  const out = new Set()
  for (const r of registries)
    for (const d of Object.values(r?.designs ?? {}))
      if (typeof d?.contractProfile === 'string' && d.contractProfile.includes(`/${major}/`))
        out.add(d.contractProfile)
  for (const q of catalogues)
    for (const [key, entry] of Object.entries(q ?? {})) {
      if (entry?.platform !== platform) continue
      if (typeof entry.contract === 'string') out.add(entry.contract)
      else if (entry.version && key.endsWith(`/${major}`))
        out.add(`${key.replace(/^quickstart\//, '')}/${entry.version}`)
    }
  return [...out]
}

/** `--contract <id>`, repeatable. */
export function contractArgs(argv, tool) {
  return argv.flatMap((arg, i, all) => {
    if (arg !== '--contract') return []
    const id = all[i + 1]
    if (!id || id.startsWith('--')) throw new Error(`${tool}: --contract needs an id`)
    return [id]
  })
}
export function reportArg(argv, tool) {
  const i = argv.indexOf('--report')
  if (i < 0) return null
  const file = argv[i + 1]
  if (!file || file.startsWith('--')) throw new Error(`${tool}: --report needs a file`)
  return file
}

const cell = (v) =>
  String(v ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')

/** One markdown section per map: what leaves, what stays and why, what is unresolved. */
export function reportOf(maps, title) {
  const lines = [`# ${title}`, '']
  lines.push('| Contract | Status | Operations | Kept | Unresolved |', '|---|---|---|---|---|')
  for (const m of maps)
    lines.push(
      `| ${m.contract} | ${m.status} | ${m.operations.length} | ${m.kept.length} | ${m.unresolved.length} |`
    )
  for (const m of maps) {
    lines.push('', `## ${m.contract} — ${m.status}`, '')
    if (m.status === 'not-covered') lines.push(`Not covered: ${m.reason}`, '')
    if (m.preview?.length) {
      lines.push('Decided but not written (no raw content to fingerprint):', '')
      lines.push('| Item | Entity | Rule | Change | Reason |', '|---|---|---|---|---|')
      for (const p of m.preview)
        lines.push(
          `| ${cell(p.label)} | ${cell(p.where)} | ${p.rule} | ${cell(p.change)} | ${cell(p.reason)} |`
        )
      lines.push('')
    }
    if (m.operations.length) {
      lines.push('| Item | Entity | Rule | Before → after | Reason |', '|---|---|---|---|---|')
      for (const o of m.operations)
        lines.push(
          `| ${cell(o.label)} | ${cell(o.key ?? o.slug ?? o.id)} ${cell(o.identity ? Object.values(o.identity).join(' · ') : '')} | ${o.rule} | ${cell(o.op)} ${cell(o.path ?? o.field ?? '')}: ${cell(JSON.stringify(o.from ?? o.before ?? null))} → ${cell(JSON.stringify(o.to ?? o.after ?? null))} | ${cell(o.reason)} |`
        )
      lines.push('')
    }
    if (m.unresolved.length) {
      lines.push('Unresolved (nothing written; stays as the template has it):', '')
      lines.push('| Item | Entity | Rule | Reason |', '|---|---|---|---|')
      for (const u of m.unresolved)
        lines.push(`| ${cell(u.label)} | ${cell(u.key)} ${cell(u.where)} | ${u.rule} | ${cell(u.reason)} |`)
      lines.push('')
    }
    if (m.kept.length) {
      lines.push(
        '<details><summary>Kept</summary>',
        '',
        '| Item | Entity | Rule | Reason |',
        '|---|---|---|---|'
      )
      for (const k of m.kept)
        lines.push(`| ${cell(k.label)} | ${cell(k.key)} ${cell(k.where)} | ${k.rule} | ${cell(k.reason)} |`)
      lines.push('', '</details>')
    }
  }
  return `${lines.join('\n')}\n`
}
