// Postwrite audio uses the host's existing pageMeasures read, after settings and route changes.
import { audioSourceIdentity } from 'website-opportunities/domain/audio-source.mjs'
import { pagePath } from '../lib/hidden-page-links.js'
import { callPages, CALL_BUDGET_MS, CALL_TIMEOUT_MS, chunksOf, hostPath } from '../lib/page-chunks.js'

const each = (value) => (Array.isArray(value) ? value : [])
const widths = [1440, 390]
const box = (value) => value && ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(value[k]))
const visible = (value) =>
  value?.visible === true && box(value.rect) && value.rect.width > 0 && value.rect.height > 0
const sameTrack = (a, b) => a.entity === b.entity && a.track === b.track

function pathsOf(order, { kit, plan, keptPages }) {
  const shared = each(plan.sharedBlocks).some((d) => d.block === order.block && d.decision !== 'hide')
  return each(plan.pages)
    .filter((p) => p.decision === 'keep')
    .flatMap((p) => {
      const page = each(kit.pages).find((k) => k.id === p.id)
      const member = Object.values(page?.blocks ?? {}).some((ids) => each(ids).includes(order.block))
      const active =
        shared ||
        each(p.blocks).some(
          (d) => (typeof d === 'string' ? d : d.block) === order.block && d.decision !== 'hide'
        )
      const current = keptPages.filter((k) => k.id === p.id)
      return member && active && current.length === 1 && typeof current[0].path === 'string'
        ? [current[0].path]
        : []
    })
}

function pageProblem(measure, path) {
  if (
    measure.audioTruncated !== false ||
    measure.audioUnbound !== 0 ||
    !['audioSources', 'audioRows', 'audioLists'].every((k) => Array.isArray(measure[k]))
  )
    return 'the host gave no complete bound audio census'
  try {
    const actual = new URL(measure.url)
    const base = measure.sourceBase ? new URL(measure.sourceBase) : new URL('/', actual)
    if (actual.origin !== base.origin || !actual.pathname.startsWith(base.pathname))
      return 'the browser left the site base'
    const local = '/' + actual.pathname.slice(base.pathname.length)
    if (actual.search || pagePath(local) !== pagePath(hostPath(path)))
      return 'the browser did not read the exact owner route'
  } catch {
    return 'the host gave no actual page URL'
  }
  if (
    [...measure.audioSources, ...measure.audioRows, ...measure.audioLists].some(
      (a) => !a || typeof a.entity !== 'string'
    )
  )
    return 'the audio census has malformed identities'
  return null
}

function trackProblem(order, measure) {
  const ownerSources = measure.audioSources.filter((a) => a.entity === order.entity)
  const ownerRows = measure.audioRows.filter((a) => a.entity === order.entity)
  const kept = order.ownerTracks.filter((a) => a.ordered !== '')
  if (
    ownerSources.length !== kept.length ||
    ownerRows.length !== kept.length ||
    kept.some(
      (t) =>
        ownerSources.filter(
          (a) => sameTrack(a, t) && a.source === audioSourceIdentity(t.ordered, measure.sourceBase)
        ).length !== 1 || ownerRows.filter((a) => sameTrack(a, t)).length !== 1
    )
  )
    return 'the owner source/whole-row census changed or is ambiguous'

  const sources = measure.audioSources.filter((a) => sameTrack(a, order))
  const rows = measure.audioRows.filter((a) => sameTrack(a, order))
  const lists = measure.audioLists.filter((a) => a.entity === order.entity)
  if (!order.ordered) {
    if (sources.length || rows.length) return 'the emptied source still has a source or whole track row'
    if (order.allEmpty && lists.length) return 'the all-empty owner still has a player list'
    if (!order.allEmpty && (lists.length !== 1 || !visible(lists[0])))
      return 'the other owner tracks lost their player list'
    return null
  }
  if (sources.length !== 1 || rows.length !== 1)
    return 'the exact owner/track source or row is missing or ambiguous'
  const source = sources[0]
  const expected = audioSourceIdentity(order.ordered, measure.sourceBase)
  if (
    !expected ||
    source.source !== expected ||
    source.currentSrc !== expected ||
    source.initialized !== true
  )
    return 'the initialized source and current URL do not match the ordered source'
  if (!box(source.rect) || !visible(rows[0]))
    return 'the source geometry or its own visible track row is missing'
  if (
    !Number.isFinite(source.readyState) ||
    source.readyState < 1 ||
    !Number.isFinite(source.duration) ||
    source.duration <= 0 ||
    source.mediaError !== null
  )
    return 'the player has no loaded metadata or reports a media error'
  if (source.mechanism !== 'native' && source.mechanism !== 'jplayer') return 'unsupported player mechanism'
  if (source.mechanism === 'jplayer' && (lists.length !== 1 || !visible(lists[0])))
    return 'the owner player list is missing or ambiguous'
  return null
}

