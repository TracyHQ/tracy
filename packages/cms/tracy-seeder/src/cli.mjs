/**
 * The seeder as tracy-site-build's seed stage runs it:
 *
 *   tracy-seed --platform wordpress|joomla --preview docs/agents/design-preview.json
 *              --copy docs/agents/design-copy/<id>.json --pages all|<slug…>
 *              [--webroot .webroot] [--data <dir>] [--dry] [--no-model]
 *
 * Reads the two files, the design system from the data directory, asks the model twice (the blog
 * with its covers, the words of the sections), builds the plan, and writes it into the CMS. Exit 0
 * when the site is seeded; otherwise one line on stderr, which the Build card shows. `--dry`
 * prints the plan and writes nothing; `--no-model` skips the two model turns (the sections keep the
 * library's words, the blog is not written) — for stands without a key.
 */
import { execFile } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSeedPlan } from '../../../design/tracy-design-inspiration/src/host/seed-plan.mjs'
import { copyFileName } from '../../../design/tracy-design-inspiration/src/host/gallery.mjs'
import { briefFacts, isDerived, planJoomlaContract, coworkWouldRefuse } from './plan-joomla-contract.mjs'
import { applyJoomlaContract, doorRefusal } from './apply-joomla-contract.mjs'
import { trimJoomlaDemo } from './apply-joomla-demo-trim.mjs'
import { planLanguageTranslation, parseTranslationAnswer } from './plan-joomla-language.mjs'
import { addJoomlaLanguage, removeJoomlaLanguage } from './apply-joomla-language.mjs'
import { drawHeroes } from './hero-images.mjs'
import { loadShippedTranslations } from './shipped-translations.mjs'
import { LANGUAGE_CATALOG } from './language-catalog.mjs'
import { normaliseLocale } from './locales.mjs'
import { reconcileWithSite } from './reconcile-site.mjs'
import { createHash } from 'node:crypto'
import { applyWordPress } from './apply-wordpress.mjs'
import {
  applyWordPressContract,
  inputsFromSite,
  loadContract,
  planContractWrites
} from './apply-wordpress-contract.mjs'
import {
  applyWordPressThroughContract,
  chosenEditions,
  editionContentMap,
  inspectWordPressContract,
  relabelWordPressSource,
  retireWordPressOthers,
  trimWordPressDemo
} from './wordpress-contract-door.mjs'
import { planWordpressContract } from './plan-wordpress-contract.mjs'
import { doorOps } from './site-ops.mjs'
import { loadSections, loadSystem, loadSystemFrom, readJson, systemIdOf, wordsOf } from './inputs.mjs'
import { chat, keysFromCredentials, meterUsage, providerOf } from './model.mjs'
import { pictureDoor } from './picture.mjs'
import { hasWords } from '../../../design/tracy-design-inspiration/src/host/seed-copy.mjs'
import { runWriters } from './writers.mjs'

/** @param {string[]} argv */
export function parseArgs(argv) {
  const o = {
    platform: '',
    preview: '',
    copy: '',
    pages: [],
    webroot: '.webroot',
    data: '',
    dry: false,
    model: true,
    fresh: false,
    // Finish the stage with the demo words still in the slots nobody could back, instead of
    // refusing to finish. It changes what happens to a REFUSED slot, never what may be written:
    // an unbacked value is still never sent through the contract door.
    keepDemo: false,
    // Hide the quickstart's own demo rows (the ones its reviewed demo-trim profile lists) before
    // the copy is planned. The Claude Cowork plugin decides which rows; this flag only asks.
    trimDemo: false,
    // Which slots a Joomla contract run plans: 'all' (every slot the contract carries) or 'pages'
    // (the routed pages and the modules on them, leaving the demo blog its own words).
    surface: 'all',
    siteKey: null,
    targetSite: null,
    contract: null,
    sessionId: null,
    door: null,
    // Adding a language version is its own run, not a flag on the content run: it installs a
    // package, writes hundreds of rows and must be resumable, none of which a copy pass is.
    addLanguages: []
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i] ?? ''
    if (a === '--platform') o.platform = next()
    else if (a === '--preview') o.preview = next()
    else if (a === '--copy') o.copy = next()
    else if (a === '--webroot') o.webroot = next()
    // The site to seed when it is NOT the one this machine holds: every write then goes through
    // that site's seat door instead of `wp` here (tasks/todo-build-new-site.md §B4). Distinct from
    // `--site-key`, which only NAMES the site in the plan. `--door` is where to reach the door —
    // the lane's own loopback address.
    else if (a === '--target-site') o.targetSite = next()
    // A WordPress QUICKSTART build: the site was restored from a pinned archive and this run fills
    // the slots of the named contract (site name, contact, hero) instead of laying pages out.
    else if (a === '--contract') o.contract = next()
    else if (a === '--door') o.door = next()
    else if (a === '--session') o.sessionId = next()
    else if (a === '--data') o.data = next()
    else if (a === '--system-dir') o.systemDir = next()
    else if (a === '--site-key') o.siteKey = next()
    else if (a === '--add-language') o.addLanguages.push(next())
    else if (a === '--dry') o.dry = true
    else if (a === '--no-model') o.model = false
    else if (a === '--fresh') o.fresh = true
    else if (a === '--keep-demo') o.keepDemo = true
    else if (a === '--trim-demo') o.trimDemo = true
    else if (a === '--surface') o.surface = next()
    else if (a === '--pages') {
      // Spaces or commas: `--pages contact menu` and `--pages contact,menu` mean the same. A
      // comma-joined list read as one slug matches no page and narrows the run to nothing, and it
      // says so nowhere — measured 07/09 on a rerun that quietly left the menu alone.
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--'))
        for (const slug of argv[++i].split(',')) if (slug.trim() !== '') o.pages.push(slug.trim())
    } else throw new Error(`unknown argument ${a}`)
  }
  if (!o.platform) throw new Error('--platform wordpress|joomla is required')
  if (!o.preview) throw new Error('--preview <design-preview.json> is required')
  if (!['all', 'pages'].includes(o.surface)) throw new Error('--surface must be all or pages')
  if (o.pages.length === 0) o.pages = ['all']
  return o
}

/** The lane's command runner. @type {import('./apply-wordpress.mjs').Run} */
export function runOnLane(cwd) {
  return (cmd, args, stdin) =>
    new Promise((resolve) => {
      const child = execFile(
        cmd,
        args,
        { cwd, maxBuffer: 64 * 1024 * 1024, env: process.env },
        (error, stdout, stderr) => {
          resolve({
            code: error && typeof error.code === 'number' ? error.code : error ? 1 : 0,
            stdout: String(stdout),
            stderr: String(stderr)
          })
        }
      )
      if (stdin !== undefined && child.stdin) {
        child.stdin.end(stdin)
      }
    })
}

/**
 * @param {string[]} argv
 * @param {{ env?: Record<string, string | undefined>, cwd?: string, log?: (s: string) => void, run?: import('./apply-wordpress.mjs').Run, fetch?: typeof fetch }} [deps]
 */
