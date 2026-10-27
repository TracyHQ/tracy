#!/usr/bin/env node
// The kit under scripts/tools/ and scripts/tests/ is the source; a template's tools/ and tests/
// carry copies (they must run from inside the template to resolve its node_modules). This
// compares them so drift is visible. Fixtures under tests/fixtures are compared too.
//   node scripts/check-kit-sync.mjs <template-dir> [--json]
//
// 🔒 IT COMPARES CODE, NOT BYTES — and that is the whole design, not a convenience.
//
// The kit and a template describe the same measurement from two different vantage points, so the
// same paragraph is written twice with different pronouns: the kit says "a template built from this
// kit", the template says "this template's design source". The kit cannot say "this"; it is not a
// template. Formatting diverges for a second, equally legitimate reason — TCH runs a prettier gate
// over its checkout and the kit's repo does not, so identical code arrives wrapped differently.
//
// Measured 19/09/2026 on both templates in TCH: comparing bytes reported 17 and 19 differing files;
// comparing code reported 7 and 11. Every one of the ten it stopped reporting was prose or line
// wrapping. A gate that is red for reasons nobody acts on is a gate people learn to skip — the
// exact failure this file exists to prevent — so bytes are the wrong question to ask here.
//
// What it does NOT do is guess. Without a parser it refuses and says so: falling back to a byte
// compare would report drift that is not there, and falling back to a regex comment-stripper would
// mangle a regex literal or a template string and report drift that is not there either. A checker
// that answers when it cannot see is worse than one that declines.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const target = process.argv[2] ?? '.'
const asJson = process.argv.includes('--json')
const templateName = path.basename(path.resolve(target))

// Ownership. Without it this checker has exactly one rule — "must match" — and reports a
// template's own test fixtures as drift; measured 19/09/2026, that was 4 files on base and 6 on
// business, none of them a defect. A gate red for reasons nobody acts on is a gate people learn to
// skip, so the rule has to be able to say "this one is the template's".
const manifest = JSON.parse(readFileSync(path.join(here, 'kit-manifest.json'), 'utf8'))
const globToRe = (g) =>
  new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$')
const matches = (rel, globs) => (globs ?? []).some((g) => globToRe(g).test(rel))
const ownerOf = (rel) =>
  matches(rel, manifest.rules.templateOwned?.globs) ? 'templateOwned'
  : matches(rel, manifest.rules.kitOwned?.globs) ? 'kitOwned'
  : 'unclaimed'
// Optionality is per TEMPLATE. A blanket list said "absent is fine" for every template, so
// deleting business's contract/validate.mjs — which its own compile-seed imports — passed
// (measured 19/09/2026, exit 0, "not carried"). base does no source ingestion; business does.
const isOptional = (rel) => matches(rel, manifest.rules.optional?.perTemplate?.[templateName] ?? [])
const exceptionFor = (rel) =>
  (manifest.exceptions ?? []).find((e) => e.file === rel && e.template === templateName)

let parse
try {
  // Resolved from the TEMPLATE, which carries the tools' dependencies (SKILL.md: the tools import
  // acorn from the template's node_modules). The kit alone may not have it.
  parse = createRequire(path.join(path.resolve(target), 'package.json'))('acorn').parse
} catch {
  try {
    parse = createRequire(path.join(here, 'package.json'))('acorn').parse
  } catch {
   try {
    // Third and last: from THIS FILE's own location, which walks up the directory tree. That is
    // what makes the check runnable where the kit is VENDORED — in TCH the kit sits under
    // vendor/, so resolution climbs to the repo root's node_modules. Without this the gate is
    // honest but inert in clean CI: neither template's nor the kit's own node_modules is
    // installed by the gate job (measured 19/09/2026 — MODULE_NOT_FOUND, exit 2, every run).
    parse = createRequire(import.meta.url)('acorn').parse
   } catch {
    console.error(
      'check-kit-sync: acorn is not resolvable from the template, the kit, or this file.\n' +
        'This check compares CODE, so it needs a parser; it will not fall back to comparing bytes,\n' +
        'which reports prose and line wrapping as drift. Install dependencies in the template\n' +
        `(${path.resolve(target)}) or in the kit, then run it again.`
    )
    process.exit(2)
   }
  }
}

const walk = (d, base = d) =>
  readdirSync(d).flatMap((n) => {
    const p = path.join(d, n)
    return statSync(p).isDirectory() ? walk(p, base) : [path.relative(base, p)]
  })

