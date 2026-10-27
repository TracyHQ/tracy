// The independent oracle of the api layer: the API snapshot and the route reference text as they
// stood at a pinned git revision. Nothing about the doors is committed in expanded form: the door list
// is derived at run time from the pinned source with `git show <sha>:<path>`, and the bytes are
// verified against the pinned sha256 before use. A missing commit or a hash mismatch is an
// OracleEnvError (the caller reports ENV with the probe output), never a pass.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ContractError, readJson, sha256 } from './io.mjs'

export const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']
export const HTTP_WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** The pinned source cannot be read or does not match its pin: an environment fault, with the probe output. */
export class OracleEnvError extends Error {
  constructor(message, probe = '') {
    super(message)
    this.name = 'OracleEnvError'
    this.probe = probe
  }
}

const git = (repoRoot, args, opts = {}) =>
  execFileSync('git', ['-C', repoRoot, ...args], {
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 60_000,
    ...opts
  })

const probeOf = (error) =>
  String(error.stderr || error.message || error)
    .trim()
    .slice(0, 400)

export function readPin(pinPath) {
  const pin = readJson(pinPath)
  if (!/^[0-9a-f]{40}$/.test(pin.revision ?? ''))
    throw new ContractError('pin.revision must be a 40-hex commit')
  if (typeof pin.snapshot?.path !== 'string' || !pin.snapshot.path)
    throw new ContractError('pin.snapshot.path missing')
  if (!/^[0-9a-f]{64}$/.test(pin.snapshot?.sha256 ?? ''))
    throw new ContractError('pin.snapshot.sha256 missing')
  if (!Array.isArray(pin.routeDocs?.paths) || pin.routeDocs.paths.length === 0)
    throw new ContractError('pin.routeDocs.paths missing')
  if (!/^[0-9a-f]{64}$/.test(pin.routeDocs.sha256 ?? ''))
    throw new ContractError('pin.routeDocs.sha256 missing')
  return pin
}

/** Hash input of the pinned route-reference files: their `git ls-tree -r` listing (blob ids). */
export const routeDocsListing = (repoRoot, pin) =>
  git(repoRoot, ['ls-tree', '-r', pin.revision, '--', ...pin.routeDocs.paths])

/** The snapshot bytes at the pinned revision (`git show <sha>:<path>`), hash-verified. */
export function readPinnedSnapshot(repoRoot, pin) {
  let bytes
  try {
    bytes = git(repoRoot, ['show', `${pin.revision}:${pin.snapshot.path}`])
  } catch (error) {
    throw new OracleEnvError(
      `cannot read ${pin.snapshot.path} at ${pin.revision} from git (missing commit or shallow clone?)`,
      probeOf(error)
    )
  }
  const hash = sha256(bytes)
  if (hash !== pin.snapshot.sha256)
    throw new OracleEnvError(
      `snapshot sha256 ${hash} does not match the pin ${pin.snapshot.sha256}`,
      `git show ${pin.revision}:${pin.snapshot.path} -> sha256 ${hash}`
    )
  try {
    return { snapshot: JSON.parse(bytes.toString('utf8')), from: 'git', sha256: hash }
  } catch (error) {
    throw new ContractError(`snapshot is not valid JSON: ${error.message}`)
  }
}