/**
 * A cached plan written before the planner learned to skip translated copies may carry their keys
 * in `changes`, `evidence` and `pending`. Carrying those forward would have the apply refuse the
 * whole mapping (or, before that guard, write brief-language copy into another edition), so they
 * are dropped at load. Measured 13/09/2026: a cache from the day before held 311 such pending keys
 * and 129 such changes.
 * @param {any} mapping
 */
function withoutDerived(mapping) {
  if (!mapping || typeof mapping !== 'object') return mapping
  const keep = (obj) => Object.fromEntries(Object.entries(obj ?? {}).filter(([key]) => !isDerived({ key })))
  const cleaned = {
    ...mapping,
    changes: keep(mapping.changes),
    evidence: keep(mapping.evidence),
    pending: (mapping.pending ?? []).filter((key) => !isDerived({ key })),
    ...(mapping.reasons ? { reasons: keep(mapping.reasons) } : {})
  }
  const dropped =
    Object.keys(mapping.changes ?? {}).length -
    Object.keys(cleaned.changes).length +
    (mapping.pending ?? []).length -
    cleaned.pending.length
  return dropped > 0 ? { ...cleaned, cleaned: true } : cleaned
}

/** One apply call through the lane's own site-tools door; the lane holds the viewer, we hold nothing. */
/** The `.webroot` beside the nearest ancestor of `dir` that has one, or null. */
function webrootNear(dir) {
  for (let at = dir; ; at = path.dirname(at)) {
    if (existsSync(path.join(at, '.webroot'))) return path.join(at, '.webroot')
    if (path.dirname(at) === at) return null
  }
}

