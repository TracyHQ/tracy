#!/usr/bin/env node
// The lessons ledger of the EmDash skill: every known trap as one record in references/lessons.jsonl,
// each citing the line of the reference that holds the rule. Modelled on the WordPress kit's
// scripts/lessons.mjs. The ledger is an index, not a second copy: `fix` names where the rule lives.
//
//   node scripts/lessons.mjs scan <template-dir> [--pack <packed-dir>] [--phase <phase being started>]
//   node scripts/lessons.mjs show <id>
//
// scan  runs the detectors over files on disk (the template folder; the packed artifact with --pack):
//       with --phase X (X = the phase being started) only those of phases before X — a detector of X or
//       later checks what X establishes, and is listed instead, X's own on stdout as a reminder; without
//       --phase all of them. It loads no page and starts nothing. stdout: one line per lesson,
//       `id · sym · fix` — first the UNRESOLVED ones (the trap is in these files), then the READ ones of
//       X (every read record without --phase). stderr: counts, the detail of each unresolved lesson, the clear ones, the ones
//       not checked (an input absent, e.g. no seed yet, no --pack) and the ones that could not decide.
//       exit 0 no unresolved lesson among the detectors that ran · 1 an unresolved lesson · 2 a usage
//       error or a detector that could not decide (2 wins over 1). A clean scan replaces no gate.
// show  the record, and the line of the reference it cites.
// Format and how to add a lesson: references/lessons.md.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { forbidden } from './tools/distribution.mjs'
import { personalizeProblems } from './tools/personalize-gate.mjs'

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const LEDGER = path.join(SKILL, 'references', 'lessons.jsonl')
export const PHASES = ['P0', 'P1', 'P2', 'P3', 'P4', 'P4.5', 'P4.6', 'P5', 'P6', 'P7', 'P8']
const MAX_FILE = 8 * 1024 * 1024
const MAX_ENTRIES = 20000
const CODE = /\.(astro|ts|tsx|js|jsx|mjs|cjs|css|html)$/

export const loadLedger = (file = LEDGER) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))

class Unknown extends Error {}
class NotChecked extends Error {}

function read(file) {
  let st
  try {
    st = lstatSync(file)
  } catch {
    return null
  }
  if (!st.isFile()) throw new Unknown(`${file} is not a regular file`)
  if (st.size > MAX_FILE) throw new Unknown(`${file} is larger than ${MAX_FILE} bytes`)
  return readFileSync(file, 'utf8')
}
const need = (file, why) => {
  const text = read(file)
  if (text === null) throw new NotChecked(why)
  return text
}
/** Files under dir (no links followed, node_modules skipped), as paths relative to dir. */
function walk(dir, filter = () => true) {
  if (!existsSync(dir)) return null
  const out = []
  let seen = 0
  const visit = (rel) => {
    for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (++seen > MAX_ENTRIES) throw new Unknown(`${dir} holds more than ${MAX_ENTRIES} entries`)
      const r = path.join(rel, e.name)
      if (e.isDirectory() && e.name !== 'node_modules') visit(r)
      else if (e.isFile() && filter(r)) out.push(r)
    }
  }
  visit('')
  return out.sort()
}
// Comments blanked (block and line; a `//` inside a string such as a URL survives a quote check).
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

