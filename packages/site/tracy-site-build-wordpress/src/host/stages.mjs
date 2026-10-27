/**
 * The six stages of a WordPress build, as functions the shared engine runs in order:
 *
 *   check   shared — the inspiration is known, the look is released, the site says WordPress.
 *   theme   the released `tracy` theme, installed from its public URL through `theme.install`
 *           and switched on with `theme.activate`; a second language adds Polylang.
 *   style   `theme.style` — a global-styles write with rules no generic content kind describes,
 *           which is why WordPress has an action of its own for it.
 *   copy · seed · shot   shared.
 *
 * Every call goes through `apply`, the seat door, in the name of the person who pressed. There is
 * no `wp` here: this lane holds neither the site's files nor a credential for them.
 *
 * ── The QUICKSTART branch (tasks/todo-wordpress-theme-skill.md §G) ───────────────────────────
 * A build whose inspiration is a TEMPLATE (`@tracy/site-build-core/quickstarts`: Tracy Base →
 * `tracy-base/wp7`) dresses a site the fleet restored from a pinned archive, not a fresh one. The
 * same six names, the Joomla quickstart's meaning:
 *
 *   check   the contract the quickstart names is shipped with this host's seeder, and the Cowork
 *           plugin the site reports is not older than the contract's `coworkMinVersion` (Q6: the
 *           plugin is installed as the latest release, so the floor is the only pin).
 *   theme   ASSERTED, never installed: the archive carries `tracy-base` active. `theme.activate
 *           tracy` on it would replace the design the customer chose with the generic theme.
 *   style   immutable — Tracy Base ships its own look; nothing to switch on.
 *   copy    the customer's inputs, written for the seeder (no model take: the pages exist).
 *   seed    the seeder with `--contract`, writing the inputs into the contract's slots only.
 *   shot    shared.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { quickstartFor } from '@tracy/site-build-core/quickstarts'
import {
  applyId,
  checkStage,
  copyStage,
  inputRootFor,
  NO_DOOR_DETAIL,
  ok,
  releasedPackage,
  say,
  sayDetail,
  seedStage,
  shotStage,
  siteFromAnswers,
  siteKeyOf,
  writePreview
} from '@tracy/site-build-core/stages'
import { readDesign, recordingDesign, writeDesign } from '@tracy/site-build-core/design-record'
import { detailOf } from '@tracy/site-build-core/host-messages'
import { WORDPRESS_MESSAGES } from '../messages.mjs'
import { tokensOf, variationOf } from '@tracy/wordpress-theme/variation'

/**
 * One of this plugin's sentences as a helper's refusal: `error` stays the English text its callers
 * and tests read, `failure` is what a stage spreads into its result (the text and its code).
 * @param {keyof typeof WORDPRESS_MESSAGES} code @param {Record<string, string | number>} params
 */
function failureOf(code, params) {
  const failure = detailOf(code, params, WORDPRESS_MESSAGES)
  return { error: failure.detail, failure }
}

/**
 * The same for a seal this build cannot honour: `refusal` (English) and `refusalDetail`.
 * @param {keyof typeof WORDPRESS_MESSAGES} code @param {Record<string, string | number>} params
 */
function refusalOf(code, params) {
  const refusalDetail = detailOf(code, params, WORDPRESS_MESSAGES)
  return { refusal: refusalDetail.detail, refusalDetail }
}

/** The stage names, in order — each a key of `words/<lang>.json` and of `strings.ts`. */
export const STAGES = Object.freeze(['check', 'theme', 'style', 'copy', 'seed', 'shot'])

/** The theme's folder name on a WordPress site. */
const SLUG = 'tracy'

/** Polylang's folder name on a WordPress site, and where a site without it installs it from. */
const POLYLANG = 'polylang'
const POLYLANG_ZIP = 'https://downloads.wordpress.org/plugin/polylang.latest-stable.zip'

/**
 * What each WordPress quickstart holds a restored site to. The same facts as the provider of
 * `capabilities.json` (`test/stages.test.mjs` holds the two equal) — written here as a constant
 * because `lib/index.js` is a bundle and reads no file beside itself at runtime.
 *
 * ⚠ THE CONTRACT HERE IS ONLY THE FALLBACK. A restored site carries its own seal (`sealOf`), and
 * the seal wins: this table pins one version per quickstart, and a release does not wait for it.
 * @type {Readonly<Record<string, { contract: string, coworkMinVersion: string, theme: string }>>}
 */