export function doorVia(door, sessionId) {
  const base = (door ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')
  return async (call) => {
    const res = await fetch(`${base}/api/tracy-site-tools/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ ...call, ...(sessionId ? { sessionId } : {}) })
    })
    if (res.status === 404) return { ok: false, code: 'NO_TOOLS', error: 'this lane has no site tools' }
    return res.json()
  }
}

/** One id for the whole seeding run: what `apply.revert` replays to undo the site in one step. */
function applyId() {
  return `seed-${Date.now().toString(36)}`
}

export async function main(argv, deps = {}) {
  const env = deps.env ?? process.env
  const cwd = deps.cwd ?? process.cwd()
  const log = deps.log ?? ((s) => console.error(`seed: ${s}`))
  const translationDoor = () => {
    if (!o.model) return null
    // The store /ops pushes to is read ALWAYS, not only when the environment is empty: it carries the
    // provider and model each seed job was assigned. The environment still wins on any name it sets.
    const store = path.join(env.DSH_HOME ?? path.join(env.HOME ?? '', '.dsh'), '.credentials.yaml')
    const stored = existsSync(store) ? keysFromCredentials(readFileSync(store, 'utf8')) : {}
    const set = Object.fromEntries(
      Object.entries(env).filter(([, v]) => typeof v === 'string' && v.trim() !== '')
    )
    return providerOf({ ...stored, ...set })
  }
  /**
   * The picture door, found on its own: OpenRouter's key from the environment OR the credential
   * store /ops pushes to, whatever provider the text runs on. 🔒 The text door stops at the first key
   * the environment holds, so on the dev host (`DEEPSEEK_API_KEY` in the environment, the OpenRouter
   * key pushed into the store) no picture model was ever found, 23/09/2026.
   */
  // The picture door is shared with the agent's `media.draw` (picture.mjs); only the seed asks for a model.
  const imageDoor = () => (o.model ? pictureDoor(env) : null)
  const o = parseArgs(argv)
  // 🔒 WHAT A SITE COST HAS TO BE WRITTEN DOWN WHEN IT IS SPENT. On 23/09/2026 the cost of a Business
  // build could only be reconstructed by replaying its prompts: `chat()` returned the provider's
  // usage and nothing kept it. One line per answered call, beside the plan it paid for.
  if (o.preview) {
    const meter = path.join(path.dirname(path.resolve(cwd, o.preview)), 'seed', 'usage.jsonl')
    const stage = o.addLanguages.length ? `language:${o.addLanguages.join(',')}` : 'seed'
    meterUsage((entry) => {
      mkdirSync(path.dirname(meter), { recursive: true })
      appendFileSync(meter, `${JSON.stringify({ at: new Date().toISOString(), stage, ...entry })}\n`, {
        mode: 0o600
      })
    })
  }
  if (o.platform !== 'wordpress' && o.platform !== 'joomla')
    throw new Error(`${o.platform} sites are not seeded yet`)

  // Beside the bundle (`dist/seed.mjs` → `dist/data`), or, run from source, the last build's data.
  const here = path.dirname(fileURLToPath(import.meta.url))
  const dataDir =
    o.data ||
    env.TRACY_SEED_DATA ||
    [path.join(here, 'data'), path.resolve(here, '../dist/data')].find((d) => existsSync(d)) ||
    path.join(here, 'data')
  const preview = readJson(path.resolve(cwd, o.preview))
  const copy = o.copy && existsSync(path.resolve(cwd, o.copy)) ? readJson(path.resolve(cwd, o.copy)) : null
  if (o.platform === 'wordpress' && o.contract) {
    if (!o.targetSite)
      throw new Error('A WordPress quickstart contract requires --target-site and the seat door')
    return seedWordPressContract({
      o,
      cwd,
      log,
      apply: deps.apply ?? doorVia(o.door, o.sessionId),
      preview,
      dataDir,
      deps,
      env
    })
  }
  if (o.platform === 'joomla') {
    if (!o.targetSite)
      throw new Error('Joomla quickstarts require --target-site and the content-contract door')
    if (o.addLanguages.length)
      return addLanguages({
        o,
        cwd,
        log,
        apply: deps.apply ?? doorVia(o.door, o.sessionId),
        deps,
        env,
        dataDir
      })
    if (o.pages.some((page) => page !== 'all'))
      throw new Error(
        'Use a reviewed contract mapping for individual slots; page-scoped seeding is not supported by this profile'
      )
    const apply = deps.apply ?? doorVia(o.door, o.sessionId)
    const inspect = () =>
      apply({ siteKey: o.targetSite, action: 'content.contract', params: { operation: 'inspect' } })
    let state = await inspect()
    if (!state?.ok) throw new Error(doorRefusal(state))
    // A language an earlier build left half made was translated from words this run replaces, and
    // the Claude Cowork plugin refuses new source words while it stands (0.16.12; j-ee6vsk, 23/09/2026: a second
    // Build died here on "Cannot replace a content-only baseline" — the older Claude Cowork plugin's wording).
    // Take it back; `language` derives it again from the new copy.
    if (state.job?.locale && !o.dry) {
      const taken = await apply({
        siteKey: o.targetSite,
        action: 'content.contract',
        params: { operation: 'multilingual.revert', locale: state.job.locale }
      })
      if (!taken?.ok) throw new Error(doorRefusal(taken))
      log(`contract: took back the ${state.job.locale} language an earlier build left at ${state.job.phase}`)
      state = await inspect()
      if (!state?.ok) throw new Error(doorRefusal(state))
    }
    const seedDir = path.resolve(path.dirname(path.resolve(cwd, o.preview)), 'seed')
    let demoTrim
    if (o.trimDemo && !o.dry) {
      demoTrim = await trimJoomlaDemo({ apply, siteKey: o.targetSite })
      mkdirSync(seedDir, { recursive: true })
      writeFileSync(path.join(seedDir, 'demo-trim.json'), JSON.stringify(demoTrim), { mode: 0o600 })
      log(
        demoTrim.status === 'hidden'
          ? `contract: ${demoTrim.hidden} demo row(s) hidden`
          : demoTrim.status === 'skipped'
            ? `contract: demo left in place — ${demoTrim.reason}`
            : 'contract: this quickstart lists no demo rows to hide'
      )
      // Hiding rows moves the revision the copy is written against, so the plan reads the site again.
      if (demoTrim.status === 'hidden' && demoTrim.hidden > 0) {
        state = await inspect()
        if (!state?.ok) throw new Error(doorRefusal(state))
      }
    }
    const mappingFile = path.join(seedDir, 'contract-mapping.json')
    const briefHash = createHash('sha256')
      .update(JSON.stringify({ site: preview.site, target: o.targetSite, contract: state.contract }))
      .digest('hex')
    const cached = !o.fresh && existsSync(mappingFile) ? withoutDerived(readJson(mappingFile)) : null
    if (cached && cached.cleaned) {
      // Write the cleaned plan back, so the file a person reads (and the job's required list) says
      // the same thing the run acted on. Measured 13/09: the file kept 539 pending, 311 of them
      // translated keys, while the stage correctly reported 228.
      delete cached.cleaned
      writeFileSync(mappingFile, JSON.stringify(cached, null, 2), { mode: 0o600 })
      log('contract: dropped translated keys from a plan cached before the derived-slot rule')
    }
    let mapping =
      copy && Object.hasOwn(copy, 'contract') ? copy : cached?.briefHash === briefHash ? cached : null

    /**
     * 🔒 THE SITE IS THE REFEREE, ON BOTH PATHS. `inspect` just ran above, so `state.slots` carries the
     * latest `current`. Reconciling here means a slot an agent just filled through the contract door
     * is recorded **at once**, even when the brief did not change by one character — the case the
     * whole `carried` block below never reaches. See `reconcile-site.mjs` for the three sources and the rule.
     */
    let onSite = 0
    const settle = (plan, applied) => {
      const r = reconcileWithSite({ plan, slots: state.slots, applied })
      onSite = r.onSite.length
      if (r.filledBySite.length)
        log(`contract: ${r.filledBySite.length} slot(s) already answered on the site; not asking again`)
      if (r.alreadyApplied.length)
        log(`contract: ${r.alreadyApplied.length} slot(s) this build already wrote; settled`)
      if (r.refusedOverwrite.length)
        log(
          `contract: ${r.refusedOverwrite.length} slot(s) edited on the site since this plan; keeping the site's words`
        )
      return r.plan
    }

    // CACHE HIT path: the brief did not change, but the site may have.
    if (mapping && mapping !== copy) {
      mapping = settle(mapping, mapping.changes)
      // Reconciled slot by slot against the inspect above, so that inspect's revision is the one
      // the plan now holds. Kept at the cached value, every Retry after a refused apply answered
      // "Content changed; inspect again" — the site had moved, the plan never did (23/09/2026,
      // j-se6mii).
      mapping.revision = state.revision
    }

    // 🔒 AN ANSWER MUST NOT DISCARD THE ANSWERS BEFORE IT. The brief hash is the whole cache key, so
    // every follow-up the customer answered used to re-plan all 1113 slots and re-roll the model's
    // variance across them — measured 12/09 by tch-90 on two Airbnb runs of the same site: 546
    // pending from an 880-character brief, 540 from a 2713-character one, and `article-2.0..5`
    // FILLED by the short brief and PENDING by the long one. More facts, worse result, because
    // nothing accumulated. A cached plan for the same contract and site is now a starting point:
    // its filled slots are kept and only the ones still pending are asked about again. `--fresh`
    // is how a caller says it wants the whole thing written from scratch.
    let carried =
      mapping === null &&
      cached?.contract === state.contract &&
      Array.isArray(cached.pending) &&
      cached.pending.length
        ? cached
        : null
    if (carried) {
      // 🔒 A RETRACTION IS NOT AN ADDITION, AND ONLY ONE KIND OF SLOT CAN TELL. An evidence-required
      // value is a verbatim excerpt of the brief, so "the customer took this fact back" is decidable:
      // the excerpt is no longer in the brief. Those slots go back into the asked set; every other
      // carried slot stays, because losing five hundred correct ones to gain a correction is the
      // behaviour this cache exists to remove. `--fresh` rewrites everything. (tch-90's rule.)
      const facts = briefFacts(preview.site)
      const withdrawn = Object.entries(carried.evidence ?? {})
        .filter(([, value]) => !facts.some((fact) => fact.includes(value)))
        .map(([key]) => key)
      if (withdrawn.length) {
        const changes = { ...carried.changes }
        const evidence = { ...carried.evidence }
        for (const key of withdrawn) {
          delete changes[key]
          delete evidence[key]
        }
        carried = { ...carried, changes, evidence, pending: [...carried.pending, ...withdrawn] }
        log(`contract: ${withdrawn.length} slot(s) no longer supported by the brief; asking again`)
      }
    }
    if (!mapping) {
      const door = translationDoor()
      if (!door && !deps.generate)
        throw new Error('Content mapping needs a configured model or a reviewed contract copy file')
      mapping = await planJoomlaContract({
        state,
        site: preview.site,
        surface: o.surface,
        trimmed: demoTrim?.status === 'hidden',
        // Where the shipped contracts live: the plan reads entity languages from the content map,
        // because `content.contract inspect` does not answer with entities.
        dataDir,
        ...(carried ? { only: carried.pending } : {}),
        generate:
          deps.generate ??
          (async ({ system, input }) => {
            const result = await (deps.chat ?? chat)(
              door,
              {
                model: door.textModel,
                messages: [
                  { role: 'system', content: system },
                  { role: 'user', content: JSON.stringify(input) }
                ],
                maxTokens: 8192
              },
              deps.fetch
            )
            return result.text
          })
      })
      if (carried) {
        const kept = Object.keys(carried.changes ?? {}).length
        mapping = {
          ...mapping,
          changes: { ...carried.changes, ...mapping.changes },
          evidence: { ...carried.evidence, ...mapping.evidence },
          invented: [...new Set([...(carried.invented ?? []), ...(mapping.invented ?? [])])]
        }
        log(`contract: ${kept} slot(s) kept from the previous brief; ${carried.pending.length} asked again`)
      }
      // REPLAN path: the same rule, one source of truth.
      mapping = settle(mapping, carried?.changes ?? {})
      // A plan with a batch the model never answered readably, or whose answer was cut at the reply cap, is not this brief's
      // plan yet: left unstamped, the next run asks again instead of taking the template's words for the answer (the slots
      // already written are carried).
      if (!Object.values(mapping.reasons ?? {}).some((r) => r === 'model-unreadable' || r === 'truncated'))
        mapping.briefHash = briefHash
      else log('contract: some batches had no readable answer; this plan is not kept for the next run')
      mkdirSync(seedDir, { recursive: true })
      writeFileSync(mappingFile, JSON.stringify(mapping, null, 2), { mode: 0o600 })
    }
    // 🔒 SWEEP THE PLAN AGAINST THE SITE'S OWN RULES BEFORE SENDING IT. An apply is one
    // transaction: the Claude Cowork plugin refuses the batch on the first value it will not take, so one
    // `<400ms` in a metrics strip fails a seed that planned thousands of slots — and a cached plan
    // replays that same value on every retry. Measured 16/09/2026 on ja-kinetic (`seed: Markup and
    // control characters are not content: module-194.15`, twice). What is swept here is refused,
    // never rewritten: the slot keeps the demo words and is reported like any other pending key.
    {
      const known = new Map((state.slots ?? []).map((slot) => [slot.key, slot]))
      const refused = Object.entries(mapping.changes ?? {}).filter(([key, value]) =>
        coworkWouldRefuse(known.get(key) ?? {}, String(value))
      )
      if (refused.length) {
        const changes = { ...mapping.changes },
          evidence = { ...mapping.evidence },
          reasons = { ...mapping.reasons }
        for (const [key, value] of refused) {
          reasons[key] = coworkWouldRefuse(known.get(key) ?? {}, String(value))
          delete changes[key]
          delete evidence[key]
        }
        mapping = {
          ...mapping,
          changes,
          evidence,
          reasons,
          pending: [...(mapping.pending ?? []), ...refused.map(([key]) => key)]
        }
        writeFileSync(mappingFile, JSON.stringify(mapping, null, 2), { mode: 0o600 })
        log(`contract: ${refused.length} planned value(s) the site would refuse were dropped`)
      }
    }
    // 🔒 `--keep-demo` MOVES THE REFUSAL, IT DOES NOT LIFT IT. A pending slot is one no customer
    // fact stands behind, and it stays unwritten either way — the door never sees it. What changes
    // is who waits: by default the stage stops and asks, and with this flag it finishes and hands
    // the list back as `kept`, so the site is usable and the Quality tab can say which lines are
    // still the vendor's demo words. Measured 16/09/2026 on ja-kinetic: 727 of 4,662 slots require
    // evidence, so an unattended build stops every time without this.
    if (o.keepDemo && mapping.pending?.length) {
      mapping = { ...mapping, kept: mapping.pending, pending: [] }
      writeFileSync(mappingFile, JSON.stringify(mapping, null, 2), { mode: 0o600 })
      log(`contract: ${mapping.kept.length} slot(s) keep their demo words; nothing unbacked was written`)
    }
    if (mapping.pending?.length) throw new Error(`CONTENT_REQUIRED: ${mapping.pending.join(', ')}`)
    // The hero picture: drawn, uploaded, and only then named in its slot (why only the hero, and the
    // one path a sealed site accepts: `hero-images.mjs`). Never on a dry run — it spends and uploads.
    // Before "nothing to write" below: a site whose words landed before pictures existed still gets one.
    if (!o.dry) {
      const heroes = await drawHeroes({
        state,
        site: preview.site,
        dataDir,
        door: imageDoor(),
        cacheDir: path.join(seedDir, 'hero'),
        // The site's webroot, read-only beside its build files (`/site/<label>/.webroot` in tracy-dsh):
        // the first ancestor of the preview that holds one. Where the demo picture's shape is read.
        webroot: webrootNear(path.dirname(path.resolve(cwd, o.preview))),
        apply,
        siteKey: o.targetSite,
        log,
        ...(deps.chat ? { chat: deps.chat } : {}),
        ...(deps.fetch ? { fetch: deps.fetch } : {})
      })
      if (Object.keys(heroes).length) {
        mapping = { ...mapping, changes: { ...mapping.changes, ...heroes } }
        mkdirSync(seedDir, { recursive: true })
        writeFileSync(mappingFile, JSON.stringify(mapping, null, 2), { mode: 0o600 })
        log(`hero: ${Object.keys(heroes).length} hero slot(s) carry a picture drawn for this site`)
      }
    }
    // 🔒 NOTHING LEFT TO WRITE BECAUSE IT IS ALREADY WRITTEN IS A FINISHED SEED, NOT AN EMPTY ONE.
    // An apply can land and still lose its answer — measured 23/09/2026 on `j-h0n2f4`: PHP hit its
    // 30-second limit after the writes, the door said 500, and every rerun of the same plan found
    // all 83 values on the site, dropped them, and failed with "no customer content". The site is
    // the referee (`reconcile-site.mjs`), so a plan it has fully absorbed ends here, with no call.
    if (Object.keys(mapping.changes ?? {}).length === 0 && onSite > 0) {
      log(`contract: all ${onSite} planned value(s) are already on the site; nothing to write`)
      return {
        plan: mapping,
        applied: { ok: true, unchanged: true, alreadyOnSite: onSite },
        ...(mapping.kept?.length ? { kept: mapping.kept } : {}),
        ...(demoTrim ? { demoTrim } : {})
      }
    }
    const applied = await applyJoomlaContract({ apply, siteKey: o.targetSite, mapping, dry: o.dry })
    if (!o.dry) {
      mkdirSync(seedDir, { recursive: true })
      writeFileSync(path.join(seedDir, 'apply.json'), JSON.stringify({ applyId: applied.applyId, applied }), {
        mode: 0o600
      })
    }
    return {
      plan: mapping,
      applied,
      ...(mapping.kept?.length ? { kept: mapping.kept } : {}),
      ...(demoTrim ? { demoTrim } : {})
    }
  }
  const id = systemIdOf(preview)
  // A brand is drawn from the site's own folder (`--system-dir <site>/Brand/<host>`), the library
  // from the seeder's data; a brand id with no folder named is the one mistake worth a sentence.
  const system = o.systemDir
    ? loadSystemFrom(path.resolve(cwd, o.systemDir), {
        id,
        name: typeof preview.chosen?.name === 'string' ? preview.chosen.name : id.replace(/^brand:/, ''),
        category: id.startsWith('brand:') ? 'Your brand' : ''
      })
    : id.startsWith('brand:')
      ? (() => {
          throw new Error(`${id} is a brand: pass --system-dir <site>/Brand/<host> so the seeder can read it`)
        })()
      : loadSystem(dataDir, id)
  const sections = loadSections(dataDir)
  const words = wordsOf(preview.site)
  if (!hasWords(words) && !(preview.site?.name && preview.site?.headline)) {
    throw new Error(
      'nothing to seed from: design-preview.json has no site words yet (answer the Build tab first)'
    )
  }

  // What the model wrote, kept next to the preview (`docs/agents/seed/model.json`, covers under
  // `covers/`): the agent reads it, and a rerun — tracy-site-build reruns `seed` after every copy
  // edit — reuses it instead of paying for the same posts again. `--fresh` asks the model anew.
  // ⚠ BESIDE THE PREVIEW, not beside the process. Keyed to `cwd` this cache is shared by every
  // site the seeder is ever run for: a build for a souvenir shop reused six posts written for a
  // bakery, and reported it as `reusing 6 posts … (--fresh to ask again)` — a true sentence about
  // the wrong site (measured 08/09). The preview file names the site; the cache belongs with it.
  const seedDir = path.resolve(path.dirname(path.resolve(cwd, o.preview)), 'seed')
  const modelFile = path.join(seedDir, 'model.json')
  let turns = { posts: [], images: new Map(), sectionsCopy: null, warnings: [] }
  if (o.model && !o.fresh && existsSync(modelFile)) {
    const kept = readJson(modelFile)
    turns = {
      posts: Array.isArray(kept.posts) ? kept.posts : [],
      images: new Map(),
      sectionsCopy: kept.sections ?? null,
      warnings: []
    }
    for (const post of turns.posts) {
      const file = ['png', 'jpg', 'webp']
        .map((ext) => path.join(seedDir, 'covers', `${post.slug}.${ext}`))
        .find((f) => existsSync(f))
      if (file)
        turns.images.set(post.slug, {
          mime: file.endsWith('.jpg') ? 'image/jpeg' : file.endsWith('.webp') ? 'image/webp' : 'image/png',
          bytes: readFileSync(file)
        })
    }
    log(
      `model: reusing ${turns.posts.length} posts and ${turns.images.size} covers from ${path.relative(cwd, modelFile)} (--fresh to ask again)`
    )
  } else if (o.model) {
    // The key: the environment first, then dsh's credential store of this lane.
    let keyed = env
    if (!env.OPENROUTER_API_KEY && !env.DEEPSEEK_API_KEY) {
      const store = path.join(env.DSH_HOME ?? path.join(env.HOME ?? '', '.dsh'), '.credentials.yaml')
      if (existsSync(store)) keyed = { ...keysFromCredentials(readFileSync(store, 'utf8')), ...env }
    }
    // 🔒 THE CACHE IS WRITTEN AS THE WORK LANDS, not once at the end. It used to be written after
    // all eight calls returned, so a run that died in the last turn — or hit the build stage's
    // four-minute wall — threw away six cover images it had already paid for, ~$0.03 each. Each
    // cover becomes a file the moment it arrives and the posts are recorded the moment they exist;
    // the read side already tolerates a partial cover set, so a rerun picks up what survived.
    /** @type {Map<string, { mime: string, bytes: Buffer }>} */
    const landed = new Map()
    let kept = []
    const record = (posts, sectionsCopy, warnings) => {
      if (o.dry) return
      mkdirSync(seedDir, { recursive: true })
      writeFileSync(
        modelFile,
        `${JSON.stringify({ schemaVersion: 'tracy-seed-model/v1', at: new Date().toISOString(), posts, covers: [...landed.keys()], sections: sectionsCopy, warnings }, null, 2)}\n`
      )
    }
    turns = await runWriters({
      door: providerOf(keyed),
      words,
      sections,
      chat,
      log,
      onPosts: (posts) => {
        kept = posts
        record(posts, null, [])
      },
      onCover: (slug, im) => {
        landed.set(slug, im)
        if (o.dry) return
        mkdirSync(path.join(seedDir, 'covers'), { recursive: true })
        const ext = im.mime.includes('jpeg') ? 'jpg' : im.mime.includes('webp') ? 'webp' : 'png'
        writeFileSync(path.join(seedDir, 'covers', `${slug}.${ext}`), im.bytes)
        record(kept, null, [])
      }
    })
    for (const w of turns.warnings) log(w)
    record(turns.posts, turns.sectionsCopy, turns.warnings)
  }

  /**
   * The languages the customer chose, and the copy written for each. The first language's words are
   * `<id>.json` — the file this seeder has always read — and every extra one is `<id>.<lang>.json`
   * beside it (`copyFileName`). A language whose file has not been written is skipped with a word,
   * never guessed at.
   */
  const languages = Array.isArray(preview.site?.languages) ? preview.site.languages.map(String) : []
  const extraCopies = []
  for (const lang of languages.slice(1)) {
    const file = path.resolve(cwd, path.dirname(o.copy), copyFileName(systemIdOf(preview), lang))
    if (existsSync(file)) extraCopies.push({ lang, copy: readJson(file) })
    else throw new Error(`No copy written in requested language ${lang}`)
  }

  const r = buildSeedPlan({
    system: id,
    systemName: system.name,
    cms: o.platform,
    site: preview.site,
    pages: preview.pages,
    // The Pages answer of the Build form, as `siteFromAnswers` wrote it. Absent on a design system
    // stand, which is why an absent list means every page rather than none.
    wanted: preview.site?.wanted,
    copy,
    siteKey: o.siteKey,
    fixtureHtml: system.fixtureHtml,
    fixtureSlots: system.fixtureSlots,
    landingHtml: system.landingHtml,
    landingSlots: system.landingSlots,
    sections,
    sectionsCopy: turns.sectionsCopy,
    posts: turns.posts
  })
  const translations = []
  for (const { lang, copy: theirs } of extraCopies) {
    const t = buildSeedPlan({
      system: id,
      systemName: system.name,
      cms: o.platform,
      site: preview.site,
      pages: preview.pages,
      wanted: preview.site?.wanted,
      copy: theirs,
      siteKey: o.siteKey,
      fixtureHtml: system.fixtureHtml,
      fixtureSlots: system.fixtureSlots,
      landingHtml: system.landingHtml,
      landingSlots: system.landingSlots,
      sections,
      sectionsCopy: turns.sectionsCopy,
      posts: turns.posts
    })
    if (t.ok) translations.push({ lang, plan: t.plan })
    else throw new Error(`The ${lang} plan could not be built (${t.error})`)
  }

  if (!r.ok)
    throw new Error(
      r.error === 'NO_WORDS' ? 'nothing to seed from: the site has no name or headline yet' : r.error
    )
  const { plan } = r

  if (o.dry) {
    process.stdout.write(
      `${JSON.stringify({ ...plan, pages: plan.pages.map((p) => ({ ...p, body: `${p.body.length} chars` })), covers: [...turns.images.keys()] }, null, 2)}\n`
    )
    return { plan, applied: null }
  }

  const run = deps.run ?? runOnLane(cwd)
  // One id for the whole run, whichever writer takes it: `apply.revert` undoes the seeding in a
  // single step, and two ids would make that two steps a customer has to know to take.
  const seedId = applyId()
  const applied = await applyWordPress({
    plan,
    run,
    webroot: o.webroot,
    pages: o.pages,
    images: turns.images,
    languages,
    translations,
    ...(o.targetSite
      ? { ops: doorOps({ apply: doorVia(o.door, o.sessionId), siteKey: o.targetSite, applyId: seedId }) }
      : {})
  })
  for (const w of applied.warnings ?? []) log(w)

  // What was written, for the next run and for the agent's undo story.
  const record = path.join(seedDir, 'apply.json')
  mkdirSync(path.dirname(record), { recursive: true })
  writeFileSync(
    record,
    `${JSON.stringify({ schemaVersion: 'tracy-seed-apply/v1', at: new Date().toISOString(), platform: o.platform, system: id, pages: o.pages, applyId: seedId, applied, posts: plan.posts.map((p) => ({ slug: p.slug, title: p.title, imagePrompt: p.imagePrompt })) }, null, 2)}\n`
  )
  log(`seeded ${plan.pages.length} pages, ${plan.posts.length} posts on ${o.platform} (${id})`)
  return { plan, applied }
}

