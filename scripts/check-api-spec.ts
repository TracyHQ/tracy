/**
 * Gate `api-spec`: the public Tracy API must not change without anyone saying so.
 *
 * WHAT IT DOES. Rebuilds the public and internal references with the same `buildOpenApi` that serves
 * `/docs/api` (via `scripts/build-api-spec.mjs`), reduces them to their contract, and compares them
 * with the committed `apps/tracy-web/api-reference.snapshot.json`. Every difference is named and
 * classified:
 *
 *   BREAKING — a path or method removed; a parameter removed, added as required or made required; a
 *              request property removed or newly required; an enum value removed; a response schema
 *              property removed; a type changed (`type`, `const`, `$ref`, `format`, or a type option
 *              dropped); a success
 *              response, media type, schema, request variant or authentication alternative removed.
 *   ADDITIVE — anything added. Other edits (a bound, an `operationId`) are listed as CHANGED and
 *              handled like additive ones.
 *
 * Red when: (1) the public part has a BREAKING difference and `info.version` did not move in the
 * same diff — a breaking change is a new API version (tasks/todo-api-portal.md, 28/09: "only
 * removing or changing meaning goes to v2"). That rule is for the Bearer doors under `/v1/*`; a
 * session door under `/api/*` ships with Tracy's own interface and its change is a dated "Changed"
 * line (docs/references/api-changelog.md, Versioning). The gate does not tell the two apart: it
 * stops at every breaking difference of shape in the public part; (2) anything differs at all — "run pnpm api:snapshot
 * and add a dated line to docs/references/api-changelog.md" (internal-only differences need the
 * snapshot, not the public changelog); (3) the changelog's newest `## YYYY-MM-DD` entry is older
 * than the snapshot's `recorded` date — the date its public part last changed, written by the
 * generator. (3) reads no clock, so the gate gives the same answer on every machine and every day.
 *
 * WHY A MACHINE AND NOT REVIEW. The reference is BUILT from the door's own tables, so it can never be
 * stale — and for the same reason a route or a field leaves it with no file saying so: deleting one
 * line in `api-reference/routes/*.js` or one entry in `APPLY_RULES` removes an endpoint from the
 * public page, and the diff a reviewer sees is a one-line code change, not "the public API lost an
 * operation". Outsiders build against this page (28/09: every endpoint documented publicly), so
 * that break reaches them first. Only a comparison against the last agreed shape turns it into a
 * named line at review time. Prose is not compared: rewording is not a contract change.
 *
 *   pnpm exec tsx scripts/check-all.ts --only api-spec
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const CHANGELOG_PATH = path.join(ROOT, 'docs', 'references', 'api-changelog.md')

const METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'])

type Json = unknown
type Obj = Record<string, Json>

/** One difference between two contract views. */
export interface Difference {
  readonly kind: 'added' | 'removed' | 'changed'
  readonly path: readonly string[]
  readonly before?: Json
  readonly after?: Json
  /** Number of keys the parent had before — tells "authentication added" from "alternative added". */
  readonly parentSizeBefore: number
}

/** A classified difference, ready to print. */
export interface Finding {
  readonly severity: 'breaking' | 'additive' | 'changed'
  readonly reason: string
  readonly where: string
}

const isObj = (v: Json): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v)

/** The key one array item gets in the diff view, so order never reads as a change. */
function itemKey(item: Json, index: number, parentKey: string | null): string {
  if (!isObj(item)) return String(item)
  if (parentKey === 'parameters' && typeof item.name === 'string') return `${item.in}:${item.name}`
  if (typeof item.name === 'string') return item.name
  if (typeof item.title === 'string') return item.title
  if (typeof item.$ref === 'string') return item.$ref
  const action =
    isObj(item.properties) && isObj(item.properties.action) ? item.properties.action.const : undefined
  if (typeof action === 'string') return action
  if (parentKey === 'security') return Object.keys(item).sort().join('+') || '(none)'
  return `#${index}`
}

