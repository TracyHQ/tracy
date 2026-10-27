/**
 * Assertion registry: `harness.<family>.<…>` → the scenario it runs and the kind of runtime it needs.
 * A scenario returns `{ controls, checks, evidence }`; the runner turns that into a verdict.
 * Nothing here knows about verdicts, RED or reports.
 */
import { GUARD_TEXT, fenceKey, runFenceVariant } from './fence.mjs'
import { createRuntime, removeScratch, tmpRootFor } from './runtime.mjs'
import * as S from './scenarios.mjs'
import * as ST from './staticchecks.mjs'

const decodeKey = (tk) => tk.replace('+', ':')

/** What a missing-cwd probe sends, per tool. */
const NO_CWD_ARGS = {
  bash: () => ({ command: 'echo hi', description: 'qa' }),
  read: (w) => ({ file_path: w.sites.a1.own }),
  write: (w) => ({ file_path: `${w.sites.a1.dir}/.webroot/nocwd.txt`, content: 'x' }),
  tracy_site: () => ({ action: 'content.list', params: { kind: 'post' } })
}

/**
 * Resolve an assertion id.
 * @returns {{ runtime: 'shared' | 'legacy' | 'none' | 'own', run: (ctx: any) => Promise<any> } | null}
 */
export function resolve(assertionId) {
  const parts = assertionId.split('.')
  if (parts[0] !== 'harness') return null
  const [, family, a, b, c] = parts

  if (family === 'fence') return { runtime: 'shared', run: ({ rt }) => runFenceVariant(rt, decodeKey(a), b) }
  if (family === 'guard') {
    return {
      runtime: 'shared',
      run: ({ rt }) => runFenceVariant(rt, a, b, { expectText: GUARD_TEXT[b] ?? null })
    }
  }
  if (family === 'audit') return { runtime: 'shared', run: ({ rt }) => S.fenceAudit(rt, decodeKey(a)) }
  if (family === 'route') {
    if (a === 'files') return { runtime: 'shared', run: ({ rt }) => S.routeFiles(rt, b) }
    if (a === 'shell') return { runtime: 'shared', run: ({ rt }) => S.routeShell(rt, b) }
  }
  if (family === 'dispatch') {
    if (a === 'unknown-tool') return { runtime: 'shared', run: ({ rt }) => S.unknownTool(rt) }
    if (a === 'schema-invalid')
      return { runtime: 'shared', run: ({ rt, schemas }) => S.schemaInvalid(rt, b, schemas[b]) }
    if (a === 'missing-cwd')
      return { runtime: 'shared', run: ({ rt }) => S.missingCwdDispatch(rt, b, NO_CWD_ARGS[b]) }
    if (a === 'stream') return { runtime: 'shared', run: ({ rt }) => S.streamFailure(rt, b) }
    if (a === 'cancel') return { runtime: 'shared', run: ({ rt }) => S.cancel(rt, b) }
    if (a === 'tool-failure') return { runtime: 'shared', run: ({ rt }) => S.toolFailure(rt, b) }
    if (a === 'docker-down') return { runtime: 'shared', run: ({ rt }) => S.dockerDown(rt) }
    if (a === 'permission-revoked') return { runtime: 'shared', run: ({ rt }) => S.permissionRevoked(rt) }
  }
  if (family === 'approval') {
    if (a === 'never') return { runtime: 'shared', run: ({ rt }) => S.approvalNever(rt, b) }
    if (a === 'legacy') return { runtime: 'legacy', run: ({ rt }) => S.approvalLegacyAsk(rt, b) }
  }
  if (family === 'writepath') {
    if (a === 'record-failure') return { runtime: 'shared', run: ({ rt }) => S.recordFailure(rt) }
    return { runtime: 'shared', run: ({ rt }) => S.writePath(rt, a, b) }
  }
  if (family === 'cleanup') {
    return {
      runtime: 'own',
      run: ({ artifactRoot, extra }) =>
        S.cleanupRuntime({ createRuntime, base: artifactRoot, tmpRootFor, removeScratch, extra: extra ?? {} })
    }
  }
  if (family === 'matrix') {
    const id = parts.slice(3).join('.')
    return {
      runtime: 'none',
      run: ({ paths }) => (a === 'tool' ? ST.matrixToolRow(id, paths) : ST.matrixSkillRow(id, paths))
    }
  }
  if (family === 'profile') return { runtime: 'none', run: ({ paths }) => ST.profileRow(a, paths) }
  if (family === 'surface') {
    if (a === 'compat') return { runtime: 'none', run: ({ paths }) => ST.surfaceCompat(b, paths) }
    if (a === 'dispatch')
      return { runtime: 'shared', run: ({ rt, paths }) => ST.surfaceDispatch(rt, b, paths) }
  }
  void c
  return null
}

export { fenceKey }