/**
 * Fill the slots of a restored WordPress quickstart from the customer's answers, and the rest from
 * their brief.
 *
 * TWO ROADS, AND THEY DO NOT OVERLAP. A slot that names an `input` is the customer's own words and
 * is written exactly (`planContractWrites`). A slot that names none used to be skipped — "no
 * input; the quickstart keeps its own words" — which with five answers meant a site kept
 * everything. Measured 22/09/2026 on `site-cpdt5z`: 779 published pages and posts, 367 still
 * naming the demo brand, ZERO carrying the customer's name, while the title (an option with an
 * input) had changed correctly. Those slots now go to the model, the way a Joomla contract's do.
 * @param {{ o: ReturnType<typeof parseArgs>, cwd: string, log: (s: string) => void, apply: any, preview: any, dataDir: string, deps?: any, env?: any }} deps
 */
async function seedWordPressContract({ o, cwd, log, apply, preview, dataDir, deps = {}, env = process.env }) {
  const { manifest, contentMap, editions } = loadContract(dataDir, /** @type {string} */ (o.contract))
  const site = preview.site ?? {}
  const siteKey = /** @type {string} */ (o.targetSite)
  const inputs = inputsFromSite(site)
  const { writes, skipped: unplanned } = planContractWrites(contentMap, inputs)
  // Bound (plugin 0.12.0+, site bound at provision) or not: decides the write road below.
  const seal = o.dry
    ? { supported: false, bound: false, state: null }
    : await inspectWordPressContract(apply, siteKey)
  if (seal.bound)
    log(`contract ${manifest.id}: the site is bound (revision ${String(seal.state.revision).slice(0, 12)})`)
  else if (seal.supported)
    log(`contract ${manifest.id}: the site is not bound — writing through content.update`)
  else if (!o.dry)
    log(
      `contract ${manifest.id}: this Claude Cowork plugin has no contract door — writing through content.update`
    )
  // Demo posts first, so a listing the customer opens right after the build shows no vendor news.
  if (seal.bound && o.trimDemo) {
    const trim = await trimWordPressDemo({ apply, siteKey, log })
    if (trim.status === 'none')
      log('demo trim: this Claude Cowork plugin has no demoTrim operation; demo posts stay')
    else if (!trim.alreadyTrimmed && trim.hidden > 0) {
      // The trim moved rows the revision counts: inspect again before writing.
      const again = await inspectWordPressContract(apply, siteKey)
      seal.state = again.state
    }
  }
  // Which editions this build writes: the source always (D.2), plus every chosen language the
  // archive ships. A language it does not ship is said, not skipped in silence.
  const passes = editions
    ? chosenEditions(editions, Array.isArray(site.languages) ? site.languages : [])
    : { editions: [{ slug: 'en', tag: 'en-us', source: true }], unknown: [] }
  for (const tag of passes.unknown)
    log(`contract ${manifest.id}: the archive ships no ${tag} edition — that language is not written`)
  const ops0 = doorOps({ apply, siteKey, applyId: 'read-only' })
  // The brief's road, for everything the answers do not name. `--no-model` and a deployment with no
  // key both end here with the demo words kept and the reason said — never a stalled build.
  const written = new Set(writes.map((w) => w.slot))
  const door = translationDoorFor(env, o)
  const model =
    deps.generate ??
    (door
      ? async ({ system, input }) => {
          const result = await (deps.chat ?? chat)(
            door,
            {
              model: door.textModel,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: JSON.stringify(input) }
              ],
              maxTokens: 8192
            },
            deps.fetch
          )
          return result.text
        }
      : null)
  let brief = { changes: {}, pending: [], reasons: {}, planned: 0, askedAgain: 0 }
  // The answers' own slots (name, tagline, hero) go into EVERY chosen edition: a name is a name in
  // every language. `writes` holds the source pass; copies are re-addressed per edition below.
  const inputWrites = writes.slice()
  for (const pass of passes.editions) {
    // Each pass plans in the edition's language, with the edition's own words as samples.
    let map = contentMap
    if (!pass.source) {
      const view = await editionContentMap(contentMap, editions, pass.slug, (id) => ops0.readContent(id))
      for (const m of view.missing)
        log(`contract ${manifest.id}: ${pass.slug} edition lacks ${m}; that slot keeps the shipped words`)
      map = view.contentMap
      for (const w of inputWrites) {
        const entity = map.entities.find((e) => e.key === w.entity.key)
        if (entity && w.target.block) writes.push({ ...w, entity, locale: pass.slug })
      }
    }
    if (!model) continue
    const siteForPass = { ...site, languages: [pass.tag] }
    const planned = await planWordpressContract({
      contentMap: map,
      site: siteForPass,
      generate: model,
      hasInput: written
    })
    for (const [key, value] of Object.entries(planned.changes)) {
      const slot = map.slots.find((s) => s.key === key)
      const entity = map.entities.find((e) => e.key === slot?.entity)
      if (slot && entity)
        writes.push({
          slot: key,
          entity,
          target: slot.target,
          value,
          ...(pass.source ? {} : { locale: pass.slug })
        })
    }
    if (pass.source) brief = planned
    else {
      brief.pending.push(...planned.pending.map((k) => `${pass.slug}::${k}`))
      for (const [k, r] of Object.entries(planned.reasons)) brief.reasons[`${pass.slug}::${k}`] = r
      brief.planned += planned.planned
      brief.askedAgain += planned.askedAgain
    }
    log(
      `contract ${manifest.id} (${pass.slug} · ${pass.tag}): the brief filled ${Object.keys(planned.changes).length} of ${planned.planned} slot(s) the answers do not name${planned.askedAgain ? ` (${planned.askedAgain} call(s) asked again: an answer in another language than its slots)` : ''}`
    )
  }
  if (!model)
    log(`contract ${manifest.id}: no model key — slots the answers do not name keep the quickstart's words`)
  const seedId = applyId()
  if (o.dry) {
    process.stdout.write(
      `${JSON.stringify({ contract: manifest.id, writes, skipped: unplanned }, null, 2)}\n`
    )
    return { plan: null, applied: null }
  }
  const ops = doorOps({ apply, siteKey, applyId: seedId })
  let applied
  let receipt = null
  if (seal.bound) {
    const through = await applyWordPressThroughContract({
      apply,
      siteKey,
      state: seal.state,
      writes,
      source: passes.editions[0].slug,
      slots: new Map(contentMap.slots.map((sl) => [sl.key, sl])),
      log
    })
    applied = { written: through.written, skipped: through.skipped }
    receipt = through.receipt
    const seedDir0 = path.resolve(path.dirname(path.resolve(cwd, o.preview)), 'seed')
    mkdirSync(seedDir0, { recursive: true })
    writeFileSync(
      path.join(seedDir0, 'contract-mapping.json'),
      `${JSON.stringify({ schemaVersion: 'tracy-contract-mapping/wordpress/v1', contract: manifest.id, revision: seal.state.revision, changes: Object.fromEntries(writes.map((w) => [w.locale && w.locale !== passes.editions[0].slug ? `${w.locale}::${w.slot}` : w.slot, w.value])), pending: brief.pending, receipt }, null, 2)}\n`
    )
  } else applied = await applyWordPressContract({ ops, writes, log })
  // Wave D: the site speaks the languages the customer chose, and only those. On a bound site the
  // other shipped editions are hidden (plugin 0.13.0+; an older Claude Cowork plugin leaves them and says so),
  // and an English variant other than en-US relabels the source edition (0.12.1+).
  let languagesNote = null
  if (seal.bound) {
    const keep = [passes.editions[0].tag, ...passes.editions.slice(1).map((e) => e.tag)]
    const retired = await retireWordPressOthers({
      apply,
      siteKey,
      keep,
      onRecord: seal.state?.multilingual?.applyId ?? null,
      log
    })
    if (retired.status === 'none')
      log(
        'languages: this Claude Cowork plugin cannot hide the other editions the quickstart ships; they stay live'
      )
    if (retired.status === 'single')
      log(
        'languages: this site has one language (no translation plugin), so there is no other edition to hide'
      )
    const relabel = await relabelWordPressSource({
      apply,
      siteKey,
      languages: Array.isArray(site.languages) ? site.languages : [],
      log
    })
    if (relabel.status === 'single')
      log(
        'languages: this site has one language, so its English keeps its locale whatever variant was chosen'
      )
    // 🔒 THE SOURCE STAYS IN FRONT (decision 21, measured on dev 25/09 on `wpbgd894n`): making the chosen
    // language the default (`siteLanguage.set`) turns every URL the archive baked into its navigation
    // blocks (`/careers/`, `/vi/news/`) into a 404 and leaves `content.contract inspect` resolving 0
    // rows in the new default's request context. Until the Claude Cowork plugin rewrites those URLs and resolves
    // entities across languages, `/` speaks the source and the chosen edition lives at `/<slug>/`.
    // The door stays wired (`setWordPressSiteLanguage`) for the day it is safe to call.
    const siteLanguage = {
      status: 'none',
      language: passes.editions[0].slug,
      kept: 'source in front (decision 21)'
    }
    log(
      'site language: the source edition stays in front; the chosen language lives under its own prefix (decision 21)'
    )
    languagesNote = { keep, retired, relabel, siteLanguage }
  }
  const skipped = [
    ...unplanned.filter((u) => brief.changes[u.slot] === undefined),
    ...brief.pending.map((slot) => ({ slot, reason: brief.reasons[slot] ?? 'not written' })),
    ...applied.skipped
  ]
  for (const s of skipped) log(`contract: ${s.slot} not written — ${s.reason}`)
  const seedDir = path.resolve(path.dirname(path.resolve(cwd, o.preview)), 'seed')
  const record = path.join(seedDir, 'apply.json')
  mkdirSync(seedDir, { recursive: true })
  writeFileSync(
    record,
    `${JSON.stringify({ schemaVersion: 'tracy-seed-apply/v1', at: new Date().toISOString(), platform: 'wordpress', contract: manifest.id, applyId: receipt?.applyId ?? seedId, bound: seal.bound, receipt, editions: passes.editions.map((e) => e.slug), languages: languagesNote, applied: { written: applied.written, skipped } }, null, 2)}\n`
  )
  log(`contract ${manifest.id}: ${applied.written.length} slot(s) written, ${skipped.length} kept as shipped`)
  return { plan: null, applied }
}