export const QUICKSTARTS = Object.freeze({
  'tracy-base/wp7': Object.freeze({
    contract: 'tracy-base/wp7/1.0.0',
    coworkMinVersion: '0.8.0',
    theme: 'tracy-base'
  }),
  'tracy-business/wp7': Object.freeze({
    contract: 'tracy-business/wp7/1.0.0',
    coworkMinVersion: '0.8.0',
    theme: 'wp-tracy-business'
  })
})

/**
 * The contract a restored site was sealed with: `<sites root>/.content-contracts/<label>.json`,
 * which `provision/platform/wordpress.sh` writes BEFORE the site's doors are installed —
 * `{contract, platform, quickstart, coworkMinVersion, policy}`. The path fence
 * (`tracy-subprocess-docker`) and the agent's site context (`tracy-site-tools`) read the same file.
 *
 * 🔒 THE SEAL NAMES THE CONTRACT, NOT `QUICKSTARTS`. Measured 23/09/2026 on the local stand:
 * `wp-bbr145` was restored from `tracy-business/wp7` 1.1.0 (278 slots) and sealed so, while the
 * build wrote through the table's 1.0.0 (2 slots) — the site name and tagline were the customer's,
 * every heading and page stayed demo, and the build said `done`.
 * @param {unknown} siteKey - `<label>.<domain>`; the label names the seal.
 * @param {Record<string, string | undefined>} [env] - where `TRACY_SITES_ROOT` is read; `/site`
 *   otherwise, as `sitesRootOf()` in `@tracy/site-build-core/host` (a TypeScript module this file's
 *   plain-node tests cannot import).
 * @returns {{ contract: string, coworkMinVersion: string | null, quickstart: string | null, platform: string | null } | { unreadable: string } | null}
 *   null when the site carries no seal; `unreadable` when it carries one this build cannot read.
 */
export function sealOf(siteKey, env = process.env) {
  if (typeof siteKey !== 'string') return null
  const label = siteKey.split('.')[0]
  if (!/^[a-z0-9][a-z0-9-]*$/.test(label)) return null
  const file = path.join(env.TRACY_SITES_ROOT ?? '/site', '.content-contracts', `${label}.json`)
  /** @type {any} */
  let seal
  try {
    seal = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    if (/** @type {{ code?: unknown }} */ (error)?.code === 'ENOENT') return null
    return { unreadable: `${label}.json: ${error instanceof Error ? error.message : String(error)}` }
  }
  /** @param {string} name */
  const field = (name) => (typeof seal?.[name] === 'string' && seal[name] !== '' ? seal[name] : null)
  const contract = field('contract')
  if (contract === null) return { unreadable: `${label}.json names no contract` }
  // Seals written before 27/09/2026 carry the pre-rename keys; read them until no host holds one.
  return {
    contract,
    coworkMinVersion: field('coworkMinVersion') ?? field('receiverFloor'), // vocabulary-allow: pre-rename key in published data
    // The Claude Cowork plugin provision pinned and bound (since 0.12.x); null when the release pinned none.
    coworkContractVersion: field('coworkContractVersion') ?? field('receiverVersion'), // vocabulary-allow: pre-rename key in published data
    quickstart: field('quickstart'),
    platform: field('platform')
  }
}

/** `a` is older than `b`, by numeric parts (`0.10.0` is newer than `0.9.0`). @param {string} a @param {string} b */
export function olderThan(a, b) {
  const parts = (/** @type {string} */ v) =>
    String(v)
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0)
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0)
  }
  return false
}

/**
 * The Cowork plugin version a `core.manifest` answer carries, whichever of the shapes measured on
 * real Claude Cowork plugins it uses; null when it names none.
 * @param {Record<string, unknown>} manifest
 */
export function coworkContractVersionOf(manifest) {
  const candidates = [
    manifest.version,
    /** @type {any} */ (manifest.cowork)?.version,
    /** @type {any} */ (manifest.plugin)?.version,
    // The pre-rename key an older Claude Cowork plugin may still answer with (27/09/2026).
    /** @type {any} */ (manifest.receiver)?.version, // vocabulary-allow: pre-rename key in published data
    manifest.pluginVersion,
    manifest.coworkVersion
  ]
  // The v0.11+ Claude Cowork plugin reports the plugin version through the extensions inventory rather than
  // as a top-level field. Look for the claude-cowork entry so a site running the current plugin
  // passes the floor check.
  if (Array.isArray(manifest.extensions)) {
    const cowork = /** @type {any} */ (manifest.extensions).find(
      (e) => typeof e?.element === 'string' && e.element === 'claude-cowork'
    )
    if (cowork?.version) candidates.push(cowork.version)
  }
  const found = candidates.find((v) => typeof v === 'string' && /^\d+\.\d+/.test(v))
  return typeof found === 'string' ? found : null
}