/**
 * Arrays become objects keyed by what each item IS (a parameter by `in:name`, a variant by its title,
 * an enum value by itself), so a removal is a removed key and a reorder is nothing.
 */
export function diffView(node: Json, parentKey: string | null = null): Json {
  if (Array.isArray(node)) {
    const out: Obj = {}
    node.forEach((item, index) => {
      out[itemKey(item, index, parentKey)] = isObj(item) || Array.isArray(item) ? diffView(item, null) : true
    })
    return out
  }
  if (!isObj(node)) return node
  const out: Obj = {}
  for (const [key, value] of Object.entries(node)) out[key] = diffView(value, key)
  return out
}

/** Every difference between two diff views; a removed or added subtree is one entry, not many. */
export function differences(before: Json, after: Json, at: readonly string[] = []): Difference[] {
  if (isObj(before) && isObj(after)) {
    const out: Difference[] = []
    const size = Object.keys(before).length
    for (const key of Object.keys(before))
      if (!(key in after))
        out.push({ kind: 'removed', path: [...at, key], before: before[key], parentSizeBefore: size })
    for (const key of Object.keys(after)) {
      if (!(key in before))
        out.push({ kind: 'added', path: [...at, key], after: after[key], parentSizeBefore: size })
      else out.push(...differences(before[key], after[key], [...at, key]))
    }
    return out
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return []
  return [{ kind: 'changed', path: at, before, after, parentSizeBefore: 0 }]
}

/** Component schemas a request can reach (through `$ref`, transitively): their rules are request rules. */
export function requestSchemas(...docs: Json[]): Set<string> {
  const found = new Set<string>()
  const refs = (node: Json, into: string[]): void => {
    if (Array.isArray(node)) for (const n of node) refs(n, into)
    else if (isObj(node))
      for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string' && value.startsWith('#/components/schemas/'))
          into.push(value.slice('#/components/schemas/'.length))
        else refs(value, into)
      }
  }
  for (const doc of docs) {
    if (!isObj(doc)) continue
    const queue: string[] = []
    for (const item of Object.values(isObj(doc.paths) ? doc.paths : {}))
      for (const op of Object.values(isObj(item) ? item : {}))
        if (isObj(op)) {
          refs(op.requestBody, queue)
          refs(op.parameters, queue)
        }
    const schemas = isObj(doc.components) && isObj(doc.components.schemas) ? doc.components.schemas : {}
    while (queue.length > 0) {
      const name = queue.pop() as string
      if (found.has(name)) continue
      found.add(name)
      refs(schemas[name], queue)
    }
  }
  return found
}

/** `POST /api/x › requestBody › …` — a location a person can find. */
function where(segments: readonly string[]): string {
  if (segments[0] === 'paths' && segments.length >= 3 && METHODS.has(segments[2]))
    return [`${segments[2].toUpperCase()} ${segments[1]}`, ...segments.slice(3)].join(' › ')
  return segments.join(' › ')
}

/**
 * Decide what one difference means for a caller.
 * @param diff - the difference.
 * @param requestNames - component schemas a request reaches (`requestSchemas`).
 */