/** ROUTE_DOCS as of the pinned revision, imported from a throwaway checkout of just the doc files. */
export async function readPinnedRouteDocs(repoRoot, pin) {
  let listing
  let tar
  try {
    listing = routeDocsListing(repoRoot, pin)
    tar = git(repoRoot, ['archive', '--format=tar', pin.revision, ...pin.routeDocs.paths])
  } catch (error) {
    throw new OracleEnvError(
      `cannot read the route reference at ${pin.revision} from git (missing commit or shallow clone?)`,
      probeOf(error)
    )
  }
  const hash = sha256(listing)
  if (hash !== pin.routeDocs.sha256)
    throw new OracleEnvError(
      `route reference sha256 ${hash} does not match the pin ${pin.routeDocs.sha256}`,
      `git ls-tree -r ${pin.revision} -- ${pin.routeDocs.paths.join(' ')} -> sha256 ${hash}`
    )
  const dir = mkdtempSync(join(tmpdir(), 'qa-api-routedocs-'))
  try {
    execFileSync('tar', ['-x', '-C', dir], { input: tar })
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n')
    const mod = await import(
      pathToFileURL(join(dir, 'apps/tracy-web/src/api-reference/routes/index.js')).href
    )
    // Own the data: a structured clone drops every reference into the throwaway files.
    return structuredClone(mod.ROUTE_DOCS)
  } catch (error) {
    throw new ContractError(`cannot read route reference at ${pin.revision}: ${error.message}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const cache = new Map()

/**
 * The door list derived from the pinned source: `{ doors, doorIndex, doorsByPath, unresolved, provenance }`.
 * Memoised per (repo, pin) so one process reads git once.
 */
export async function loadDoors(repoRoot, pinPath) {
  const pin = readPin(pinPath)
  const key = [repoRoot, pin.revision, pin.snapshot.sha256, pin.routeDocs.sha256].join('|')
  if (!cache.has(key)) {
    const loading = (async () => {
      const { snapshot, from, sha256: snapshotSha256 } = readPinnedSnapshot(repoRoot, pin)
      const routeDocs = await readPinnedRouteDocs(repoRoot, pin)
      const { doors, unresolved } = extractDoors(snapshot, routeDocs)
      const doorIndex = new Map(doors.map((d) => [d.id, d]))
      const doorsByPath = new Map()
      for (const d of doors) doorsByPath.set(d.path, [...(doorsByPath.get(d.path) ?? []), d])
      return {
        pin,
        doors,
        doorIndex,
        doorsByPath,
        unresolved,
        provenance: {
          revision: pin.revision,
          snapshotSha256,
          snapshotRead: from,
          routeDocsSha256: pin.routeDocs.sha256
        }
      }
    })()
    cache.set(key, loading)
    loading.catch(() => cache.delete(key))
  }
  return cache.get(key)
}

export const toOpenApiPath = (p) => p.replace(/:([A-Za-z0-9_]+)/g, '{$1}')

/** Resolve local `$ref`s; collect refs that do not resolve. */
function resolveRefs(node, components, unresolved, where, depth = 0) {
  if (Array.isArray(node)) return node.map((n) => resolveRefs(n, components, unresolved, where, depth))
  if (!node || typeof node !== 'object') return node
  if (typeof node.$ref === 'string') {
    const m = /^#\/components\/schemas\/(.+)$/.exec(node.$ref)
    const target = m ? components?.schemas?.[m[1]] : undefined
    if (!target || depth > 6) {
      unresolved.push({ where, reason: `$ref ${node.$ref} does not resolve` })
      return {}
    }
    return resolveRefs(target, components, unresolved, where, depth + 1)
  }
  return Object.fromEntries(
    Object.entries(node).map(([k, v]) => [k, resolveRefs(v, components, unresolved, where, depth)])
  )
}

/**
 * One entry per METHOD path of the internal document (a superset of the public one), with the
 * membership flag kept apart so public and internal-only doors are reported separately.
 */
export function extractDoors(snapshot, routeDocs) {
  const unresolved = []
  const docIndex = new Map()
  for (const d of routeDocs) docIndex.set(`${d.method.toUpperCase()} ${toOpenApiPath(d.path)}`, d)
  const internal = snapshot.internal
  const pub = snapshot.public
  if (!internal?.paths || !pub?.paths) throw new ContractError('snapshot lacks public/internal paths')
  const rootSecurity = internal.security ?? []
  const doors = []
  for (const [path, item] of Object.entries(internal.paths)) {
    for (const m of METHODS) {
      const op = item[m]
      if (!op) continue
      const method = m.toUpperCase()
      const id = `${method} ${path}`
      let doc = docIndex.get(id)
      if (!doc && /^\/api\/sites\/\{key\}\/apply\/[^/{}]+$/.test(path))
        doc = docIndex.get(`${method} /api/sites/{key}/apply/{action}`)
      const params = [...(item.parameters ?? []), ...(op.parameters ?? [])].map((p) => ({
        in: p.in,
        name: p.name,
        required: p.required === true,
        schema: p.schema ?? {}
      }))
      let body = null
      if (op.requestBody) {
        const content = op.requestBody.content ?? {}
        const json = content['application/json']
        body = {
          required: op.requestBody.required === true,
          contentTypes: Object.keys(content).sort(),
          schema: json ? resolveRefs(json.schema ?? {}, internal.components, unresolved, id) : null
        }
      }
      // Declared 2xx answers: content types and the resolved schema (recursion limited by resolveRefs; an
      // unresolvable $ref is recorded in `unresolved`, never guessed).
      const responses = {}
      for (const [status, r] of Object.entries(op.responses ?? {})) {
        if (!/^2\d\d$/.test(status) || !r?.content) continue
        const types = Object.keys(r.content).sort()
        const json = r.content['application/json']
        responses[status] = {
          contentTypes: types,
          schema: json
            ? resolveRefs(json.schema ?? {}, internal.components, unresolved, `${id} ${status}`)
            : null
        }
      }
      const security = op.security === undefined ? rootSecurity : op.security
      const kinds = [...new Set(security.flatMap((s) => Object.keys(s)))].sort()
      doors.push({
        id,
        method,
        path,
        operationId: op.operationId,
        tags: op.tags ?? [],
        audience: op['x-audience'] ?? [],
        securityDeclared: op.security !== undefined,
        security: kinds,
        public: Boolean(pub.paths[path]?.[m]),
        declaredStatuses: Object.keys(op.responses ?? {}).sort(),
        params,
        body,
        responses,
        doc: doc
          ? {
              auth: doc.auth,
              internal: doc.internal === true,
              audience: doc.audience,
              answers: doc.answers ?? null
            }
          : null
      })
    }
  }
  doors.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { doors, unresolved, rootSecurity }
}