/**
 * The host a `brand:<host>` inspiration names, or null for anything else. Only a plain host: the
 * folder it names sits under the site's own `Brand/`, so nothing with a slash or a dot-dot passes.
 * @param {string} inspiration
 */
export function brandHostOf(inspiration) {
  if (typeof inspiration !== 'string' || !inspiration.startsWith('brand:')) return null
  const host = inspiration.slice('brand:'.length)
  return /^[a-z0-9][a-z0-9.-]{0,200}$/i.test(host) ? host : null
}

/**
 * The style slug a brand wears on the theme: `brand-<host with dashes>`. `wear_style` and
 * `tracy_apply_inspiration` accept `^[a-z0-9-]+$` and nothing else.
 * @param {string} host
 */
export const brandStyleSlug = (host) =>
  `brand-${host
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`

/**
 * A brand's style variation, made from `Brand/<host>/tokens.css` the way the theme bakes the
 * 154 (`variationOf` from `@tracy/wordpress-theme/variation`), named after `brand.json`.
 * @param {string} root the site folder
 * @param {string} host
 * @returns {{ slug: string, variation: Record<string, unknown>, meta: { name: string, category: string, nav: string, hero: string, dark: boolean } } | { error: string, failure: { detail: string, detailCode?: string, detailParams?: Record<string, string | number> } }}
 */
export function brandVariation(root, host) {
  const dir = path.join(root, 'Brand', host)
  const tokensFile = path.join(dir, 'tokens.css')
  if (!existsSync(tokensFile))
    return {
      ...failureOf('WP_BRAND_NO_TOKENS', { host })
    }
  let name = host
  try {
    const brand = JSON.parse(readFileSync(path.join(dir, 'brand.json'), 'utf8'))
    if (typeof brand?.name === 'string' && brand.name.trim() !== '') name = brand.name.trim()
  } catch {
    // no brand.json: the host is the name
  }
  const slug = brandStyleSlug(host)
  try {
    const variation = variationOf(tokensOf(readFileSync(tokensFile, 'utf8')), { id: slug, name })
    return {
      slug,
      variation,
      meta: { name, category: 'Your brand', nav: 'top-left', hero: 'split', dark: false }
    }
  } catch (error) {
    return {
      ...failureOf('WP_BRAND_BAD_TOKENS', {
        host,
        reason: error instanceof Error ? error.message : String(error)
      })
    }
  }
}

/** Where the seeder keeps the data beside its bundle (`dist/seed-wordpress` → `dist/data`). @param {{ command: string, args: string[] } | null} seeder */
function seederDataDir(seeder) {
  if (!seeder) return null
  try {
    return path.join(path.dirname(realpathSync(seeder.command)), 'data')
  } catch {
    return path.join(path.dirname(seeder.command), 'data')
  }
}

/**
 * @param {import('@tracy/site-build-core/host').StageDeps} deps
 * @returns {Record<string, import('@tracy/site-build-core/host').StageFn>}
 */