/**
 * The code's shape as a MAP of top-level declaration -> normalised AST, not as one ordered blob.
 *
 * 🔒 ORDER IS NOT DRIFT, AND MEASURING IT AS DRIFT IS WHAT MAKES THIS GATE USELESS. After the real
 * content differences between the kit and both templates were reconciled on 19/09/2026, EVERY
 * remaining flag was a function sitting at a different line — `sourcePending` after `findOneSpec`
 * in one copy and after `scanOffSystem` in the other, with byte-identical bodies. Chasing that by
 * physically reordering files is churn that risks a real edit for no gain, and leaving it flagged
 * teaches readers to ignore the gate. What a reader needs to know is: did a declaration APPEAR,
 * VANISH, or CHANGE. Those three this reports; where it sits in the file, it does not.
 *
 * `raw` is dropped with the positions: `'a'` and `"a"` are the same string and a formatter rewrites
 * quotes, but `value` stays, so a changed literal is still drift.
 */
const declsOf = (src) => {
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: false, ranges: false })
  const norm = (n) => {
    const seen = new WeakSet()
    return JSON.stringify(n, function (k, v) {
      if (k === 'start' || k === 'end' || k === 'loc' || k === 'range') return undefined
      // 🔒 `raw` GOES ONLY WHERE IT IS SPELLING. On a Literal it is the quote style a formatter
      // rewrites, so dropping it is the point. On a TemplateElement it is OBSERVABLE: String.raw
      // applied to a backslash-n and to an actual newline cook to the same string and raw to
      // different ones, so a template that swapped them returns a different value at runtime.
      // Dropping both said "prose/format" and exited 0 — measured 19/09/2026. The containing
      // object tells them apart: only TemplateElement.value carries a `cooked` sibling.
      if (k === 'raw' && !(this && typeof this === 'object' && 'cooked' in this)) return undefined
      if (v && typeof v === 'object') {
        if (seen.has(v)) return undefined
        seen.add(v)
      }
      return v
    })
  }
  const specNames = (node) => {
    const names = (node.specifiers ?? []).map((sp) => sp.exported?.name ?? sp.local?.name).filter(Boolean)
    return names.length ? names.sort().join(',') : null
  }
  const out = new Map()
  const hoisted = new Set()
  const name = (d) => {
    if (!d) return null
    if (d.id?.name) return d.id.name
    if (d.type === 'VariableDeclaration') return d.declarations.map((x) => x.id?.name ?? '?').join(',')
    return null
  }
  for (const node of ast.body) {
    let key = null
    if (node.type === 'ImportDeclaration') key = `import ${node.source.value}`
    else if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration')
      key = 'export ' + (name(node.declaration) ?? specNames(node) ?? 'default')
    else key = name(node)
    // A bare statement has no name to key on. Numbering them by POSITION made the key move every
    // time anything above it moved, so a manifest could not name one and mean it tomorrow; keyed
    // by CONTENT instead, a statement keeps its name wherever it sits, and a CHANGED statement
    // honestly reads as one key gone and another arrived. Order is still compared separately.
    if (!key) key = `stmt:${createHash('sha256').update(norm(node)).digest('hex').slice(0, 10)}`
    // Two imports from the same module, or two same-named things, must not silently collapse.
    while (out.has(key)) key += "'"
    const decl = node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration' ? node.declaration : node
    if (decl?.type === 'FunctionDeclaration') hoisted.add(key)
    out.set(key, norm(node))
  }
  return Object.assign(out, { hoisted })
}

/** added / removed / changed, ignoring position. */
const declDiff = (a, b) => {
  const hoisted = new Set([...(a.hoisted ?? []), ...(b.hoisted ?? [])])
  const added = [...b.keys()].filter((k) => !a.has(k))
  const removed = [...a.keys()].filter((k) => !b.has(k))
  const changed = [...a.keys()].filter((k) => b.has(k) && a.get(k) !== b.get(k))
  // 🔒 ONLY HOISTED DECLARATIONS MAY MOVE. Treating every reordering as benign is a FALSE
  // NEGATIVE, and a measured one: two top-level `const`s swapped so the second reads the first
  // before it is initialised is a TDZ ReferenceError at runtime, and this check called it
  // "same code in a different order" and exited 0 (reproduced 19/09/2026). A function declaration
  // is hoisted, so moving it changes nothing and flagging it would be the noise this whole file
  // exists to remove. Everything else — const, let, class, a bare statement, an import taken for
  // its side effect — is order-sensitive, so its RELATIVE order is compared.
  const movable = (k) => hoisted.has(k)
  const seq = (m) => [...m.keys()].filter((k) => !movable(k))
  const orderChanged = seq(a).join() !== seq(b).join()
  const reordered = added.length === 0 && removed.length === 0 && changed.length === 0 && [...a.keys()].join() !== [...b.keys()].join()
  return { added, removed, changed, reordered: reordered && !orderChanged, orderChanged: orderChanged && !added.length && !removed.length && !changed.length }
}

const isJs = (f) => f.endsWith('.mjs') || f.endsWith('.js')
const rows = []
let drift = 0