export function classify(diff: Difference, requestNames: Set<string>): Finding {
  const segs = diff.path
  const last = segs.at(-1) ?? ''
  const parent = segs.at(-2) ?? ''
  const inRequest =
    (segs[0] === 'paths' && (segs.includes('requestBody') || segs.includes('parameters'))) ||
    (segs[0] === 'components' && segs[1] === 'schemas' && requestNames.has(segs[2] ?? ''))
  const at = where(segs)
  const breaking = (reason: string): Finding => ({ severity: 'breaking', reason, where: at })
  const isPropertyName = parent === 'properties'
  if (diff.kind === 'removed') {
    if (segs[0] === 'paths' && segs.length === 2) return breaking('path removed')
    if (segs[0] === 'paths' && segs.length === 3 && METHODS.has(last)) return breaking('operation removed')
    if (parent === 'parameters') return breaking('parameter removed')
    if (isPropertyName) return breaking(inRequest ? 'request property removed' : 'response property removed')
    if (parent === 'enum') return breaking('enum value removed')
    // A type option dropped from a set narrows; a `$ref` dropped means the schema changed form. Dropping
    // `type`, `const` or `format` alone only loosens what is accepted, so it is not listed here.
    if (parent === 'type' || last === '$ref') return breaking('type changed')
    if (parent === 'oneOf' || parent === 'anyOf') return breaking('variant removed')
    if (segs[0] === 'components' && segs.length === 3) return breaking('component removed')
    if (parent === 'responses' && last.startsWith('2')) return breaking('success response removed')
    if (parent === 'content') return breaking('media type removed')
    if (parent === 'security') return breaking('authentication alternative removed')
    return { severity: 'changed', reason: 'removed', where: at }
  }
  if (diff.kind === 'added') {
    if (parent === 'parameters' && isObj(diff.after) && diff.after.required === true)
      return breaking('required parameter added')
    if (
      last === 'parameters' &&
      segs[0] === 'paths' &&
      isObj(diff.after) &&
      Object.values(diff.after).some((p) => isObj(p) && p.required === true)
    )
      return breaking('required parameter added')
    if (segs.at(-3) === 'parameters' && last === 'required' && diff.after === true)
      return breaking('parameter made required')
    if (parent === 'required' && inRequest && !isPropertyName)
      return breaking('request property newly required')
    if (
      last === 'required' &&
      inRequest &&
      !isPropertyName &&
      isObj(diff.after) &&
      segs.at(-3) !== 'parameters'
    )
      return breaking('request property newly required')
    if (parent === 'security' && diff.parentSizeBefore === 0) return breaking('authentication added')
    if (last === 'requestBody' && isObj(diff.after) && diff.after.required === true)
      return breaking('request body now required')
    return { severity: 'additive', reason: 'added', where: at }
  }
  if (last === 'required' && diff.before !== true && diff.after === true && !isPropertyName)
    return breaking(segs.at(-3) === 'parameters' ? 'parameter made required' : 'now required')
  if (['type', 'const', '$ref', 'format'].includes(last) && !isPropertyName) return breaking('type changed')
  if (isObj(diff.before) !== isObj(diff.after)) return breaking('type changed')
  if (last === 'additionalProperties' && diff.after === false && inRequest)
    return breaking('request now refuses extra properties')
  return {
    severity: 'changed',
    reason: `changed from ${JSON.stringify(diff.before)} to ${JSON.stringify(diff.after)}`,
    where: at
  }
}

/** Every classified difference between two normalized documents. */
export function compareDocuments(before: Json, after: Json): Finding[] {
  const names = requestSchemas(before, after)
  return differences(diffView(before), diffView(after)).map((d) => classify(d, names))
}

