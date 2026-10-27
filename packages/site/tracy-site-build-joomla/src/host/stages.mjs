/** A quickstart build changes content in existing slots; style and module structure are immutable. */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { normaliseLocale, normaliseLocales, SOURCE_LOCALE, sourceVariant } from '@tracy/seeder/locales'
import {
  applyId,
  inputRootFor,
  ok,
  patient,
  refusalDetail,
  refusalWords,
  seedStage,
  shotStage,
  siteFromAnswers,
  siteKeyOf,
  TRANSIENT_REFUSALS,
  writePreview
} from '@tracy/site-build-core/stages'
import { recordingDesign } from '@tracy/site-build-core/design-record'
import { detailOf } from '@tracy/site-build-core/host-messages'
import { JOOMLA_MESSAGES } from '../messages.mjs'
import { inspectConstructionDetailed, prepareConstruction } from './construction.mjs'

/**
 * A construction state that is not ok, as the fields of a failed stage: its sentence, and that
 * sentence's code when `construction.mjs` wrote one of Tracy's own.
 * @param {{ detail: string, detailCode?: string, detailParams?: Record<string, string | number> }} state
 */
function failedOf(state) {
  return {
    detail: state.detail,
    ...(state.detailCode ? { detailCode: state.detailCode } : {}),
    ...(state.detailCode && state.detailParams ? { detailParams: state.detailParams } : {})
  }
}

/**
 * 🔒 `language` SITS BETWEEN `seed` AND `shot`, AND THAT IS NOT COSMETIC. It translates what `seed`
 * has just written — the customer's own words, not the demo's — and `shot` photographs the site
 * afterwards, so the picture on the Build card is of the site that exists.
 */
export const STAGES = Object.freeze(['check', 'template', 'style', 'copy', 'seed', 'language', 'shot'])

/** Where the seeder records how far each language got, for the card and for a resumed run. */
export function languageRecordFor(locale) {
  return path.join('docs', 'agents', 'build', 'languages', `${locale}.json`)
}

/** @param {import('@tracy/site-build-core/host').StageDeps} deps
 * @returns {Record<string, import('@tracy/site-build-core/build').StageFn>}
 */