/** Exact stored orders in; real host facts out. Missing transport stays pending, never an accepted absence. */
export async function proveAudio({ orders, kit, plan, keptPages, host, isCancelled }) {
  if (!orders.length) return []
  if (typeof host !== 'function') return orders
  const scopes = orders.map((order) => ({
    order,
    paths: [...new Set(pathsOf(order, { kit, plan, keptPages }))]
  }))
  const paths = [...new Set(scopes.flatMap((s) => s.paths))]
  let measures = [],
    visits = [],
    failure = null
  try {
    for (const chunk of chunksOf(paths)) {
      if (await isCancelled()) return orders
      const answer = await host({
        ...callPages(chunk),
        discover: false,
        incremental: false,
        measurePages: true,
        budgetMs: CALL_BUDGET_MS,
        timeoutMs: CALL_TIMEOUT_MS
      })
      if (!Array.isArray(answer?.pageMeasures) || !Array.isArray(answer.visited))
        throw new Error('the host gave no pageMeasures or HTTP visit census')
      visits.push(...answer.visited)
      measures.push(...answer.pageMeasures)
    }
  } catch (error) {
    failure = `audio page read failed: ${error.message}`
  }
  return scopes.map(({ order, paths }) => {
    const observations = []
    let problem =
      failure || (!paths.length ? 'no exact kept owner route is bound to this audio source' : null)
    for (const path of paths)
      for (const width of widths) {
        const visited = visits.filter(
          (v) => v && typeof v.path === 'string' && pagePath(v.path) === pagePath(hostPath(path))
        )
        const visit = visited[0]
        if (
          visited.length !== 1 ||
          visit.status !== 200 ||
          visit.skipped ||
          typeof visit.finalPath !== 'string' ||
          pagePath(visit.finalPath) !== pagePath(hostPath(path))
        )
          problem ||= `the exact owner page ${path} was not read successfully`

        const found = measures.filter(
          (m) =>
            m &&
            typeof m.path === 'string' &&
            pagePath(m.path) === pagePath(hostPath(path)) &&
            m.width === width
        )
        if (found.length !== 1) {
          problem ||= `missing or ambiguous ${path} at ${width}`
          continue
        }
        const measure = found[0]
        const why = pageProblem(measure, path) || trackProblem(order, measure)
        problem ||= why
        observations.push({
          path,
          width,
          visit,
          url: measure.url,
          sourceBase: measure.sourceBase,
          sources: measure.audioSources,
          rows: measure.audioRows,
          lists: measure.audioLists,
          truncated: measure.audioTruncated,
          unbound: measure.audioUnbound,
          problem: why
        })
      }
    return {
      ...order,
      status: problem ? 'failed' : 'verified',
      reason:
        problem ||
        (order.ordered
          ? 'stored source and initialized player metadata verified at both widths'
          : 'guarded empty source and whole row/list absence verified at both widths'),
      observations
    }
  })
}