/** The newest `## YYYY-MM-DD` heading in the changelog, or null. */
export function newestChangelogDate(markdown: string): string | null {
  const dates = [...markdown.matchAll(/^##\s+(\d{4}-\d{2}-\d{2})\b/gm)].map((m) => m[1]).sort()
  return dates.at(-1) ?? null
}

interface Snapshot {
  readonly recorded?: string
  readonly public?: Obj
  readonly internal?: Obj
}

const ACTION = 'run pnpm api:snapshot and add a dated line to docs/references/api-changelog.md'

/**
 * The gate's whole decision, away from the filesystem.
 * @returns lines to print; `ok` false means red.
 */
export function verdict(
  snapshot: Snapshot | null,
  current: { public: Obj; internal: Obj },
  changelog: string | null
): { ok: boolean; lines: string[] } {
  if (snapshot === null || !snapshot.public || !snapshot.internal)
    return {
      ok: false,
      lines: [`api-spec: no snapshot at apps/tracy-web/api-reference.snapshot.json — ${ACTION}`]
    }
  const lines: string[] = []
  let ok = true
  const pub = compareDocuments(snapshot.public, current.public)
  const internal = compareDocuments(snapshot.internal, current.internal)
  const versionBefore = isObj(snapshot.public.info) ? snapshot.public.info.version : undefined
  const versionAfter = isObj(current.public.info) ? current.public.info.version : undefined
  const versionMoved = versionBefore !== versionAfter
  const breaking = pub.filter((f) => f.severity === 'breaking')
  const print = (scope: string, f: Finding) =>
    `  ${f.severity.toUpperCase()}  ${scope}: ${f.reason} — ${f.where}`
  if (breaking.length > 0 && !versionMoved) {
    ok = false
    lines.push(
      `api-spec: ${breaking.length} breaking change(s) to the public API, and info.version is still ${JSON.stringify(versionBefore)}:`,
      ...breaking.map((f) => print('public', f)),
      'api-spec: restore what was removed, or ship it as a new API version (info.version) with a changelog line.'
    )
  }
  const rest = pub.filter((f) => f.severity !== 'breaking' || versionMoved)
  if (rest.length > 0) {
    ok = false
    lines.push(
      `api-spec: the public API differs from the snapshot — ${ACTION}:`,
      ...rest.map((f) => print('public', f))
    )
  }
  if (pub.length === 0 && internal.length > 0) {
    ok = false
    lines.push(
      'api-spec: the internal reference differs from the snapshot — run pnpm api:snapshot (internal only: no changelog line needed):',
      ...internal.map((f) => print('internal', f))
    )
  }
  if (pub.length === 0) {
    const newest = changelog === null ? null : newestChangelogDate(changelog)
    if (newest === null) {
      ok = false
      lines.push('api-spec: docs/references/api-changelog.md has no `## YYYY-MM-DD` entry')
    } else if (snapshot.recorded && newest < snapshot.recorded) {
      ok = false
      lines.push(
        `api-spec: the public API changed on ${snapshot.recorded} (snapshot) but the newest entry of ` +
          `docs/references/api-changelog.md is ${newest} — add a dated line saying what changed`
      )
    }
  }
  if (ok) {
    const count = Object.values(isObj(current.public.paths) ? current.public.paths : {}).reduce<number>(
      (n, item) => n + Object.keys(isObj(item) ? item : {}).filter((m) => METHODS.has(m)).length,
      0
    )
    lines.push(
      `api-spec: public API ${String(versionAfter)} matches the snapshot (${count} operations, recorded ${snapshot.recorded})`
    )
  }
  return { ok, lines }
}

async function main(): Promise<void> {
  // Loaded dynamically, not imported: tsx compiles this file as CommonJS, and a static import would
  // drag `apps/tracy-web` (top-level await in `lib/content-api.js`) through the CommonJS transform.
  // A dynamic import stays native ESM. It also keeps the tests of the pure decision above free of
  // the app's module graph.
  const { buildDocuments, normalize, readSnapshot, SNAPSHOT_PATH } = await import('./build-api-spec.mjs')
  const built = buildDocuments() as { public: Json; internal: Json }
  const current = { public: normalize(built.public) as Obj, internal: normalize(built.internal) as Obj }
  const changelog = existsSync(CHANGELOG_PATH) ? readFileSync(CHANGELOG_PATH, 'utf8') : null
  const result = verdict(readSnapshot(SNAPSHOT_PATH) as Snapshot | null, current, changelog)
  const stream = result.ok ? process.stdout : process.stderr
  stream.write(`${result.lines.join('\n')}\n`)
  process.exit(result.ok ? 0 : 1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error: unknown) => {
    process.stderr.write(
      `api-spec: could not build the reference: ${String((error as Error)?.stack ?? error)}\n`
    )
    process.exit(1)
  })