export function makeStages(deps) {
  const { apply } = deps
  const env = deps.env ?? process.env

  /**
   * Polylang, and only when the customer asked for more than one language (Lee, 08/09). A
   * one-language site carries no extra plugin.
   *
   * 🔒 IT IS A WARNING, NEVER A FAILURE. The look is what the stage is for; a translation plugin
   * that would not install leaves a site in one language, which is a site missing a translation
   * rather than a site missing its look. The word it answers with rides on the stage's detail,
   * and the task list reads exactly `polylang on` as "it went on" — every other shape is "it did
   * not" (`todos.mjs`).
   * @param {{ answers?: Record<string, unknown> }} job
   * @param {string} siteKey
   * @returns {Promise<string | null>} a line to add to the stage's detail, or null when nothing was asked.
   */
  async function polylangIfNeeded(job, siteKey) {
    const languages = job.answers?.languages
    if (!Array.isArray(languages) || languages.length < 2) return null
    try {
      // 🔒 THE SITE IS ASKED FIRST, AND THE DOOR IS SPOKEN IN ITS OWN WORDS. A quickstart archive
      // already carries Polylang (`tracy-business/wp7` ships 41 editions through it), and the
      // Claude Cowork plugin installs from an https `.zip` and switches a plugin on by its FILE — the `{ slug }`
      // this sent was refused by both (`url required` on every two-language build of 23/09/2026,
      // `wp-bbr145` to `wp-g4bjus`). Installed and on: nothing to do. Installed and off: switched
      // on. Absent: installed from WordPress.org, then switched on by the file it unpacked into.
      const listed = await apply({ siteKey, action: 'plugin.list', params: {} })
      const plugins =
        ok(listed) && Array.isArray(/** @type {any} */ (listed)?.plugins)
          ? /** @type {any} */ (listed).plugins
          : []
      // Polylang Pro lives in its own folder and must not get the free edition beside it.
      const found = plugins.find(
        (/** @type {any} */ p) =>
          typeof p?.file === 'string' && [POLYLANG, `${POLYLANG}-pro`].includes(p.file.split('/')[0])
      )
      if (found?.active === true) return 'polylang on'
      let file = found?.file
      if (file === undefined) {
        const put = await apply({ siteKey, action: 'plugin.install', params: { url: POLYLANG_ZIP } })
        if (!ok(put)) return `polylang not installed: ${say(put, 'the site refused')}`
        const installed = /** @type {any} */ (put)?.installed?.file
        file = typeof installed === 'string' && installed !== '' ? installed : `${POLYLANG}/${POLYLANG}.php`
      }
      const on = await apply({ siteKey, action: 'plugin.activate', params: { file } })
      if (!ok(on)) return `polylang installed but not on: ${say(on, 'the site refused')}`
      return 'polylang on'
    } catch (error) {
      return `polylang not installed: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  /**
   * Add what the plugin step had to say to a stage result, without letting it change the verdict.
   * @param {import('@tracy/site-build-core/build').StageResult} result
   * @param {string | null} note
   * @returns {import('@tracy/site-build-core/build').StageResult}
   */
  function withPolylang(result, note) {
    if (note === null) return result
    return { ...result, detail: result.detail ? `${result.detail} · ${note}` : note }
  }

  const generic = {
    check: checkStage({ ids: deps.ids, apply, platform: 'wordpress' }),

    /** @param {Parameters<import('@tracy/site-build-core/host').StageFn>[0]} job @returns {Promise<import('@tracy/site-build-core/build').StageResult>} */
    async theme(job) {
      const siteKey = siteKeyOf(job)
      if (siteKey === null) return { status: 'failed', ...detailOf('SITE_UNNAMED') }
      if (apply === null) return { status: 'failed', ...NO_DOOR_DETAIL }
      // The released package, installed straight from its URL. The address comes from the update
      // manifest in the public repository the look is released from — the same file every
      // installed site reads to find a newer version, so a site built today and a site updating
      // tomorrow can never end up on different builds.
      const from = await releasedPackage('wordpress')
      if (from === null) return { status: 'failed', ...detailOf('LOOK_UNREACHABLE') }
      const listed = await apply({ siteKey, action: 'theme.list', params: {} })
      if (!ok(listed))
        return { status: 'failed', ...sayDetail(listed, 'WP_NO_THEMES', {}, WORDPRESS_MESSAGES) }
      const themes = Array.isArray(/** @type {any} */ (listed)?.themes)
        ? /** @type {any} */ (listed).themes
        : []
      // WordPress answers `stylesheet` for the folder name and `name` for the human one ("Tracy").
      // Matching on `name` alone found nothing on a site that already had the theme, so the build
      // installed it again and the site refused — measured 08/09 on tracy-test-bakery.
      const found = themes.find((/** @type {any} */ t) =>
        [t?.stylesheet, t?.name].some((field) => typeof field === 'string' && field.toLowerCase() === SLUG)
      )
      // 🔒 EVERY WAY OUT OF THIS STAGE WEARS THE PLUGIN STEP. It used to wrap only the exit where
      // the theme was already active — so the commonest path of all, a brand-new site installing
      // the theme for the first time, silently skipped the translation plugin (measured 09/09).
      if (found?.active === true || found?.status === 'active')
        return withPolylang(
          { status: 'done', detail: `${SLUG} already on` },
          await polylangIfNeeded(job, siteKey)
        )
      if (!found) {
        const put = await apply({ siteKey, action: 'theme.install', params: { url: from } })
        if (!ok(put))
          return { status: 'failed', ...sayDetail(put, 'WP_LOOK_NOT_INSTALLED', {}, WORDPRESS_MESSAGES) }
      }
      // `stylesheet` is the word the cowork plugin's `theme.activate` reads (claude-cowork 0.9.0,
      // Engine.php `themeActivate`: "stylesheet required, e.g. twentytwentytwo" — measured 13/09 on
      // a site the fleet had just provisioned); `theme` stays for a component that spelled it so.
      const on = await apply({ siteKey, action: 'theme.activate', params: { stylesheet: SLUG, theme: SLUG } })
      if (!ok(on)) return { status: 'failed', ...sayDetail(on, 'WP_LOOK_NOT_ON', {}, WORDPRESS_MESSAGES) }
      return withPolylang(
        { status: 'done', detail: `${SLUG} ${found ? 'activated' : 'installed'} on ${siteKey}` },
        await polylangIfNeeded(job, siteKey)
      )
    },

    /** @param {Parameters<import('@tracy/site-build-core/host').StageFn>[0]} job @returns {Promise<import('@tracy/site-build-core/build').StageResult>} */
    async style(job) {
      const siteKey = siteKeyOf(job)
      if (siteKey === null) return { status: 'failed', ...detailOf('SITE_UNNAMED') }
      if (apply === null) return { status: 'failed', ...NO_DOOR_DETAIL }
      // A brand's look is not one of the theme's 154: it is MADE HERE from the site's own
      // `Brand/<host>/tokens.css`, with the same `variationOf` the theme bakes its variations with,
      // and sent along on `theme.style` for the Claude Cowork plugin to write under
      // `uploads/tracy/styles/` and wear (ADR 0023). A plugin that cannot take a variation yet
      // answers as it always did, and that answer is repeated below.
      const brand = brandHostOf(job.inspiration)
      if (brand !== null) {
        const made = brandVariation(deps.root, brand)
        if ('error' in made) return { status: 'failed', ...made.failure }
        const answer = await apply({
          siteKey,
          action: 'theme.style',
          params: {
            apply_id: applyId(),
            theme: SLUG,
            style: made.slug,
            variation: made.variation,
            meta: made.meta
          }
        })
        if (!ok(answer))
          return { status: 'failed', ...sayDetail(answer, 'WP_BRAND_LOOK_NOT_ON', {}, WORDPRESS_MESSAGES) }
        const record = readDesign(deps.root)
        if (record !== null) writeDesign(deps.root, { ...record, wpStyle: made.slug })
        return { status: 'done', detail: `${made.slug} (${made.meta.name}) on ${siteKey}` }
      }
      const id = job.inspiration.replace(/[^a-z0-9-]/g, '')
      const answer = await apply({
        siteKey,
        action: 'theme.style',
        params: { apply_id: applyId(), theme: SLUG, style: id }
      })
      if (ok(answer)) return { status: 'done', detail: `${id} on ${siteKey}` }
      // A component too old to know the action says so; that is a version to upgrade, not a bug
      // to hunt, and naming it here saves the next person the hunt.
      return {
        status: 'failed',
        ...sayDetail(answer, 'WP_STYLE_NOT_ON', { id }, WORDPRESS_MESSAGES)
      }
    },

    copy: copyStage({ root: deps.root, copyHome: deps.copyHome }),
    // A brand is drawn from the site's own folder: the seeder is told where (`--system-dir`).
    seed: (job) => {
      const brand = brandHostOf(job.inspiration)
      return seedStage({
        root: deps.root,
        run: deps.run,
        seeder: deps.seeder,
        doorOrigin: deps.doorOrigin,
        ...(brand ? { extra: ['--system-dir', path.join(deps.root, 'Brand', brand)] } : {})
      })(job)
    },
    shot: shotStage({ root: deps.root, run: deps.run, chrome: deps.chrome })
  }

  /**
   * The quickstart a job restores, or null for an inspiration built on the released theme. The
   * contract and its floor are the site's own seal when it carries one (`sealOf`) — the table only
   * for a site restored before seals were written. A seal this build cannot honour is a `refusal`.
   * @param {import('@tracy/site-build-core/build').Job} job
   * @returns {Quickstart | null}
   */
  const quickstartOf = (job) => {
    const id = quickstartFor('wordpress', job.inspiration)
    if (!id || !Object.hasOwn(QUICKSTARTS, id)) return null
    const pinned = { id, ...QUICKSTARTS[id] }
    const seal = sealOf(siteKeyOf(job), env)
    if (seal === null) return pinned
    if ('unreadable' in seal)
      return { ...pinned, ...refusalOf('WP_SEAL_UNREADABLE', { reason: seal.unreadable }) }
    if (seal.platform !== null && seal.platform !== 'wordpress')
      return { ...pinned, ...refusalOf('WP_SEALED_FOR', { platform: seal.platform }) }
    if (seal.quickstart !== null && seal.quickstart !== id)
      return { ...pinned, ...refusalOf('WP_RESTORED_FROM', { quickstart: seal.quickstart, id }) }
    return {
      ...pinned,
      contract: seal.contract,
      coworkMinVersion: seal.coworkMinVersion ?? pinned.coworkMinVersion
    }
  }

  /** @typedef {{ id: string, contract: string, coworkMinVersion: string, theme: string, refusal?: string, refusalDetail?: { detail: string, detailCode?: string, detailParams?: Record<string, string | number> } }} Quickstart */
  /** @type {Record<'check' | 'theme' | 'style' | 'copy' | 'seed', (job: import('@tracy/site-build-core/build').Job, q: Quickstart) => Promise<import('@tracy/site-build-core/build').StageResult>>} */
  const quickstart = {
    async check(job, q) {
      const siteKey = siteKeyOf(job)
      if (siteKey === null) return { status: 'failed', ...detailOf('SITE_UNNAMED_START') }
      if (apply === null) return { status: 'failed', ...NO_DOOR_DETAIL }
      // The contract is data the seeder ships; a host whose seeder does not carry it cannot write
      // the slots, and saying so here beats a `seed` stage failing on a missing file twenty
      // minutes later.
      const data = seederDataDir(deps.seeder)
      if (!data) return { status: 'failed', ...detailOf('NO_SEEDER') }
      if (!existsSync(path.join(data, 'quickstart-contracts', q.contract, 'manifest.json')))
        return {
          status: 'failed',
          ...detailOf('WP_NO_CONTRACT_SEEDER', { contract: q.contract }, WORDPRESS_MESSAGES)
        }
      const manifest = await apply({ siteKey, action: 'core.manifest', params: {} })
      if (!ok(manifest)) return { status: 'failed', ...sayDetail(manifest, 'SITE_SILENT', { site: siteKey }) }
      // The Claude Cowork plugin wraps its inventory under a `manifest` key; unwrap it so the platform and
      // version checks see the same shape whether they talk to the real door or a test double.
      const raw = /** @type {Record<string, unknown>} */ (manifest)
      const m = /** @type {Record<string, unknown>} */ (
        typeof raw.manifest === 'object' && raw.manifest !== null ? raw.manifest : raw
      )
      if (typeof m.platform === 'string' && m.platform !== '' && m.platform !== 'wordpress')
        return {
          status: 'failed',
          ...detailOf('WRONG_PLATFORM', { site: siteKey, cms: m.platform, platform: 'WordPress' })
        }
      const version = coworkContractVersionOf(m)
      if (version === null)
        return {
          status: 'failed',
          ...detailOf(
            'WP_COWORK_UNKNOWN',
            { site: siteKey, contract: q.contract, min: q.coworkMinVersion },
            WORDPRESS_MESSAGES
          )
        }
      if (olderThan(version, q.coworkMinVersion))
        return {
          status: 'failed',
          ...detailOf(
            'WP_COWORK_OLD',
            { site: siteKey, version, contract: q.contract, min: q.coworkMinVersion },
            WORDPRESS_MESSAGES
          )
        }
      // 🔒 BINDING, NOT ONLY THE FLOOR. Since Cowork 0.12.0 a sealed site is BOUND at provision, and
      // the seeder writes through `content.contract`; a site whose Claude Cowork plugin has the door but was
      // never bound would take `content.update` as before — the seal on the host would then guard
      // shell tools while the site itself accepts any write. A Claude Cowork plugin from before the door
      // (0.11.0 and earlier) answers `bad_action`: that site is built the old way and says so.
      const seal = await apply({ siteKey, action: 'content.contract', params: { operation: 'inspect' } })
      const s = /** @type {Record<string, unknown>} */ (seal && typeof seal === 'object' ? seal : {})
      const noDoor =
        !ok(s) &&
        /bad_action|unknown action|ACTION_NOT_ALLOWED|unsupported/i.test(
          `${String(s.error ?? '')} ${String(s.code ?? '')} ${String(s.message ?? '')}`
        )
      if (!ok(s) && !noDoor)
        return {
          status: 'failed',
          ...sayDetail(s, 'WP_NOT_INSPECTED', { site: siteKey }, WORDPRESS_MESSAGES)
        }
      // A binding is owed only when provision pinned a Claude Cowork plugin (the marker then names it): a site
      // whose release pins none took the old road on purpose, and is built the old way.
      const seal0 = sealOf(siteKey, env)
      const pinned =
        seal0 !== null && !('unreadable' in seal0) && typeof seal0.coworkContractVersion === 'string'
      if (ok(s) && s.bound !== true && pinned)
        return {
          status: 'failed',
          ...detailOf('WP_NOT_BOUND', { site: siteKey, contract: q.contract }, WORDPRESS_MESSAGES)
        }
      if (ok(s) && typeof s.contract === 'string' && s.contract !== q.contract)
        return {
          status: 'failed',
          ...detailOf(
            'WP_BOUND_ELSEWHERE',
            { site: siteKey, bound: s.contract, contract: q.contract },
            WORDPRESS_MESSAGES
          )
        }
      return {
        status: 'done',
        detail: `${siteKey} · ${q.contract} · Cowork ${version} (floor ${q.coworkMinVersion})${ok(s) && s.bound === true ? ' · bound' : ok(s) ? ' · unbound (release pins no Claude Cowork plugin)' : ' · unbound (cowork has no contract door)'}`
      }
    },
    async theme(job, q) {
      const siteKey = siteKeyOf(job)
      if (siteKey === null) return { status: 'failed', ...detailOf('SITE_UNNAMED') }
      if (apply === null) return { status: 'failed', ...NO_DOOR_DETAIL }
      const listed = await apply({ siteKey, action: 'theme.list', params: {} })
      if (!ok(listed))
        return { status: 'failed', ...sayDetail(listed, 'WP_NO_THEMES', {}, WORDPRESS_MESSAGES) }
      const themes = Array.isArray(/** @type {any} */ (listed)?.themes)
        ? /** @type {any} */ (listed).themes
        : []
      const found = themes.find(
        (/** @type {any} */ t) => typeof t?.stylesheet === 'string' && t.stylesheet === q.theme
      )
      // Asserted, never installed or switched: the archive IS the design. A restored site that
      // does not run its own theme is a restore that went wrong, not a site to dress.
      if (!found)
        return { status: 'failed', ...detailOf('WP_THEME_MISSING', { theme: q.theme }, WORDPRESS_MESSAGES) }
      if (!(found.active === true || found.status === 'active'))
        return {
          status: 'failed',
          ...detailOf(
            'WP_THEME_OTHER',
            {
              active:
                themes.find((/** @type {any} */ t) => t?.active === true || t?.status === 'active')
                  ?.stylesheet ?? 'another theme',
              theme: q.theme
            },
            WORDPRESS_MESSAGES
          )
        }
      return withPolylang(
        { status: 'done', detail: `${q.theme} already on` },
        await polylangIfNeeded(job, siteKey)
      )
    },
    async style(job, q) {
      return { status: 'done', detail: `${q.theme} ships its own look; nothing to switch on.` }
    },
    async copy(job, q) {
      const site = siteFromAnswers({}, job.answers ?? {})
      if (!site.name || !site.about)
        return {
          status: 'waiting',
          detail: `form:${[!site.name && 'name', !site.about && 'about'].filter(Boolean).join(',')}`
        }
      writePreview(inputRootFor(deps.root, job), {
        schemaVersion: 'tracy-design-preview/v1',
        chosen: { id: job.inspiration },
        quickstart: q.id,
        contract: q.contract,
        site,
        pages: []
      })
      return { status: 'done', detail: 'Customer inputs are ready for the quickstart slots.' }
    },
    async seed(job, q) {
      if (!deps.seeder) return { status: 'failed', ...detailOf('NO_SEEDER') }
      const siteKey = siteKeyOf(job)
      if (siteKey === null) return { status: 'failed', ...detailOf('SITE_UNNAMED') }
      const inputs = inputRootFor(deps.root, job)
      const r = await deps.run(deps.seeder.command, [
        ...deps.seeder.args,
        '--preview',
        path.join(inputs, 'docs', 'agents', 'design-preview.json'),
        '--target-site',
        siteKey,
        '--door',
        deps.doorOrigin,
        ...(job.ownerSessionId ? ['--session', job.ownerSessionId] : []),
        '--contract',
        q.contract,
        // A bound site hides its demo posts before the slots are written (the seeder asks the
        // Claude Cowork plugin's `demoTrim.apply`; an unbound site or an older Claude Cowork plugin ignores the flag).
        '--trim-demo'
      ])
      if (r.code !== 0) {
        const error = r.stderr.trim().split(/\r?\n/).filter(Boolean).at(-1)
        return { status: 'failed', ...(error ? { detail: error } : detailOf('SEEDER_STOPPED')) }
      }
      return { status: 'done', detail: `${q.contract} slots written` }
    }
  }

  /**
   * A TEMPLATE CARD with nothing sealing it: the release installed as it shipped, its own theme
   * active, no contract for the seeder to write through.
   *
   * 🔒 IT HAD NO ROAD, SO IT FELL ON THE WRONG ONE. The generic road knows the 152 design systems
   * and the quickstart road only the sealed releases, so a site made from the Tracy Business card
   * stopped at `check` with "tracy-business" is not a design inspiration — measured 22/09 on the
   * local stand, `site-h75639` (`tracy-business/wp7`). Worse than stopping would have been the
   * generic `theme`: `theme.activate tracy` over the template the customer picked.
   *
   * The plan's word picks this road, and that is safe in the one direction that matters: nothing
   * here writes to the site. A plan that lies about a design system only makes the build do less
   * — the look is never replaced and nothing is seeded. The customer's words go to the agent, which
   * holds the site through `tracy_site` (the Joomla template road's code, `PERSONALIZE_BY_AGENT`).
   * @param {import('@tracy/site-build-core/build').Job} job
   */
  const templateCard = (job) =>
    job.designPlan?.workflow === 'template' &&
    job.designPlan.contractProfile == null &&
    !deps.ids.has(job.inspiration)
  const UNSEALED = 'This template is installed as released and carries no content contract.'
  /** @type {Record<'check' | 'theme' | 'style' | 'copy' | 'seed', (job: import('@tracy/site-build-core/build').Job) => Promise<import('@tracy/site-build-core/build').StageResult>>} */
  const template = {
    async check(job) {
      const siteKey = siteKeyOf(job)
      if (siteKey === null) return { status: 'failed', ...detailOf('SITE_UNNAMED_START') }
      if (apply === null) return { status: 'failed', ...NO_DOOR_DETAIL }
      const manifest = await apply({ siteKey, action: 'core.manifest', params: {} })
      if (!ok(manifest)) return { status: 'failed', ...sayDetail(manifest, 'SITE_SILENT', { site: siteKey }) }
      const cms = /** @type {Record<string, unknown>} */ (manifest).platform
      if (typeof cms === 'string' && cms !== '' && cms !== 'wordpress')
        return {
          status: 'failed',
          ...detailOf('WRONG_PLATFORM', { site: siteKey, cms, platform: 'WordPress' })
        }
      return {
        status: 'done',
        detail: `${UNSEALED} The agent writes the customer's words in through the site's own content door.`
      }
    },
    async theme() {
      return { status: 'done', detail: "The template's own theme is installed as released." }
    },
    async style() {
      return { status: 'skipped', detail: `${UNSEALED} It ships its own look.` }
    },
    async copy(job) {
      const site = siteFromAnswers({}, job.answers ?? {})
      if (!site.name || !site.about)
        return {
          status: 'waiting',
          detail: `form:${[!site.name && 'name', !site.about && 'about'].filter(Boolean).join(',')}`
        }
      writePreview(inputRootFor(deps.root, job), {
        schemaVersion: 'tracy-design-preview/v1',
        chosen: { id: job.inspiration },
        site,
        pages: []
      })
      return { status: 'done', detail: "Customer inputs are ready for the template's pages." }
    },
    async seed() {
      return {
        status: 'skipped',
        code: 'PERSONALIZE_BY_AGENT',
        detail:
          "this template carries no content contract; the agent writes the customer's words in with tracy_site, from this build's answers"
      }
    }
  }

  /**
   * @param {keyof typeof quickstart} name
   * @returns {import('@tracy/site-build-core/host').StageFn}
   */
  const either = (name) => async (job) => {
    const q = quickstartOf(job)
    // Every stage answers a refused seal, not only `check`: a stage rerun on its own
    // (`reviseBuild`) must not write through the table's contract instead.
    if (q?.refusal) return { status: 'failed', ...(q.refusalDetail ?? { detail: q.refusal }) }
    if (q) return quickstart[name](job, q)
    return templateCard(job) ? template[name](job) : generic[name](job)
  }

  return {
    // Whichever road `check` takes, a done check leaves `docs/agents/design.json` behind (ADR 0023).
    check: recordingDesign(deps, either('check')),
    theme: either('theme'),
    style: either('style'),
    copy: either('copy'),
    seed: either('seed'),
    shot: generic.shot
  }
}