export function makeStages(deps) {
  /**
   * One call on the site, patient with a lane that is not ready to be asked yet. The rule and the
   * list of what counts as "not yet" are the core's (`patient`, `TRANSIENT_REFUSALS`): this plugin
   * kept its own copy until 17/09, and the stages that reached the door WITHOUT it were the ones
   * that broke.
   * @type {(call: {siteKey: string, action: string, params?: Record<string, unknown>}) => Promise<unknown>}
   */
  const patientApply = patient(deps.apply, deps.wait ? { wait: deps.wait } : {})
  /** `core.manifest` of the restored site. */
  const manifestOf = (siteKey) => patientApply({ siteKey, action: 'core.manifest', params: {} })
  /** The construction's state, asked through the same patience. */
  const inspect = (job) => inspectConstructionDetailed({ ...deps, apply: patientApply }, job)
  /**
   * Unpublish the Base demo's own modules on the customer's site — the ones whose title says
   * they are the demo's ("[Tracy Base] Global - Demo notice"). Best effort: a module the Claude Cowork plugin
   * will not list or update is left as it is and counted as nothing, never a failed stage — the
   * design is built; this is the demo's leftover on it.
   * @param {import('@tracy/site-build-core/build').Job} job
   * @returns {Promise<number>} how many were unpublished.
   */
  const retireBaseDemo = async (job) => {
    const siteKey = siteKeyOf(job)
    if (!siteKey) return 0
    const listed =
      /** @type {{ok?: boolean, items?: {id?: unknown, title?: unknown, published?: unknown}[]}} */ (
        await deps.apply({ siteKey, action: 'content.list', params: { kind: 'module', limit: 500 } })
      )
    if (!ok(listed) || !Array.isArray(listed.items)) return 0
    let retired = 0
    for (const item of listed.items) {
      const title = typeof item.title === 'string' ? item.title : ''
      if (!/demo notice/i.test(title) || Number(item.published) === 0) continue
      const done = await deps.apply({
        siteKey,
        action: 'content.update',
        params: { apply_id: applyId(), kind: 'module', id: Number(item.id), fields: { published: 0 } }
      })
      if (ok(done)) retired++
    }
    return retired
  }
  /** @returns {{ detail: string, detailCode?: string, detailParams?: Record<string, string | number> }} */
  const coworkRefusal = (answer) => {
    const code = /** @type {{code?: unknown}} */ (answer ?? {}).code
    const why = refusalWords(answer, 'no answer')
    if (typeof code === 'string' && TRANSIENT_REFUSALS.has(code))
      return detailOf('J_BASE_UNREACHABLE', { code }, JOOMLA_MESSAGES)
    // The CODE stays in the sentence here, unlike a stage's own detail: this one names a CLAUDE COWORK PLUGIN
    // refusal, most of which are the component's own words with no line in `refusalWords`, and the
    // code is then the only part an operator can search for.
    return detailOf(
      'J_BASE_REFUSED',
      { code: typeof code === 'string' ? code : 'error', reason: why },
      JOOMLA_MESSAGES
    )
  }
  /** @param {unknown} result — a refusal from the site, turned into what a stage throws. */
  const refusal = (result) => {
    // The CODE travels with the words. `build.mjs` copies it onto the stage, and it is what tells
    // the Build tab whether "run it again" is an honest thing to offer a person. So does the code of
    // the sentence, when the sentence is Tracy's own.
    const said = refusalDetail(result, 'J_CONTRACT_UNAVAILABLE', {}, JOOMLA_MESSAGES)
    const error = new Error(said.detail)
    if (said.detailCode)
      Object.assign(error, {
        detailCode: said.detailCode,
        ...(said.detailParams ? { detailParams: said.detailParams } : {})
      })
    const code = /** @type {{code?: unknown}} */ (result ?? {}).code
    if (typeof code === 'string' && code !== '') Object.assign(error, { code })
    return error
  }
  /** @param {import('@tracy/site-build-core/build').Job} job
   * @param {string} operation
   * @returns {Promise<{ok?: boolean, error?: unknown, message?: unknown, contract?: string}>}
   */
  const ask = async (job, operation) => {
    const siteKey = siteKeyOf(job)
    if (!siteKey) throw new Error('This build names no site')
    // PATIENT, like every other call this plugin makes on the site. It was not, and that is the
    // whole of the failure measured 17/09 on `build-mu5p44ic-00y2`: `check` reached the site in
    // 3.9s, `template` — the same operation, four seconds later — was refused in 107 ms and took
    // the build down with it. One door, one rule.
    return /** @type {any} */ (
      await patientApply({ siteKey, action: 'content.contract', params: { operation } })
    )
  }
  /**
   * What the site is sealed with: the Claude Cowork plugin's `inspect` answer, or `null` when this is a
   * quickstart installed as released with nothing sealing it. The SITE says which; the plan rode
   * in from the browser and only ever breaks a tie.
   *
   * 🔒 A JOOMLART TEMPLATE CARD HAS NO CONTRACT, AND THE CONTRACT ROAD WAS THE ONLY ROAD. 86 of 88
   * releases seal nothing, so the fleet installs them as shipped with whichever Claude Cowork plugin the
   * manifest names, and every stage below asked `content.contract` and died on the first. Measured
   * 21/09 on `site-gfxzba` (ja-vega, Claude Cowork plugin 0.12.0): `check` failed with `unknown action:
   * content.contract` and nothing after it ran. Two answers mean "nothing is bound here":
   *   - `unknown action: content.contract` — a Claude Cowork plugin older than the door cannot have bound
   *     anything, whatever the plan says;
   *   - `unavailable` from a Claude Cowork plugin that has the door but no profile loaded, or `contract_failed`
   *     from one that fell back to its DEFAULT profile (0.16.x verifies a site with no `contract`
   *     param against tracy-apple; measured 22/09 on `site-ywpw1f`, ja-vega on 0.16.4: "Presentation
   *     asset changed: templates/tracy/acm/accordion/config.xml", a file that was never there). Both
   *     are also what a sealed site says when it broke or drifted, so they count only when the plan
   *     agrees this is an unsealed template — and a sealed card's plan always names its profile.
   * Anything else is a refusal, thrown with its code. `bind` reads the same two answers, so
   * `style` asks once instead of inspecting first.
   * @param {import('@tracy/site-build-core/build').Job} job
   * @param {string} [operation]
   * @returns {Promise<{contract?: string} | null>}
   */
  const sealOf = async (job, operation = 'inspect') => {
    const result = await ask(job, operation)
    if (ok(result)) return result
    if (/unknown action: *content\.contract/i.test(String(result?.message ?? ''))) return null
    const plan = job.designPlan
    if (
      (result?.error === 'unavailable' || result?.error === 'contract_failed') &&
      plan?.workflow === 'template' &&
      plan.contractProfile == null
    )
      return null
    throw refusal(result)
  }
  /**
   * Ask the Claude Cowork plugin to hide every language outside `keep`, one chunk per call, until it answers
   * `completed`. One apply id for the whole pass, so `apply.revert` takes it back in one step.
   * A Claude Cowork plugin older than the operation leaves the site as it was and the stage says so; any other
   * refusal is a refusal.
   * @param {string} siteKey @param {string[]} keep
   * @returns {Promise<{note: string, error?: undefined} | {error: string, note?: undefined}>}
   */
  const retireOthers = async (siteKey, keep, applyId) => {
    const params = { operation: 'multilingual.retire', keep, apply_id: applyId }
    const hidden = {}
    for (let call = 0; call < 100; call++) {
      const answer =
        /** @type {{ok?: boolean, status?: string, hidden?: Record<string, number>, message?: unknown, error?: unknown}} */ (
          await patientApply({ siteKey, action: 'content.contract', params })
        )
      if (!ok(answer)) {
        const said = refusalDetail(answer, 'J_RETIRE_REFUSED', {}, JOOMLA_MESSAGES)
        const why = said.detail
        if (/unknown (multilingual|contract) operation|unknown action/i.test(why))
          return { note: 'this Claude Cowork plugin cannot hide the other languages the quickstart ships.' }
        // A language job left half-done refuses a retire until it finishes; the stage finishes it and
        // retires after (measured 23/09/2026 on j-ee6vsk: refusing here stranded the job for good).
        if (/job is in flight/i.test(why))
          return { inFlight: true, note: 'a language job was still in flight.' }
        return { error: why, failure: said }
      }
      for (const [kind, n] of Object.entries(answer.hidden ?? {}))
        hidden[kind] = (hidden[kind] ?? 0) + Number(n)
      if (answer.status === 'completed')
        return {
          note: hidden.language
            ? `${hidden.language} other language(s) hidden.`
            : 'no other language was published.'
        }
    }
    const failure = detailOf('J_RETIRE_UNFINISHED', {}, JOOMLA_MESSAGES)
    return { error: failure.detail, failure }
  }
  /**
   * Call the site's English edition by the variant the customer writes in — or give it back its
   * published tag when they no longer ask for one. A RELABEL, not a copy (Claude Cowork plugin 0.17.2): the
   * Business archive ships no en-US edition, and a copied one lost the main menu, which the template
   * reads from `tb-main-<sef>`. Returns the tag the source edition carries afterwards, and a note.
   * @param {string} siteKey @param {string | null} variant
   * @returns {Promise<{ source: string, note?: string, error?: string }>}
   */
  const relabelSource = async (siteKey, variant) => {
    const unsupported = (why) =>
      /unknown (sourcelanguage|contract) operation|unknown action|unsupported/i.test(why)
    const plan = await patientApply({
      siteKey,
      action: 'content.contract',
      params: { operation: 'sourceLanguage.plan', ...(variant ? { locale: variant } : {}) }
    })
    if (!ok(plan)) {
      const said = refusalDetail(plan, 'J_SOURCE_READ_REFUSED', {}, JOOMLA_MESSAGES)
      const why = said.detail
      if (!unsupported(why)) return { source: SOURCE_LOCALE, error: why, failure: said }
      return variant
        ? {
            source: SOURCE_LOCALE,
            note: `this Claude Cowork plugin cannot call the English edition ${variant}; it stays ${SOURCE_LOCALE}.`
          }
        : { source: SOURCE_LOCALE }
    }
    const current = /** @type {{current?: string}} */ (plan).current ?? SOURCE_LOCALE
    if ((variant ?? SOURCE_LOCALE) === current) return { source: current }
    const operation = variant ? 'sourceLanguage.set' : 'sourceLanguage.revert'
    const answer = await patientApply({
      siteKey,
      action: 'content.contract',
      params: {
        operation,
        ...(variant ? { locale: variant } : {}),
        apply_id: `srclang-${Date.now().toString(36)}`,
        request_id: `build-${variant ?? 'published'}-${Date.now().toString(36)}`
      }
    })
    if (!ok(answer)) {
      const failure = refusalDetail(
        answer,
        'J_SOURCE_SET_REFUSED',
        { locale: variant ?? SOURCE_LOCALE },
        JOOMLA_MESSAGES
      )
      return { source: current, error: failure.detail, failure }
    }
    return {
      source: variant ?? SOURCE_LOCALE,
      note: variant
        ? `the English edition is now ${variant}.`
        : `the English edition is ${SOURCE_LOCALE} again.`
    }
  }
  /**
   * 🔒 A QUICKSTART WITH NO SECOND EDITION IS BUILT IN ONE LANGUAGE — THE ONE CHOSEN. Its design says
   * `multilingual: false` (ja-kinetic: no multilingual profile, every row at `*`), so it can never
   * carry two editions, and forcing en-GB in front of the customer's language put their Vietnamese
   * into an "(en)" edition (23/09/2026). Here the chosen language is the source: the seed writes in
   * it, and the `language` stage makes it the site's default instead of deriving an edition.
   * @param {import('@tracy/site-build-core/build').Job} job
   */
  const oneLanguage = (job) => job.designPlan?.multilingual === false
  /** The one language of such a site: the first chosen, en-GB when none was. */
  const onlyLanguage = (job) => {
    const chosen = siteFromAnswers({}, job.answers ?? {}).languages
    const first = Array.isArray(chosen) ? chosen.find((l) => typeof l === 'string' && l.trim()) : chosen
    return typeof first === 'string' && first.trim() ? normaliseLocale(first) : SOURCE_LOCALE
  }
  /**
   * Make a one-language site's language its default, through the Tracy Cowork component's
   * `siteLanguage.set`: the reviewed pack installed, site and administrator switched. English is the
   * archive's own language, so it asks for nothing. Nothing is retired either — the site has one
   * edition, and the multilingual operations refuse a contract with no multilingual profile.
   * @param {import('@tracy/site-build-core/build').Job} job
   */
  const setOnlyLanguage = async (job) => {
    const locale = onlyLanguage(job)
    if ((await sealOf(job)) === null)
      return { status: 'skipped', detail: `${UNSEALED} ${locale} can be set in the chat.` }
    if (locale === SOURCE_LOCALE) return { status: 'done', detail: `Published in ${locale}.` }
    const siteKey = siteKeyOf(job)
    if (!siteKey) return { status: 'failed', ...detailOf('SITE_UNNAMED') }
    const answer = /** @type {{ok?: boolean, packVersion?: string, message?: unknown, error?: unknown}} */ (
      await patientApply({
        siteKey,
        action: 'content.contract',
        params: { operation: 'siteLanguage.set', locale, apply_id: 'slang-build', request_id: 'build' }
      })
    )
    if (ok(answer))
      return {
        status: 'done',
        detail: `Published in ${locale}: its language pack${answer.packVersion ? ` ${answer.packVersion}` : ''} is installed and is the default for the site and the administrator.`
      }
    const said = refusalDetail(answer, 'J_SWITCH_REFUSED', { locale }, JOOMLA_MESSAGES)
    if (/unknown (contract|siteLanguage) operation|unknown action/i.test(said.detail))
      return { status: 'failed', ...detailOf('J_COMPONENT_TOO_OLD', {}, JOOMLA_MESSAGES) }
    return { status: 'failed', ...said }
  }
  /** What the stages after `check` say on a site with no contract. */
  const UNSEALED = 'This quickstart is installed as released and carries no content contract.'
  const stages = {
    async check(job) {
      if (job.designPlan?.workflow === 'template-build') {
        const target = siteKeyOf(job)
        if (!target) return { status: 'failed', ...detailOf('SITE_UNNAMED') }
        const manifest = await manifestOf(target)
        if (!ok(manifest)) return { status: 'failed', ...coworkRefusal(manifest) }
        prepareConstruction(deps.root, job)
        return { status: 'done', detail: 'Base is ready; the requested template still needs to be built.' }
      }
      // The SITE is the authority on which design it carries, not the job and not the client that
      // started it. Every Joomla site Tracy builds comes off one base archive, and the design is
      // whichever template the fleet activated on it before binding — so the only honest question
      // here is "which contract did the Claude Cowork plugin bind", and the answer comes from the Claude Cowork plugin.
      const state = await sealOf(job)
      if (state === null)
        return {
          status: 'done',
          detail: `${UNSEALED} The agent writes the customer's words in through the site's own content door.`
        }
      if (!state.contract)
        return {
          status: 'failed',
          ...detailOf('J_NO_CONTRACT', {}, JOOMLA_MESSAGES)
        }
      // The plan the fleet answered with when the site was created rode down with the build. It is
      // a label, so it is checked rather than believed: a plan naming a different profile than the
      // one the site is bound to means the site being dressed is not the site that was planned —
      // a mixed-up target, or a caller that wrote its own plan. Either way this must not proceed.
      const planned = job.designPlan?.contractProfile
      if (planned && planned !== state.contract)
        return {
          status: 'failed',
          ...detailOf('J_OTHER_CONTRACT', {}, JOOMLA_MESSAGES)
        }
      // The one sentence the agent must be able to say, on the record, in the job itself. Without
      // it a fallback build reads as a success for the design that was picked, and the agent goes
      // on to describe a site that does not exist.
      const plan = job.designPlan
      return {
        status: 'done',
        detail: plan?.fallback
          ? `${plan.requestedDesign} has no supported Joomla template yet, so this site uses the ${plan.effectiveDesign} template. Its content and display contract matches.`
          : 'The installed quickstart matches its content and display contract.'
      }
    },
    async template(job) {
      if (job.designPlan?.workflow === 'template-build') {
        const state = await inspect(job)
        // A Claude Cowork plugin that could not be asked is a failed stage with the Claude Cowork plugin's own code — not
        // "the design is not built yet", which is what `waiting` says and what a builder would
        // then set out to do a second time.
        if (!state.ok && state.why === 'cowork') return { status: 'failed', ...failedOf(state) }
        if (!state.ok)
          return { status: 'waiting', detail: `template-build:${prepareConstruction(deps.root, job)}` }
        return {
          status: 'done',
          detail: 'The completed design has its own verified content/display profile.'
        }
      }
      // The design's template is installed and activated by the provisioner, before the contract is
      // bound — by the time a stage runs, changing it would be drift the Claude Cowork plugin refuses. So this
      // stage confirms and never installs: `inspect` fails closed if the template, its styles, its
      // files or the module assignments moved since the bind.
      if ((await sealOf(job)) === null)
        return { status: 'done', detail: 'The quickstart template is installed as released.' }
      return { status: 'done', detail: 'The original quickstart template is preserved.' }
    },
    async style(job) {
      if (job.designPlan?.workflow === 'template-build') {
        const state = await inspect(job)
        if (!state.ok) return { status: 'failed', ...failedOf(state) }
        // The Base archive ships a demo: a footer notice saying so, and its own name. The template
        // builder is told to retire both (`prepareConstruction`); this is the safety net for the
        // notice, which the Claude Cowork plugin can reach (a module). Measured 13/09 on a finished build:
        // "Tracy Base is a studio demo. Company details … are illustrative" in the customer's
        // footer, on every page. The site name lives in configuration.php, out of the Claude Cowork plugin's
        // reach — the builder's instruction is what covers it, and `template-review` records it.
        const retired = await retireBaseDemo(job)
        return {
          status: 'done',
          detail: `The new design profile verifies the built presentation.${retired > 0 ? ` ${retired} Base demo module(s) unpublished.` : ''}`
        }
      }
      if ((await sealOf(job, 'bind')) === null)
        return { status: 'skipped', detail: `${UNSEALED} There is no presentation lock to bind.` }
      return { status: 'done', detail: 'Original layouts, modules, menus and access rules are locked.' }
    },
    async copy(job) {
      if (job.designPlan?.workflow === 'template-build')
        return { status: 'skipped', detail: 'Content was authored with the new template.' }
      const site = siteFromAnswers({}, job.answers ?? {})
      if (!site.name || !site.about)
        return {
          status: 'waiting',
          detail: `form:${[!site.name && 'name', !site.about && 'about'].filter(Boolean).join(',')}`
        }
      // An extra language used to stop the build here with `waiting`. It is now a stage of its
      // own, so the copy pass writes the source edition and says how many editions follow it.
      const one = oneLanguage(job) ? onlyLanguage(job) : null
      const languages = one ? [one] : normaliseLocales(site.languages)
      // The design the site ACTUALLY carries, not the one that was asked for. When a picked
      // inspiration has no Joomla template yet the site is built on the default design, and
      // handing the seeder the requested id here would have it write copy pitched at a design
      // that is not on the site — the exact "looks like it worked" failure the fallback notice
      // exists to prevent. `requested` travels beside it so nothing downstream loses the ask.
      writePreview(inputRootFor(deps.root, job), {
        schemaVersion: 'tracy-design-preview/v1',
        chosen: { id: job.designPlan?.effectiveDesign ?? job.inspiration },
        ...(job.designPlan ? { requestedDesign: job.designPlan.requestedDesign } : {}),
        site: { ...site, languages, ...(one ? { sourceLanguage: one } : {}) },
        pages: []
      })
      return {
        status: 'done',
        detail:
          languages.length > 1
            ? `Customer inputs are ready; ${languages.slice(1).join(', ')} follow the source edition.`
            : 'Customer inputs are ready for the existing quickstart slots.'
      }
    },
    seed: async (job) => {
      if (job.designPlan?.workflow === 'template-build')
        return { status: 'skipped', detail: 'The template builder populated native Joomla content.' }
      // 🔒 NO CONTRACT IS NOT NO WORDS. The seeder writes through `content.contract` and has
      // nothing to write through here, but the customer answered the questionnaire all the same.
      // The agent in the chat holds the same site through `tracy_site` (`content.list`, `.get`,
      // `.update`), so the stage hands the work over — the EmDash template road's own code, which
      // is what the build notification and the Build tab key on.
      if ((await sealOf(job)) === null)
        return {
          status: 'skipped',
          code: 'PERSONALIZE_BY_AGENT',
          detail:
            "this quickstart carries no content contract; the agent writes the customer's words in with tracy_site, from this build's answers"
        }
      return seedStage({
        root: deps.root,
        run: deps.run,
        seeder: deps.seeder,
        doorOrigin: deps.doorOrigin,
        // 🔒 THE SEVEN STAGES HAVE TO END IN A SITE. A JoomlArt quickstart ships the vendor's
        // entire demo site: ja-kinetic holds 4,662 slots, 3,634 of them in 250 demo articles
        // and 727 of them evidence-required. Planned whole and refused on every unbacked
        // slot, `seed` stopped at CONTENT_REQUIRED on every unattended build — measured
        // 16/09/2026 on ja-voyara and ja-kinetic. `pages` plans what the routed pages show;
        // `keep-demo` leaves an unbacked slot as the archive shipped it. Neither loosens the
        // contract: an unbacked value is still never written, it is reported as kept.
        // `trim-demo` asks the Claude Cowork plugin to hide the rows the contract's reviewed demo-trim profile
        // lists (ja-kinetic: 240 blog posts about a company that does not exist). A contract with
        // no such profile, or a Claude Cowork plugin older than the operation, seeds exactly as before.
        extra: ['--surface', 'pages', '--keep-demo', '--trim-demo']
      })(job)
    },
    /**
     * Give the site every language the customer asked for, one whole edition at a time.
     *
     * 🔒 A LANGUAGE THAT FAILS DOES NOT ERASE THE ONES THAT LANDED. Each locale is its own seeder
     * run with its own receipt, so a site that gets Chinese and then fails on French is a site with
     * Chinese — reported as exactly that, rather than as a failed build with nothing to show.
     */
    async language(job) {
      if (job.designPlan?.workflow === 'template-build')
        return { status: 'skipped', detail: 'Language editions belong to the new design build and profile.' }
      if (oneLanguage(job)) return setOnlyLanguage(job)
      const asked = siteFromAnswers({}, job.answers ?? {}).languages
      const languages = normaliseLocales(asked)
      const extra = languages.filter((locale) => locale !== SOURCE_LOCALE)
      const variant = sourceVariant(asked)
      // The language pass plans through the contract door too, so an unsealed quickstart gets its
      // other editions from the agent, in the chat, beside the words it is writing already.
      if ((await sealOf(job)) === null)
        return extra.length || variant
          ? {
              status: 'skipped',
              detail: `${UNSEALED} ${[variant, ...extra].filter(Boolean).join(', ')} can be set in the chat.`
            }
          : { status: 'skipped', detail: 'This site is published in one language.' }
      const siteKey = siteKeyOf(job)
      if (!siteKey) return { status: 'failed', ...detailOf('SITE_UNNAMED') }
      // Before anything is hidden: a language the stage cannot then derive would be left with no
      // edition at all once the archive's own is retired.
      if (extra.length && !deps.seeder) return { status: 'failed', ...detailOf('NO_SEEDER') }
      // 🔒 A QUICKSTART MAY SHIP EDITIONS OF ITS OWN, AND THEY GO FIRST. The Business archive
      // carries 43 content languages its contract does not govern: measured 23/09/2026 on
      // `j-h0n2f4`, the switcher and hreflang offered all 43 after the build, and the archive's own
      // zh-CN edition would have sat beside the copy derived from the customer's words. The
      // Claude Cowork plugin hides (never deletes) every language not asked for and every ungoverned row
      // outside the source; a language still to be derived stays hidden until its copy lands.
      // The source is named first: every step after it — what retire keeps, what an edition is
      // associated with — names the source by the tag it now carries.
      const relabel = await relabelSource(siteKey, variant)
      if (relabel.error) return { status: 'failed', ...(relabel.failure ?? { detail: relabel.error }) }
      const source = relabel.source
      // One apply id for the whole stage — the retire before and the retire after — so
      // `multilingual.restore` brings the pass back in one call.
      const retireId = `mlang-retire-${Date.now().toString(36)}`
      const keep = [source, ...extra]
      let retired = await retireOthers(siteKey, keep, retireId)
      if (retired.error) return { status: 'failed', ...(retired.failure ?? { detail: retired.error }) }
      const notes = [relabel.note, retired.note].filter(Boolean).join(' ')
      if (!extra.length) return { status: 'done', detail: `Published in ${source}; ${notes}` }
      const inputs = inputRootFor(deps.root, job)
      const added = []
      for (const locale of extra) {
        const r = await deps.run(deps.seeder.command, [
          ...deps.seeder.args,
          '--platform',
          'joomla',
          '--preview',
          path.join(inputs, 'docs', 'agents', 'design-preview.json'),
          '--target-site',
          siteKey,
          '--door',
          deps.doorOrigin,
          ...(job.ownerSessionId ? ['--session', job.ownerSessionId] : []),
          '--add-language',
          locale
        ])
        if (r.code !== 0) {
          let error = r.stderr.trim().split(/\r?\n/).filter(Boolean).at(-1)
          // 🔒 SAY WHAT A RETRY WOULD DO. The seeder has already asked the model again for exactly
          // the refused strings, with the Claude Cowork plugin's reason attached, and a retry replays the cached
          // words through the same check. Without this sentence the refusal read as "the model did
          // badly, try again" — measured 23/09/2026, when the check itself was wrong.
          if (error && /translation is not usable/i.test(error))
            error = `${error}. The model was already asked again with that reason attached; a retry repeats the same check, so read the named strings first.`
          // The editions that landed plus the seeder's words stay one English line; a stop with
          // neither is Tracy's own sentence, with its code.
          return {
            status: 'failed',
            ...(added.length
              ? { detail: `${added.join(', ')} added; ${locale} stopped: ${error ?? 'the seeder stopped'}` }
              : error
                ? { detail: error }
                : detailOf('J_EDITION_STOPPED', { locale }, JOOMLA_MESSAGES))
          }
        }
        added.push(locale)
      }
      // And after: a job that was in flight could not be retired around, and a derivation may leave an
      // archive row of its language showing beside the copy it made.
      retired = await retireOthers(siteKey, keep, retireId)
      if (retired.error)
        return {
          status: 'failed',
          detail: `${added.join(', ')} added; hiding the other languages stopped: ${retired.error}`
        }
      const record = path.join(inputs, languageRecordFor(added.at(-1)))
      let lastApplyId
      if (existsSync(record)) {
        const receipt = JSON.parse(readFileSync(record, 'utf8'))
        if (typeof receipt.applyId === 'string') lastApplyId = receipt.applyId
      }
      return {
        status: 'done',
        detail: `${added.join(', ')} added beside ${source}; ${[relabel.note, retired.note].filter(Boolean).join(' ')}`,
        ...(lastApplyId ? { lastApplyId } : {})
      }
    },
    shot: shotStage({ root: deps.root, run: deps.run, chrome: deps.chrome })
  }
  // A done check leaves `docs/agents/design.json` behind (ADR 0023): the plan's design on the
  // registry road, the sealing profile's on a template press, none on an unsealed JoomlArt pack.
  stages.check = recordingDesign(deps, stages.check)
  return stages
}
