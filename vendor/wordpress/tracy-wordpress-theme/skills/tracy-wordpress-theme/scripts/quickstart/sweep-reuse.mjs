// sweep-reuse.mjs — whether the full release sweep a patch chain already holds is the sweep it would run now.
//
// The chain's sweep is the full sweep of the release (7-13 minutes). It is not run again only when what is on disk in <out>/sweep IS that
// measure, which takes all of this to hold:
//   - fix-measure.json is a valid tracy-fix-measure/v1 of a full run (nothing carried) and site-sweep.json, next to it, is the report it was
//     written with (its embedded fixMeasure is the same document), a full run of all eleven checks, at the default widths and schemes,
//     over every route of the dossier, with nothing owed and no check with a defect, an accept error or a case not measured;
//   - it is bound to this theme zip (sha256 of the bytes), this site and source, and the dossier it holds now (`inputs`: contract,
//     review.config.json with its accept rows, DECISIONS.md, every file of the spec-pack, rendered source snapshots included);
//   - the sweep and its fix-measure both record the fingerprint of the source they measured (lib/source-fingerprint.mjs), the two agree, and the
//     source read now, with the sweep's own reader and inputs (its home URL and the declared template identity), has the same fingerprint;
//     that is the home page and the template identity, not every resource of the source;
//   - it was judged against the same baseline (the sha256 of the bytes of the file read, and the version), and carries the counts it made of them;
//   - it ran at or after the moment the restore the chain verifies finished. A restore the chain runs now is always newer than any
//     earlier sweep, so a chain that restored always measures again; only a resume that keeps the verified restore can reuse. Two
//     restores of one zip are not taken for one another: the clock is the only thing that says this sweep saw this restore.
// An extra `--sweep-arg` can change what is measured and the evidence does not record it: the sweep is run.
// Anything missing, unreadable or different is a reason to run the full sweep, never a reason to fail.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { carriedEvidence, validateFixMeasure } from '../lib/fix-measure.mjs'
import { ALL_CHECKS, DEFAULT_SCHEMES, DEFAULT_WIDTHS, SWEEP_SCHEMA, readBaseline, sweepInputs } from '../visual/site-sweep.mjs'
import { differsFrom, homeUrlOf, templateOf } from '../lib/source-fingerprint.mjs'
import { sha256File } from './lib.mjs'
import { readSourceNow } from './release.mjs'

const CLOCK_SKEW_MS = 5 * 60 * 1000
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const origin = (u) => {
  try {
    return new URL(u).origin
  } catch {
    return String(u ?? '')
  }
}

/**
 * → { reuse: true, ranAt, measure, report } or { reuse: false, why }.
 * `pages` is the number of routes of the dossier (the visual contract's pages, else the spec's page map).
 */