/**
 * Give a bound Joomla quickstart one more language version, from the words it has right now.
 *
 * 🔒 THE PLAN IS ASKED FOR FIRST, AND IT IS THE SOURCE OF THE STRINGS. Nothing here reads the
 * design preview's copy or the customer brief: the Claude Cowork plugin hands back the CURRENT value of every
 * slot on the site, which is what makes a translation a translation and not a second draft that
 * quietly undoes the edits made since the build.
 *
 * 🔒 THE CLAUDE COWORK PLUGIN'S COMPLAINTS ARE ACTED ON, NOT REPORTED. It refuses a translation that dropped a
 * price, ran past a slot's length or lost a URL — one message per slot — and those slots are asked
 * for again with the complaint attached, once. A second refusal stops the run and names them,
 * because a model that cannot keep a figure after being told to is not going to on the third try.
 */
async function addLanguages({ o, cwd, log, apply, deps, env, dataDir }) {
  const previewDir = path.dirname(path.resolve(cwd, o.preview))
  const out = []
  for (const requested of o.addLanguages) {
    const locale = normaliseLocale(requested)
    const name = LANGUAGE_CATALOG.packs[locale]?.name ?? locale
    let planResult = await apply({
      siteKey: o.targetSite,
      action: 'content.contract',
      params: { operation: 'multilingual.plan', locale }
    })
    if (!planResult?.ok) {
      // 🔒 REFUSE BEFORE THE FIRST WRITE, AND SAY WHY IN THE CUSTOMER'S TERMS. A site whose Tracy
      // component predates this feature answers the plan with `Unknown contract operation` — three
      // words that name neither the site, the language, nor the fact that nothing has changed. The
      // release supports NEW sites only: there is no binding migration for an older component, so
      // this is where an unsupported site stops, not half-way through a language.
      const said = String(planResult?.message || planResult?.error || '')
      // Two shapes, both measured on real Claude Cowork plugins: one old enough to lack the contract door at
      // all answers `unknown action: content.contract` (0.13.0), and one that has the door but not
      // the multilingual operations answers `Unknown contract operation` (0.14.0). A refusal that
      // matched only the second handed the customer the first verbatim.
      throw new Error(
        /unknown contract operation|unknown action: *content\.contract/i.test(said)
          ? `This site cannot have a language added yet: its Tracy component does not offer the multilingual operations, so ${locale} was refused before anything was written. Update the component on ${o.targetSite} first; the site is unchanged.`
          : said || 'The multilingual plan is unavailable'
      )
    }
    log(
      `language: ${locale} plans ${Object.entries(planResult.creates)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ')}` + ` from ${planResult.slots.filter((s) => s.type === 'text').length} strings`
    )
    const cacheFile = path.join(previewDir, 'seed', `translations-${locale}.json`)
    const cache = !o.fresh && existsSync(cacheFile) ? readJson(cacheFile) : {}
    // Seed the cache with what the package already translated for its own copy. The planner's key
    // holds the source string, so a slot the customer left as shipped hits and costs nothing, and a
    // slot they rewrote misses and goes to the model — the two cases separate themselves. A cache
    // from an earlier run of THIS site wins over the package: it may hold a string the site refused
    // once and the model then rephrased.
    const shipped = loadShippedTranslations(dataDir, planResult.contract, locale)
    let fromPackage = 0
    for (const [key, text] of shipped) {
      if (key in cache) continue
      cache[key] = text
      fromPackage += 1
    }
    if (shipped.size)
      log(
        `language: ${locale} has ${shipped.size} strings shipped with ${planResult.contract}; ${fromPackage} enter the cache`
      )
    const store = (key, value) => {
      cache[key] = value
      mkdirSync(path.dirname(cacheFile), { recursive: true })
      writeFileSync(cacheFile, JSON.stringify(cache, null, 2), { mode: 0o600 })
    }
    const door = translationDoorFor(env, o)
    const translate = deps.translate ?? modelTranslator(door, deps)
    let modelCalls = 0
    const countingTranslate = async (items, ...rest) => {
      modelCalls += items.length
      return translate(items, ...rest)
    }
    let { translations } = await planLanguageTranslation({
      plan: planResult,
      languageName: name,
      translate: countingTranslate,
      read: (key) => cache[key],
      save: store,
      log
    })
    const textSlots = planResult.slots.filter(
      (s) => s.type === 'text' && String(s.source).trim() !== ''
    ).length
    log(
      `language: ${locale} ${textSlots - modelCalls} strings from the package, ${modelCalls} from the model`
    )
    let takenBack = false
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const done = await addJoomlaLanguage({
          apply,
          siteKey: o.targetSite,
          locale,
          translations,
          expectedRevision: planResult.revision,
          contract: planResult.contract,
          log
        })
        // 🔒 THE RECEIPT MUST LAND WHERE THE STAGE LOOKS. `previewDir` is already
        // `<inputs>/docs/agents` (the preview is `<inputs>/docs/agents/design-preview.json`), so the
        // `'..'` here climbed to `<inputs>/docs` and wrote `docs/build/languages/<locale>.json`,
        // while `languageRecordFor()` reads `docs/agents/build/languages/<locale>.json`. The two
        // paths never met: the stage finished `done` with no `lastApplyId`, so the card had no undo
        // to offer and a resumed run had nothing to read.
        const record = path.join(previewDir, 'build', 'languages', `${locale}.json`)
        mkdirSync(path.dirname(record), { recursive: true })
        writeFileSync(
          record,
          `${JSON.stringify({ schemaVersion: 'tracy-seed-language/v1', at: new Date().toISOString(), locale, applyId: done.applyId, verified: done.verified }, null, 2)}\n`
        )
        out.push({ locale, applyId: done.applyId })
        break
      } catch (error) {
        // 🔒 A JOB OF THIS LANGUAGE LEFT IN FLIGHT WITH OTHER WORDS IS TAKEN BACK, ONCE. Its request id
        // is the hash of its translations, so a retry whose words moved by one string names another
        // job and is refused while the old one stands — measured 23/09/2026 on `j-ee6vsk`, on every
        // retry. `multilingual.revert` abandons an unfinished job of this language (its partial rows
        // go with it); the site is then planned again, at its new revision, and the words reused.
        const held = /in flight for (\S+) at phase/i.exec(String(error.message ?? ''))
        if (held && held[1] === locale && !takenBack) {
          takenBack = true
          log(`language: an unfinished ${locale} job with other words is taken back and started again`)
          await removeJoomlaLanguage({ apply, siteKey: o.targetSite, locale })
          planResult = await apply({
            siteKey: o.targetSite,
            action: 'content.contract',
            params: { operation: 'multilingual.plan', locale }
          })
          if (!planResult?.ok)
            throw new Error(
              String(planResult?.message || planResult?.error || 'The multilingual plan is unavailable')
            )
          ;({ translations } = await planLanguageTranslation({
            plan: planResult,
            languageName: name,
            translate: countingTranslate,
            read: (key) => cache[key],
            save: store,
            log
          }))
          continue
        }
        const problems = error.problems
        if (!problems?.length || attempt === 2) throw error
        const only = [...new Set(problems.map((p) => p.slot))]
        const complaints = Object.fromEntries(problems.map((p) => [p.slot, p.problem]))
        log(`language: ${locale} retranslating ${only.length} strings the site refused`)
        ;({ translations } = await planLanguageTranslation({
          plan: planResult,
          languageName: name,
          translate: countingTranslate,
          only,
          previous: translations,
          complaints,
          save: store,
          log
        }))
      }
    }
  }
  return { plan: null, applied: out }
}