// `contract` joined the list on 15/09/2026 with ADR 0016: the source contract lives in the kit and
// is copied into every template alongside the tools that read it. A directory the kit ships but
// this loop does not name drifts in silence — which is the exact failure this script exists for.
// `ingest` joined 15/09/2026 (ADR 0016 §2a): a source adapter now lives in the kit too, not just
// the target-facing tools. Same reasoning as `contract` above — name it or it drifts unseen.
// `src` joined 27/09/2026: the provenance stamps Tracy's comment picker reads (`src/lib/stamps.ts`)
// and the components that print them are the kit's, so every template generated from it carries
// them. Only the files the kit ships are compared (the loop walks the kit); the rest of a
// template's src/ is its own design. Not JavaScript, so the comparison is byte for byte: copy them.
for (const dir of ['tools', 'tests', 'contract', 'ingest', 'src']) {
  const kit = path.join(here, dir)
  if (!existsSync(kit)) continue
  for (const f of walk(kit).sort()) {
    const rel = `${dir}/${f}`
    const a = path.join(kit, f)
    const b = path.join(target, dir, f)
    if (!existsSync(b)) {
      // Absent is only drift when the manifest says the template must carry it.
      const opt = isOptional(rel)
      rows.push({ rel, verdict: opt ? 'not carried' : 'MISSING' })
      if (!opt) drift++
      continue
    }
    const A = readFileSync(a),
      B = readFileSync(b)
    if (A.equals(B)) {
      rows.push({ rel, verdict: 'same' })
      continue
    }
    if (!isJs(f)) {
      rows.push({ rel, verdict: 'DIFFERS' })
      drift++
      continue
    }
    let d
    try {
      d = declDiff(declsOf(A.toString('utf8')), declsOf(B.toString('utf8')))
    } catch (e) {
      // A file one side cannot parse is drift by itself, and saying which side could not parse is
      // the difference between a five-minute fix and a hunt.
      rows.push({ rel, verdict: 'UNPARSEABLE', note: String(e.message).slice(0, 120) })
      drift++
      continue
    }
    const real = d.added.length + d.removed.length + d.changed.length
    const owner = ownerOf(rel)
    const exc = exceptionFor(rel)
    if (!real && d.orderChanged) {
      rows.push({ rel, verdict: 'ORDER DIFFERS', note: 'a const/let/class or a bare statement moved — order is semantics there' })
      drift++
      continue
    }
    if (!real) rows.push({ rel, verdict: d.reordered ? 'reordered' : 'prose/format' })
    else if (owner === 'templateOwned') rows.push({ rel, verdict: 'template-owned', note: 'its own site, its own fixtures' })
    else if (exc && d.changed.concat(d.added, d.removed).every((k) => (exc.declarations ?? []).includes(k)))
      rows.push({ rel, verdict: 'declared variant', note: (exc.declarations ?? []).join(', ').slice(0, 70) })
    else if (exc) {
      // A whole-file exemption is a hole: replacing business's release.mjs with `process.exit(0)`
      // passed (measured 19/09/2026). An exception names the DECLARATIONS allowed to differ, so
      // everything else in that file — artifact verification, the Dockerfile requirement, any
      // future shared fix — still has to match.
      const undeclared = d.changed.concat(d.added, d.removed).filter((k) => !(exc.declarations ?? []).includes(k))
      rows.push({ rel, verdict: 'CODE DIFFERS', note: `outside the declared variant: ${undeclared.join(', ')}` })
      drift++
      continue
    }
    else {
      const bits = []
      if (d.changed.length) bits.push(`changed: ${d.changed.join(', ')}`)
      if (d.added.length) bits.push(`only in template: ${d.added.join(', ')}`)
      if (d.removed.length) bits.push(`only in kit: ${d.removed.join(', ')}`)
      rows.push({ rel, verdict: 'CODE DIFFERS', note: bits.join(' · ') })
      drift++
    }
  }
}

// The other direction. The loop above walks KIT files, so a file a template ADDED under tools/ or
// tests/ was invisible to it — and a tool that exists in one template and nowhere else is exactly
// the thing that drifts until someone rediscovers it. Reported, not counted as drift: a template
// legitimately carries its own cases (business ships 212 tests against base's 122).
for (const dir of ['tools', 'tests']) {
  const t = path.join(target, dir)
  if (!existsSync(t) || !existsSync(path.join(here, dir))) continue
  for (const f of walk(t).sort()) if (!existsSync(path.join(here, dir, f))) rows.push({ rel: `${dir}/${f}`, verdict: 'template-only' })
}

if (asJson) console.log(JSON.stringify({ target: path.resolve(target), drift, rows }, null, 2))
else {
  for (const r of rows) console.log(`${r.verdict.padEnd(13)} ${r.rel}${r.note ? `  — ${r.note}` : ''}`)
  const n = (v) => rows.filter((r) => r.verdict === v).length
  console.log(
    `\n${n('same')} identical · ${n('prose/format')} same code, different prose or wrapping · ` +
      `${n('reordered')} same code in a different order · ${n('CODE DIFFERS')} CODE DIFFERS · ` +
      `${n('missing')} missing · ${n('template-only')} template-only`
  )
}
process.exit(drift ? 1 : 0)