export function reusableSweep({ sweepDir, themeZip, site, source, baseline, baselineVersion = null, runRoot, spec, restoreReport, sweepArgs = [], now = Date.now(), readSource = readSourceNow }) {
  const no = (why) => ({ reuse: false, why })
  try {
    if (sweepArgs.length) return no(`--sweep-arg ${sweepArgs.join(' ')} may change what is measured`)
    const measureFile = path.join(sweepDir, 'fix-measure.json')
    const reportFile = path.join(sweepDir, 'site-sweep.json')
    if (!existsSync(measureFile) || !existsSync(reportFile)) return no('there is no earlier sweep in the output')
    const fix = readJson(measureFile)
    const doc = readJson(reportFile)
    const bad = validateFixMeasure(fix)
    if (bad.length) return no(`the earlier fix-measure.json does not validate: ${bad[0]}`)
    if (doc?.schema !== SWEEP_SCHEMA) return no('the earlier site-sweep.json is not a site-sweep report')
    if (!same(doc.fixMeasure, fix)) return no('the earlier site-sweep.json is not the report fix-measure.json was written with')
    const carried = carriedEvidence(doc) ?? carriedEvidence(fix)
    if (carried) return no(`the earlier sweep is ${carried}, not a full run`)
    if (doc.run?.mode !== 'full') return no('the earlier sweep is not recorded as a full run')
    if (!same(doc.only, ALL_CHECKS) || !same(doc.checks?.map((c) => c.id), ALL_CHECKS)) return no('the earlier sweep did not run all eleven checks')
    if (!same(doc.widths, DEFAULT_WIDTHS) || !same(doc.schemes, DEFAULT_SCHEMES)) return no('the earlier sweep did not use the default widths and schemes')
    if ((doc.owed?.length ?? 0) > 0 || doc.exit !== 0) return no('the earlier sweep is not green: something is owed or it did not exit 0')
    // every check has to be a pass: a defect, an accept error, a case not measured, or no case measured at all (a check that read nothing is not green)
    const failing = doc.checks.filter((c) => c.pass !== true || !(c.cases > 0) || c.defects > 0 || c.acceptErrors > 0 || c.notMeasured > 0 || c.carried || c.scoped)
    if (failing.length) return no(`the earlier sweep is not green: ${failing.map((c) => c.id).join(', ')} did not pass`)
    if (!(doc.routesTotal > 0) || doc.routesMeasured !== doc.routesTotal) return no('the earlier sweep did not measure every route')
    if (fix.artifact.themeZipSha256 !== sha256File(themeZip) || doc.theme?.zipSha256 !== fix.artifact.themeZipSha256) return no('the earlier sweep measured another theme zip')
    if (origin(fix.site) !== origin(site) || origin(doc.site) !== origin(site)) return no('the earlier sweep measured another site')
    if (origin(fix.source) !== origin(source) || origin(doc.source) !== origin(source)) return no('the earlier sweep measured against another source')
    if (!doc.sourceFingerprint) return no('the earlier sweep records no fingerprint of the source it measured')
    if (!fix.sourceFingerprint) return no('the earlier fix-measure.json records no fingerprint of the source it measured')
    const recorded = differsFrom(doc.sourceFingerprint, fix.sourceFingerprint)
    if (recorded) return no(`the earlier sweep and its fix-measure record different source fingerprints: ${recorded}`)
    const inputs = sweepInputs(runRoot, spec)
    if (typeof inputs.hash !== 'string' || typeof doc.inputs?.hash !== 'string') return no('the dossier inputs of the earlier sweep, or of now, cannot be hashed whole')
    if (doc.inputs.hash !== inputs.hash) return no('the dossier or the spec-pack changed since the earlier sweep')
    const b = readBaseline(baseline, baselineVersion)
    // the baseline is the bytes of the file readBaseline read, not the counts it makes of them; an earlier sweep that did not record them is a miss
    if (typeof b.sha256 !== 'string' || doc.baselineInput?.sha256 !== b.sha256 || doc.baselineInput?.version !== b.version) return no('the earlier sweep was judged against another baseline, or records none')
    const was = fix.baseline
    if (!was || was.version !== b.version || was.passed !== b.passed || was.total !== b.total || was.ranAt !== b.ranAt || !same(was.checks, b.checks)) return no('the earlier sweep was judged against another baseline')
    const ranAt = Date.parse(fix.ranAt)
    if (!(ranAt <= now + CLOCK_SKEW_MS)) return no('the earlier sweep claims to have run in the future')
    if (!existsSync(restoreReport)) return no(`the restore report ${restoreReport} is not there to date the sweep against`)
    const finished = Date.parse(readJson(restoreReport).finishedAt)
    if (!Number.isFinite(finished)) return no('the restore report has no finishedAt')
    if (ranAt < finished) return no(`the earlier sweep ran at ${fix.ranAt}, before the restore finished (${new Date(finished).toISOString()})`)
    // the source is read last: it is the one step that goes to the network
    const contractFile = path.join(runRoot, 'visual.contract.json')
    const live = readSource(homeUrlOf({ source, contract: existsSync(contractFile) ? readJson(contractFile) : null }), templateOf(spec))
    if (!live?.ok) return no(`the source cannot be fingerprinted now: ${live?.error ?? 'no answer'}`)
    const moved = differsFrom(fix.sourceFingerprint, live.fingerprint)
    if (moved) return no(`the source is not the one the earlier sweep measured: ${moved}`)
    return { reuse: true, ranAt: fix.ranAt, measure: measureFile, report: reportFile }
  } catch (e) {
    return no(`the earlier sweep could not be checked: ${String(e.message).split('\n')[0]}`)
  }
}
