// API doors: public and internal method-path pairs of the pinned snapshot (OpenAPI `paths`, `parameters`
// skipped), cross-checked against the routes registered in apps/tracy-web/src (route.js files followed
// from the composition root app.js). A route in code that the snapshot lacks, a snapshot door no code
// route matches, a route.js file never mounted, and any mount the scanner cannot resolve are all kept
// as `unresolved` entries; none is dropped or guessed.
import { cli, isMain, listFiles, parseJson, readSource, record, SourceError } from './common.mjs'
import { normalizePath, scanFromRoot } from './route-scan.mjs'

const SNAPSHOT = 'apps/tracy-web/api-reference.snapshot.json'
const ROOT_APP = 'apps/tracy-web/src/app.js'
const HTTP = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'])

export const def = {
  sourcePath: SNAPSHOT,
  extractionKind: 'json-openapi-paths + ast-route-registrations',
  extract(root) {
    const snap = readSource(root, SNAPSHOT)
    const json = parseJson(snap)
    const items = []
    const keyed = new Map()
    const declared = {}
    const emptyPaths = []
    for (const audience of ['public', 'internal']) {
      const paths = json[audience]?.paths
      if (!paths || typeof paths !== 'object') throw new SourceError(`snapshot.${audience}.paths missing`)
      for (const [path, ops] of Object.entries(paths)) {
        declared[audience] = (declared[audience] ?? 0) + 1
        if (!Object.keys(ops).some((m) => HTTP.has(m)))
          emptyPaths.push({ kind: 'snapshot-path-without-method', detail: `${audience} ${path}` })
        for (const method of Object.keys(ops)) {
          if (!HTTP.has(method)) continue
          const M = method.toUpperCase()
          const it = {
            id: `api-door:${audience}:${M} ${path}`,
            kind: 'api-door',
            audience,
            method: M,
            path,
            inCode: false
          }
          items.push(it)
          const k = `${M} ${normalizePath(path)}`
          keyed.set(k, [...(keyed.get(k) ?? []), it])
        }
      }
    }
    const scan = scanFromRoot(root, ROOT_APP)
    const unresolved = [...scan.unresolved, ...emptyPaths]
    const codeKeys = new Set()
    for (const r of scan.routes) {
      for (const method of r.methods) {
        const k = `${method} ${normalizePath(r.path)}`
        codeKeys.add(k)
        const doors =
          keyed.get(k) ??
          (method === 'ALL'
            ? [...keyed.entries()]
                .filter(([x]) => x.endsWith(` ${normalizePath(r.path)}`))
                .flatMap(([, v]) => v)
            : null)
        if (doors?.length && r.conditional)
          // Registered under a condition the scanner cannot decide: kept visible, never confirmed.
          for (const d of doors) d.registeredConditionally = true
        else if (doors?.length) for (const d of doors) d.inCode = true
        else unresolved.push({ kind: 'route-missing-from-snapshot', detail: k, loc: r.loc })
      }
    }
    // Second pass: a code route with `{param}` segments (e.g. `/apply/{action}`) also covers concrete snapshot
    // doors of the same shape; the match is recorded as `param-pattern`, not as an exact route.
    const patterns = scan.routes.flatMap((r) =>
      r.path.includes('{')
        ? r.methods.map((m) => ({
            method: m,
            seg: normalizePath(r.path).split('/'),
            conditional: r.conditional
          }))
        : []
    )
    for (const it of items) {
      if (it.inCode) continue
      const seg = normalizePath(it.path).split('/')
      const hits = patterns.filter(
        ({ method, seg: p }) =>
          (method === 'ALL' || method === it.method) &&
          p.length === seg.length &&
          p.every((x, i) => x === seg[i] || /^\{[^}]+\}$/.test(x))
      )
      if (hits.some((h) => !h.conditional)) {
        it.inCode = true
        it.matchedBy = 'param-pattern'
      } else if (hits.length) it.registeredConditionally = true
    }
    for (const it of items)
      if (!it.inCode && !it.registeredConditionally)
        unresolved.push({
          kind: 'snapshot-door-without-code-route',
          detail: `${it.audience} ${it.method} ${it.path}`
        })
    // route.js files the composition root never reached: their routes would be invisible otherwise.
    const reached = new Set(scan.read.map((r) => r.rel))
    const all = listFiles(root, 'apps/tracy-web/src', (f) => f.endsWith('/route.js'))
    const read = [snap, ...scan.read]
    for (const rel of all.files) {
      if (!reached.has(rel)) {
        read.push(readSource(root, rel))
        unresolved.push({ kind: 'route-file-not-reached-from-app', detail: rel, blocksComplete: true })
      }
    }
    const notes = {}
    for (const audience of ['public', 'internal']) {
      const mine = items.filter((i) => i.audience === audience)
      notes[audience] = {
        methodPaths: mine.length,
        pathsWithMethods: new Set(mine.map((i) => i.path)).size,
        pathsDeclared: declared[audience]
      }
    }
    notes.codeRoutesFound = codeKeys.size
    notes.snapshotRecorded = json.recorded ?? null
    return record({
      sourcePath: SNAPSHOT,
      read,
      extractionKind: this.extractionKind,
      items,
      unresolved,
      root,
      notes
    })
  }
}
if (isMain(import.meta.url)) cli(def)