/** The model door for translation, from the environment or this lane's own credential store. */
function translationDoorFor(env, o) {
  if (!o.model) throw new Error('Adding a language needs a model; --no-model cannot translate')
  // The same rule as the seed's text door: the store /ops pushes to is read always, the environment
  // winning on any name it sets, so a language is translated by the provider /ops assigned too.
  {
    const store = path.join(env.DSH_HOME ?? path.join(env.HOME ?? '', '.dsh'), '.credentials.yaml')
    const stored = existsSync(store) ? keysFromCredentials(readFileSync(store, 'utf8')) : {}
    const set = Object.fromEntries(
      Object.entries(env).filter(([, v]) => typeof v === 'string' && v.trim() !== '')
    )
    const door = providerOf({ ...stored, ...set })
    if (door) return door
  }
  if (env.OPENROUTER_API_KEY || env.DEEPSEEK_API_KEY) return providerOf(env)
  const store = path.join(env.DSH_HOME ?? path.join(env.HOME ?? '', '.dsh'), '.credentials.yaml')
  if (!existsSync(store)) throw new Error('No model credentials are configured on this host')
  return providerOf({ ...env, ...keysFromCredentials(readFileSync(store, 'utf8')) })
}

/** One model turn per batch, answering with the JSON array the planner expects. */
function modelTranslator(door, deps) {
  return async (items, system) => {
    const result = await (deps.chat ?? chat)(
      door,
      {
        model: door.textModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(items) }
        ],
        maxTokens: 8192
      },
      deps.fetch
    )
    return parseTranslationAnswer(result.text)
  }
}