// Each detector: (template, pack) → {found: [detail…]} — empty means the trap is not in these files.
// Throw NotChecked when its input is absent (not yet produced, or --pack not given), Unknown when
// the input is there and cannot be read.
export const DETECTORS = {
  'astro-i18n-prefix': (t) => {
    const cfg = stripComments(need(path.join(t, 'astro.config.mjs'), 'no astro.config.mjs'))
    return { found: /prefixDefaultLocale\s*:\s*true/.test(cfg) ? ['astro.config.mjs: prefixDefaultLocale: true'] : [] }
  },
  'astro-i18n-fallback': (t) => {
    const cfg = stripComments(need(path.join(t, 'astro.config.mjs'), 'no astro.config.mjs'))
    const i18n = cfg.indexOf('i18n')
    return { found: i18n >= 0 && /\bfallback\s*:/.test(cfg.slice(i18n)) ? ['astro.config.mjs: i18n.fallback'] : [] }
  },
  'global-css-once': (t) => {
    const files = walk(path.join(t, 'src'), (f) => /\.(astro|ts|tsx|js|jsx|mjs)$/.test(f))
    if (!files) throw new NotChecked('no src/')
    const importers = files.filter((f) =>
      /(?:import\s+(?:[^'"]*?\sfrom\s+)?|href=)\s*['"{][^'"]*global\.css(?:\?[^'"]*)?['"]/.test(
        stripComments(read(path.join(t, 'src', f)) ?? '')
      )
    )
    if (importers.length === 1) return { found: [] }
    return { found: [importers.length ? `imported by ${importers.map((f) => `src/${f}`).join(', ')}` : 'imported by no file under src/'] }
  },
  'seed-media': (t) => {
    let seed
    try {
      seed = JSON.parse(need(path.join(t, 'seed', 'seed.json'), 'no seed/seed.json yet'))
    } catch (e) {
      if (e instanceof NotChecked) throw e
      throw new Unknown(`seed/seed.json: ${e.message}`)
    }
    const hits = []
    const visit = (v, at) => {
      if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${at}[${i}]`))
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v)) {
          if (k === '$media') hits.push(at || '/')
          visit(x, `${at}/${k}`)
        }
    }
    visit(seed, '')
    return { found: hits.length ? [`$media at ${hits.slice(0, 3).join(', ')}${hits.length > 3 ? ` (+${hits.length - 3})` : ''}`] : [] }
  },
  'dockerfile-in-dist': (t, pack) => {
    const required = ['Dockerfile', 'tools/docker-entrypoint.sh']
    const found = []
    const contractText = read(path.join(t, 'qa.contract.json'))
    if (contractText === null && !pack) throw new NotChecked('no qa.contract.json and no --pack')
    if (contractText !== null) {
      let include
      try {
        include = JSON.parse(contractText)?.distribution?.include
      } catch (e) {
        throw new Unknown(`qa.contract.json: ${e.message}`)
      }
      if (!Array.isArray(include)) throw new NotChecked('qa.contract.json has no distribution.include yet')
      const covered = (f) => include.some((e) => typeof e === 'string' && (e.replace(/\/$/, '') === f || f.startsWith(e.replace(/\/?$/, '/'))))
      for (const f of required) if (!covered(f)) found.push(`qa.contract.json distribution.include lacks ${f}`)
    }
    if (pack) for (const f of required) if (!existsSync(path.join(pack, f))) found.push(`--pack lacks ${f}`)
    return { found }
  },
  'dockerfile-content-api': (t) => {
    const text = need(path.join(t, 'Dockerfile'), 'no Dockerfile')
    const stages = text.split(/^\s*FROM\s/im).slice(1)
    if (!stages.length) throw new Unknown('Dockerfile has no FROM')
    const bad = stages.map((s, i) => [i + 1, /^\s*ENV\s+TRACY_CONTENT_API_SCALARS[\s=]/m.test(s)]).filter(([, ok]) => !ok)
    return { found: bad.length ? [`stage ${bad.map(([i]) => i).join(', ')} of ${stages.length} sets no ENV TRACY_CONTENT_API_SCALARS`] : [] }
  },
  'pack-forbidden': (t, pack) => {
    if (!pack) throw new NotChecked('no --pack')
    // the rule distribution.mjs packs by, applied to what was actually packed (a folder copied by hand
    // or by an older kit is not protected by it); a forbidden folder is reported, not entered
    const bad = []
    let seen = 0
    const visit = (rel) => {
      for (const e of readdirSync(path.join(pack, rel), { withFileTypes: true })) {
        if (++seen > MAX_ENTRIES) throw new Unknown(`--pack holds more than ${MAX_ENTRIES} entries`)
        const r = rel ? `${rel}/${e.name}` : e.name
        if (forbidden(r)) bad.push(r)
        else if (e.isDirectory()) visit(r)
      }
    }
    visit('')
    return { found: bad.length ? [`${bad.slice(0, 5).join(', ')}${bad.length > 5 ? ` (+${bad.length - 5})` : ''}`] : [] }
  },
  'icon-font': (t) => {
    const files = walk(path.join(t, 'src'), (f) => CODE.test(f))
    if (!files) throw new NotChecked('no src/')
    const pkg = read(path.join(t, 'package.json')) ?? ''
    const hits = files.filter((f) =>
      /font-?awesome|\bfa-(solid|regular|brands|light)\b|class(?:Name)?=["'](?:[^"']*\s)?fa[srlbd]?\s+fa-[a-z]/i.test(read(path.join(t, 'src', f)) ?? '')
    )
    if (/fortawesome|font-?awesome/i.test(pkg)) hits.unshift('package.json')
    return { found: hits.length ? [`icon font in ${hits.slice(0, 5).map((f) => (f === 'package.json' ? f : `src/${f}`)).join(', ')}`] : [] }
  },
  'personalize-placeholder': (t) => {
    if (!existsSync(path.join(t, 'seed', 'personalize.json'))) throw new NotChecked('no seed/personalize.json yet (P4.5)')
    let problems
    try {
      problems = personalizeProblems(t)
    } catch (e) {
      throw new Unknown(e.message)
    }
    return { found: problems }
  }
}

// `phase` is the phase being STARTED. A detector record carries the phase that establishes what it checks
// (the seed in P2, the layout and astro.config in P3, personalization in P4.5, the package in P8): before
// that phase the trap cannot be fixed yet — a new-template.sh starter has no layout and placeholder
// personalization by design — so it is not run; it is listed as a reminder of the phase it belongs to.
// Detectors of earlier phases must hold. Without --phase every detector runs (the final scan, on --pack).
export const phaseIndex = (p) => PHASES.indexOf(p)
export function scan(template, { pack = null, phase = null, ledger = loadLedger() } = {}) {
  const result = { unresolved: [], clear: [], notChecked: [], unknown: [], read: [], later: [] }
  const due = (rec) => !phase || phaseIndex(rec.phase) < phaseIndex(phase)
  const wanted = new Set(ledger.filter((r) => r.when && due(r)).map((r) => r.when))
  const outcome = new Map()
  for (const [id, detect] of Object.entries(DETECTORS)) {
    if (!wanted.has(id)) continue
    try {
      outcome.set(id, { found: detect(template, pack).found })
    } catch (e) {
      if (e instanceof NotChecked) outcome.set(id, { notChecked: e.message })
      else outcome.set(id, { unknown: e.message })
    }
  }
  for (const rec of ledger) {
    if (rec.when && !due(rec)) {
      if (rec.phase === phase) result.read.push(rec)
      else result.later.push(rec)
    } else if (rec.when) {
      const o = outcome.get(rec.when)
      if (!o) result.unknown.push({ ...rec, why: `no detector ${rec.when}` })
      else if (o.unknown) result.unknown.push({ ...rec, why: o.unknown })
      else if (o.notChecked) result.notChecked.push({ ...rec, why: o.notChecked })
      else if (o.found.length) result.unresolved.push({ ...rec, why: o.found.join('; ') })
      else result.clear.push(rec)
    } else if (!phase || rec.phase === phase) result.read.push(rec)
  }
  return result
}

/** The cited line of a record: `ref` is `<file under the skill>:<line>`, `cite` text that line holds. */
export function citedLine(rec) {
  const m = /^(.+):(\d+)$/.exec(rec.ref ?? '')
  if (!m) return { ok: false, why: `ref ${rec.ref} is not <file>:<line>` }
  const file = path.join(SKILL, m[1])
  if (!existsSync(file)) return { ok: false, why: `${m[1]} does not exist` }
  const line = readFileSync(file, 'utf8').split('\n')[Number(m[2]) - 1]
  if (line === undefined) return { ok: false, why: `${m[1]} has no line ${m[2]}` }
  return { ok: line.includes(rec.cite), line, why: line.includes(rec.cite) ? null : `${rec.ref} does not hold "${rec.cite}"` }
}

const lineOf = (r) => `${r.id} · ${r.sym} · ${r.fix}`

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2)
  const opt = (n) => {
    const i = argv.indexOf(n)
    if (i < 0) return null
    const v = argv[i + 1]
    argv.splice(i, 2)
    return v ?? ''
  }
  const usage = 'usage: lessons.mjs scan <template-dir> [--pack <dir>] [--phase P0…P8] | show <id>'
  try {
    const pack = opt('--pack')
    const phase = opt('--phase')
    const [command, arg, extra] = argv
    if (command === 'show' && arg && !extra) {
      const rec = loadLedger().find((r) => r.id === arg)
      if (!rec) {
        console.error(`no lesson ${arg}`)
        process.exit(2)
      }
      console.log(JSON.stringify(rec))
      const c = citedLine(rec)
      console.log(c.ok ? `${rec.ref}: ${c.line.trim()}` : `cite broken: ${c.why}`)
      process.exit(c.ok ? 0 : 2)
    }
    if (command !== 'scan' || !arg || extra) throw new Error(usage)
    if (pack === '' || phase === '' || (phase && !PHASES.includes(phase))) throw new Error(usage)
    // new-template.sh writes template.config.json before any package.json exists (P0/P1 starters)
    if (!existsSync(arg) || !lstatSync(arg).isDirectory() || !['template.config.json', 'package.json'].some((f) => existsSync(path.join(arg, f))))
      throw new Error(`${arg}: not a template folder (no template.config.json or package.json)`)
    if (pack && (!existsSync(pack) || !lstatSync(pack).isDirectory())) throw new Error(`--pack ${pack}: not a folder`)
    const r = scan(arg, { pack, phase })
    for (const rec of r.unresolved) console.log(lineOf(rec))
    for (const rec of r.read) console.log(lineOf(rec))
    console.error(
      `lessons scan: unresolved=${r.unresolved.length} clear=${r.clear.length} not-checked=${r.notChecked.length} unknown=${r.unknown.length} read=${r.read.length}${phase ? ` later=${r.later.length} (before ${phase})` : ''}`
    )
    for (const rec of r.unresolved) console.error(`unresolved ${rec.id}: ${rec.why}`)
    if (r.clear.length) console.error(`clear: ${r.clear.map((x) => x.id).join(', ')}`)
    for (const rec of r.notChecked) console.error(`not checked ${rec.id}: ${rec.why}`)
    for (const rec of r.unknown) console.error(`unknown ${rec.id}: ${rec.why}`)
    process.exitCode = r.unknown.length ? 2 : r.unresolved.length ? 1 : 0
  } catch (e) {
    console.error(e.message)
    process.exitCode = 2
  }
}
