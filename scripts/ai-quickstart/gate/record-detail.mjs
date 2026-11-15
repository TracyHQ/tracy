// What a measurement that says `passed` must hold, as a real run of the gate writes it (ticket #586, review round 2):
// its counts worked out again from its own lists, and no less detail than a run gives. Write safety: the places it
// probed, a ledger row that reached the site for each, every pass named, a coverage table whose numbers add up.
// Structure: pages read in each variant, pages hidden and each seen answering as missing. Quality: every group of the
// site check, each compared with a control, and the search engine items read. Secrets: the negative control right
// and gitleaks run on the files and on the record. A record short of any of this is refused, so a status typed in by
// hand or a record cut down by accident never releases a kit. Pure.
import { QUALITY_GROUPS } from './quality-groups.mjs'
import { coverageProblems } from './write-safety-coverage.mjs'

const list = (v) => (Array.isArray(v) ? v : [])
const empty = (v) => Array.isArray(v) && v.length === 0
const count = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : -1)

/** A passing write safety measurement's own lists against its counts. */
function writeSafetyDetail(ws) {
  const out = []
  const p = ws.places ?? {}
  const keys = list(ws.placeKeys)
  const rows = list(ws.ledger)
  const passes = new Set(list(ws.passes).map((x) => x.pass))
  if (!keys.length) out.push('it names no place it probed')
  if (!rows.length || !passes.size) out.push('it keeps no ledger or no pass')
  if (count(p.probed) !== keys.length) out.push('its probed count is not its list of places')
  const reached = new Set(
    rows.filter((r) => r.status === 'written' && r.site === true && r.reached === true).map((r) => r.place)
  )
  const tested = keys.filter((k) => reached.has(k)).length
  if (count(p.tested) !== tested || tested !== keys.length)
    out.push('its tested count is not the places its ledger shows reached on the site')
  if (count(p.written) < keys.length) out.push('it probed more places than the build writes')
  if (!empty(ws.missing ?? null) || !empty(ws.notSiteTested ?? null)) out.push('probes are missing')
  if (rows.some((r) => !passes.has(r.pass))) out.push('a ledger row names a pass it does not keep')
  out.push(...coverageProblems(ws.coverage))
  return out
}

/** A passing structure variant: pages read, none broken, every block counted. */
function variantDetail(name, v) {
  if (v?.status !== 'passed') return []
  if (name === 'hidden') {
    const seen = list(v.seenMissing)
    if (count(v.hidden) < 1 || seen.length !== v.hidden)
      return ['its hidden variant hid no page, or did not see each hidden page answer as missing']
    return empty(v.broken) && empty(v.notBack) ? [] : ['its hidden variant holds broken links']
  }
  if (count(v.pages) < 1) return ['its ' + name + ' variant read no page']
  if (!empty(v.errors) || !empty(v.broken) || !Array.isArray(v.blocks))
    return ['its ' + name + ' variant holds errors or broken links, or counts no block']
  return []
}

/** A passing quality measurement: every group compared, the SEO items read. */
function qualityDetail(q) {
  const out = []
  const groups = Object.keys(q.byGroup ?? {}).sort()
  if (JSON.stringify(groups) !== JSON.stringify([...QUALITY_GROUPS].sort()))
    out.push('its groups are not the site check groups the gate runs')
  for (const [name, g] of Object.entries(q.byGroup ?? {}))
    if (!['green', 'red', 'not-applicable'].includes(g?.status) || !g.control || g.control === 'none')
      out.push('its group ' + name + ' was not measured against a control')
  if (!Object.values(q.byGroup ?? {}).some((g) => g?.status === 'green' || g?.status === 'red'))
    out.push('no group measured anything: every group is not applicable')
  if (!empty(q.regressions) || !empty(q.uncompared) || !empty(q.unmeasured))
    out.push('it holds regressions, or groups not compared or not measured')
  const seo = q.seo
  if (seo?.status !== 'passed' || count(seo.pages) < 1 || !empty(seo.blocking) || !empty(seo.uncompared))
    out.push('its search engine items were not read on every page')
  return out
}

/** A passing secret scan: the control found secrets, and gitleaks ran on the files and on the record. */
function secretsDetail(s) {
  if (s.control?.status !== 'right') return ['its negative control did not find the secrets of the original']
  if (s.gitleaks?.status !== 'ran' || s.recordScan?.gitleaks !== 'ran')
    return ['gitleaks did not run on the files and on the record']
  return []
}

/** Why the passing measurements of a record carry less than a real run gives, as `[{code, message}]`. */
export function detailProblems(record) {
  const m = record?.measurements ?? {}
  const out = []
  const say = (name, reasons) => {
    for (const why of reasons)
      out.push({ code: 'measurement_inconsistent', message: name + ' is passed but ' + why })
  }
  if (m.writeSafety?.status === 'passed') say('writeSafety', writeSafetyDetail(m.writeSafety))
  if (m.structure?.status === 'passed')
    say('structure', [
      ...variantDetail('full', m.structure.linkCheck),
      ...variantDetail('minimum', m.structure.minItems),
      ...variantDetail('hidden', m.structure.hidden)
    ])
  if (m.quality?.status === 'passed') say('quality', qualityDetail(m.quality))
  if (m.secrets?.status === 'passed') say('secrets', secretsDetail(m.secrets))
  return out
}
