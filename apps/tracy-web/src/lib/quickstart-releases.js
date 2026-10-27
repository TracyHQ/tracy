/**
 * The quickstarts Tracy can start a site from — read off `JoomlArt-Products/ja-products` itself.
 *
 * ADR 0017: the release is the quickstart. A release says what it is in `tracy_setting.json`, and
 * optionally what it asks in `tracy_site_question.json`; nothing in this repository lists them any
 * more. This module is the whole of the reading: it calls GitHub, holds each setting to the
 * validator the release tool runs, and writes the answer down.
 *
 * 🔒 THE TABLE IS THE ANSWER, THE CALL IS NOT. Every read replaces rows; every screen and the
 * create door read the TABLE. That is what keeps the product working while GitHub is down — and
 * what makes "as of 05:41Z" sayable instead of an empty list that reads like an empty shelf.
 *
 * 🔒 A RELEASED QUESTIONNAIRE IS ADDED, NEVER SWAPPED. Its sha256 is its identity: a file that
 * changed upstream becomes ANOTHER candidate beside the one in use, and the administrator moves
 * when they choose to (Lee, 15/09). Nothing a person edited here is touched by a read of GitHub.
 */
import { quickstartReleaseIdentity } from './quickstart-selection.js'
import { nameFor } from './site-design.js'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { ensureRepoWebhook, installationIdFor, mintTokenFor } from '../github/app.js'
import { validateQuestions } from './questions-schema.mjs'
import { contractFor, coworkPinFor, readContracts } from './contracts.js'
import { installedCowork } from './cowork-install.js'
import {
  createReleaseReadCache,
  deferredUntil,
  GithubRateLimited,
  noteRateLimit,
  rateLimitedBy,
  sharedReleaseReadCache
} from './github-read-budget.js'
import {
  isLocalTag,
  LOCAL_TAG_NAMESPACE,
  localInstallPart,
  publishedTagOf,
  readLocalPacks
} from './local-releases.js'
import { readSitePages, SITE_PAGES_FILE } from './site-pages-schema.mjs'
import { putShot, shotFilesFor, templateIdOf } from './template-shots.js'
import { normalizeSetting, validateDesignInspiration, validateSetting } from './tracy-setting.mjs'

const API = 'https://api.github.com'
/** The contract profiles, read once on first use — files in the image, fixed for the process. */
let contractIndex = null
const contracts = () => (contractIndex ??= readContracts())

/** One attempt per process: a hook that could not be wired is a warning, not a retry loop. */
let wired = false
export const RELEASES_REPO = 'JoomlArt-Products/ja-products'
/**
 * The asset that carries a release's Design inspiration card (ADR: the card left `tracy_setting.json`
 * on 16/09). A release that has none has no card — which is a state, not a fault.
 */
export const DESIGN_INSPIRATION_FILE = 'tracy_design_inspiration.json'
/**
 * The asset that takes a release's card OFF Design inspiration. Its presence is the whole of its
 * meaning; the bytes are never read. It exists for the `card` block a release cut before 16/09
 * carries inside `tracy_setting.json` — a file never edited after the cut, so Unpublish cannot
 * remove that card by deleting anything. Publish removes the mark again.
 */
export const DESIGN_INSPIRATION_HIDDEN_FILE = 'tracy_design_inspiration_hidden.json'
/**
 * The asset that ARCHIVES a release: off every list (/ops Templates, `GET /api/templates`, Design
 * inspiration) and never a base a site may be built from. Like the hidden mark, its presence is its
 * whole meaning and the bytes are never read. It is uploaded and deleted on GitHub by hand; the next
 * copy of the releases marks or unmarks the row already held, so deleting the asset undoes it. It
 * exists because deleting a release leaves its copied row choosable, and a draft is still listed.
 */
export const ARCHIVED_FILE = 'tracy_archived.json'
/** Whether a release's asset list carries `ARCHIVED_FILE`. */
const archivedBy = (assets) => (assets ?? []).some((a) => a?.name === ARCHIVED_FILE)
/** The pages a release's template has (`site-pages-schema.mjs`); read here, served by `pagesOf`. */
export { pagesOf } from './site-pages-schema.mjs'
export { createReleaseReadCache }

/**
 * A design pack (`tracy-airbnb/j6`) is applied to a site, not a site to start from. A local pack
 * (`local/tracy-airbnb/j6`) is whatever the release it stands for would be.
 */
function kindOf(release) {
  return /^tracy-airbnb\//.test(publishedTagOf(release.tag_name)) ? 'design-pack' : 'quickstart'
}

/**
 * One release as the three independent axes a screen draws. They are separate because they have
 * separate owners: the tag says what KIND it is, GitHub says whether it is published, and Tracy
 * says whether it can read it. Folded into one "status" they hide which question a row answers.
 * @param {any} release the release as the API gave it
 * @param {any} setting the parsed setting, or null
 * @param {string | null} reason why, when there is no usable setting
 * @param {{ inspiration?: any, cardReason?: string | null, pages?: any[] | null, pagesReason?: string | null }} [card]
 *   the release's Design inspiration card, and why there is none when the file is there but
 *   refused. A bad card is NOT a bad release: `tracy` and `choosable` are untouched, and only
 *   `reason` carries the sentence — a site still builds from a release whose blurb is wrong.
 *   `pages` / `pagesReason` are the same for `tracy_site_pages.json`: a refused list is a sentence
 *   in `reason` and no pages, never a release nothing can be built from.
 *   `inspirationHidden` is whether the release carries `DESIGN_INSPIRATION_HIDDEN_FILE`.
 */
export function readingOf(
  release,
  setting,
  reason,
  { inspiration = null, cardReason = null, pages = null, pagesReason = null } = {}
) {
  const inspirationHidden = (release.assets ?? []).some((a) => a.name === DESIGN_INSPIRATION_HIDDEN_FILE)
  const archived = archivedBy(release.assets)
  const kind = kindOf(release)
  const github = release.draft ? 'draft' : release.prerelease ? 'prerelease' : 'published'
  const tracy = setting ? 'ready' : reason && /is not|must|refused/i.test(reason) ? 'invalid' : 'no-setting'
  return {
    tag: release.tag_name,
    name: release.name ?? release.tag_name,
    kind,
    github,
    tracy,
    reason: setting ? [cardReason, pagesReason].filter(Boolean).join('; ') || null : reason,
    inspiration,
    pages: setting ? pages : null,
    inspirationHidden,
    archived,
    publishedAt: release.published_at ?? null,
    // `id` and `size` travel with the name: the host downloads a private repo's asset BY ID with
    // its own token, and refuses any byte count the entry did not pin (`quickstart.py`). `digest`
    // (`sha256:<hex>`, stated by GitHub since 2025) rides along when there is one: the download
    // door hands it to the person as `x-tracy-sha256`, so a desktop app can check the zip it saved.
    assets: (release.assets ?? []).map((a) => ({
      name: a.name,
      size: a.size ?? null,
      id: a.id ?? null,
      ...(typeof a.digest === 'string' ? { digest: a.digest } : {})
    })),
    // A pack read off this machine (`local-releases.js`) rather than off GitHub: where it lies.
    // Only a `local/` tag may carry it — no field of a GitHub answer can point a host at a disk.
    local: isLocalTag(release.tag_name) ? (release.local ?? null) : null,
    setting,
    // What a dropdown may offer: a quickstart, published, readable and not archived. Computed here so
    // no screen has to remember the rule.
    choosable: kind === 'quickstart' && github !== 'draft' && !archived && Boolean(setting)
  }
}

/**
 * How this deployment is allowed to read the releases repository.
 *
 * The App that gives every site its own repo is already installed on `ja-products` in production, so
 * production mints a repo-scoped installation token and stores nothing. A shard runs its own App on
 * its own org, which is NOT installed there: it reads with `TRACY_RELEASES_GITHUB_TOKEN`, a
 * read-only token, rather than holding write access to the releases repository. A developer's stand
 * has no App key at all and uses the same token. Neither one configured is the FEATURE being off —
 * the screen says so — never a crash at boot, and never a guess at some other credential.
 *
 * 🔒 THE TOKEN IS A FALLBACK FOR "NOT INSTALLED" ONLY, which is GitHub answering 404 to the
 * installation lookup. GitHub not answering (5xx, network) is an outage, and an installed App whose
 * mint is refused is a fault to surface: neither may quietly switch production to the token.
 * @param {{ github: any, releasesToken: string | null }} config
 */
export async function releasesToken(config, fetchImpl = fetch, repo = RELEASES_REPO) {
  if (config.github) {
    try {
      const installation = await installationIdFor(config.github, repo, fetchImpl)
      if (installation === null) {
        if (config.releasesToken) return { token: config.releasesToken, reason: null }
        return { token: null, reason: `The GitHub App is not installed on ${repo}.` }
      }
      const minted = await mintTokenFor(config.github, installation, repo.split('/')[1], fetchImpl)
      if (minted?.token) return { token: minted.token, reason: null }
      return { token: null, reason: `GitHub refused an installation token for ${repo}.` }
    } catch (e) {
      return { token: null, reason: `GitHub did not answer: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
  if (config.releasesToken) return { token: config.releasesToken, reason: null }
  return {
    token: null,
    reason: `This deployment cannot read ${repo}: configure the GitHub App, or set TRACY_RELEASES_GITHUB_TOKEN.`
  }
}

/**
 * One page of the release list, asked with the ETag of its last 200 so an unchanged page is a free
 * 304. The new ETag is returned, not stored: the caller keeps it only once the whole read landed.
 * @param {import('./github-read-budget.js').ReleaseReadCache} cache
 */
async function listPage(fetchImpl, url, token, cache) {
  const known = cache.pages.get(url)
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'tracy-web',
      'x-github-api-version': '2022-11-28',
      ...(known ? { 'if-none-match': known.etag } : {})
    }
  })
  noteRateLimit(cache, response)
  const limited = rateLimitedBy(cache, response)
  if (limited) throw limited
  if (response.status === 304 && known) return { body: known.body, etag: known.etag, notModified: true }
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${url}`)
  return { body: await response.json(), etag: response.headers.get('etag'), notModified: false }
}

/** The asset cache key: an asset's bytes never change under one id. Null when the API gave no id. */
const assetKey = (asset) => (asset.id == null ? null : `${asset.id} ${asset.updated_at ?? ''}`)

/**
 * An asset's bytes as text, downloaded once per asset id. A release that lost an asset mid-read is
 * a reason, not a crash.
 * @param {import('./github-read-budget.js').ReleaseReadCache} cache
 */
async function assetText(fetchImpl, asset, token, cache) {
  const key = assetKey(asset)
  const cached = key ? cache.assets.get(key) : undefined
  if (cached !== undefined) return cached
  // A spent quota refuses every asset alike: say so without spending a request on each.
  if (cache.rate && cache.rate.remaining === 0 && cache.rate.resetMs > Date.now())
    throw new GithubRateLimited(cache.rate.resetMs)
  const response = await fetchImpl(asset.url, {
    headers: {
      accept: 'application/octet-stream',
      authorization: `Bearer ${token}`,
      'user-agent': 'tracy-web'
    }
  })
  noteRateLimit(cache, response)
  const limited = rateLimitedBy(cache, response)
  if (limited) throw limited
  if (!response.ok) {
    const e = new Error(`GitHub answered ${response.status} for ${asset.name}`)
    // Carried so a caller can tell a passing refusal (secondary rate limit, outage) from a bad file.
    e.status = response.status
    throw e
  }
  const text = await response.text()
  if (key) cache.assets.set(key, text)
  return text
}

/**
 * Whether a failed asset read says nothing about the file: GitHub refused for now (403 secondary
 * rate limit, 429, 5xx) or did not answer at all. A 404 or a JSON parse error is about the file.
 * @param {unknown} e
 */
function transientRead(e) {
  const status = e instanceof Error && 'status' in e ? Number(e.status) : undefined
  if (status === undefined) return !(e instanceof SyntaxError)
  return status === 403 || status === 429 || status >= 500
}

/**
 * Every release of the repository (100 a page, the API's most). `unchanged` is every page answering
 * 304; `commit` stores the new ETags, to be called only once the read built on them is written down.
 * @param {{ token: string, fetchImpl?: typeof fetch, repo?: string, cache?: import('./github-read-budget.js').ReleaseReadCache }} opts
 */
async function listReleases({
  token,
  fetchImpl = fetch,
  repo = RELEASES_REPO,
  cache = sharedReleaseReadCache
}) {
  /** @type {any[]} */
  const releases = []
  /** @type {[string, { etag: string, body: any }][]} */
  const fresh = []
  let unchanged = true
  for (let page = 1; page <= 10; page += 1) {
    const url = `${API}/repos/${repo}/releases?per_page=100&page=${page}`
    // eslint-disable-next-line no-await-in-loop -- pages are sequential by definition.
    const { body, etag, notModified } = await listPage(fetchImpl, url, token, cache)
    if (!notModified) unchanged = false
    if (etag) fresh.push([url, { etag, body }])
    releases.push(...body)
    if (body.length < 100) break
  }
  const commit = () => {
    for (const [url, entry] of fresh) cache.pages.set(url, entry)
  }
  return { releases, unchanged, commit }
}

/**
 * Read every release of the repository, and the two Tracy files of each that has them.
 * @param {{ token: string, fetchImpl?: typeof fetch, repo?: string, cache?: import('./github-read-budget.js').ReleaseReadCache }} opts
 */
export async function fetchReleases({
  token,
  fetchImpl = fetch,
  repo = RELEASES_REPO,
  cache = sharedReleaseReadCache
}) {
  const { releases } = await listReleases({ token, fetchImpl, repo, cache })
  return (await readingsOf(releases, { token, fetchImpl, cache })).readings
}

/**
 * The reading of each release. `complete` is false when GitHub refused some file for now: the list's
 * ETag must not be kept then, or a 304 would freeze the gap until the list changes. `limited` is the
 * rate-limit refusal met on the way, if any.
 * @param {any[]} releases
 * @param {{ token: string, fetchImpl: typeof fetch, cache: import('./github-read-budget.js').ReleaseReadCache }} opts
 */
async function readingsOf(releases, { token, fetchImpl, cache }) {
  let complete = true
  /** @type {GithubRateLimited | null} */
  let limited = null
  const read = (asset) =>
    assetText(fetchImpl, asset, token, cache).catch((e) => {
      if (transientRead(e)) complete = false
      if (e instanceof GithubRateLimited) limited = e
      throw e
    })
  const readings = []
  for (const release of releases) {
    const assets = release.assets ?? []
    const settingAsset = assets.find((a) => a.name === 'tracy_setting.json')
    let setting = null
    let reason = null
    let questions = null
    // True when GitHub refused the setting for now: the row keeps what it already knows (below).
    let settingUnread = false
    if (!settingAsset) {
      reason =
        kindOf(release) === 'design-pack'
          ? 'A design pack is applied to a site built from a quickstart; it needs no tracy_setting.json.'
          : 'No tracy_setting.json among the assets — Tracy cannot tell which CMS this is or which files to install.'
    } else {
      try {
        // eslint-disable-next-line no-await-in-loop -- one release at a time keeps the log readable.
        const doc = JSON.parse(await read(settingAsset))
        const problems = validateSetting(doc, {
          assets: assets.map((a) => a.name),
          digests: digestsOf(assets)
        })
        if (problems.length > 0) reason = problems.join('; ')
        else setting = doc
      } catch (e) {
        reason = `tracy_setting.json could not be read: ${e instanceof Error ? e.message : String(e)}`
        settingUnread = transientRead(e)
      }
    }

    const questionAsset = assets.find((a) => a.name === 'tracy_site_question.json')
    if (setting && questionAsset) {
      try {
        // eslint-disable-next-line no-await-in-loop -- same.
        const raw = await read(questionAsset)
        const doc = JSON.parse(raw)
        // A bad questionnaire does not spoil a good setting: the site is asked the CMS default and
        // the screen says the file was refused. A release is not all-or-nothing.
        questions =
          validateQuestions(doc).length === 0
            ? { doc, sha256: await sha256(raw), version: setting.version }
            : null
      } catch {
        questions = null
      }
    }

    // The Design inspiration card, read the same way the questionnaire is — its own asset, its own
    // validator, its own reason. Read only when the setting is good: a card for a release nothing
    // can be built from is a card nothing can be created with.
    const cardAsset = assets.find((a) => a.name === DESIGN_INSPIRATION_FILE)
    let inspiration = null
    let cardReason = null
    if (setting && cardAsset) {
      try {
        // eslint-disable-next-line no-await-in-loop -- same.
        const doc = JSON.parse(await read(cardAsset))
        const problems = validateDesignInspiration(doc)
        if (problems.length === 0) inspiration = doc
        else cardReason = `${DESIGN_INSPIRATION_FILE}: ${problems.join('; ')}`
      } catch (e) {
        cardReason = `${DESIGN_INSPIRATION_FILE} could not be read: ${e instanceof Error ? e.message : String(e)}`
      }
    }
    // The template's pages, REPLACED on every read (unlike a questionnaire): the list says what the
    // release carries now, and a file taken off the release takes its pages with it.
    const { pages, pagesReason } = setting
      ? await readSitePages(assets.find((a) => a.name === SITE_PAGES_FILE) ?? null, read)
      : { pages: null, pagesReason: null }
    readings.push({
      reading: {
        ...readingOf(release, setting, reason, { inspiration, cardReason, pages, pagesReason }),
        settingUnread
      },
      questions
    })
  }
  return { readings, complete, limited }
}

/** The identity of a released questionnaire: the bytes it arrived as. */
/**
 * File name → the sha256 GitHub states for that asset. Only assets that carry a `sha256:` digest
 * appear: an older asset, or an API that leaves the field out, is simply not checked.
 * @param {{ name: string, digest?: string | null }[]} assets
 */
export function digestsOf(assets) {
  const out = new Map()
  for (const a of assets) {
    const m = typeof a.digest === 'string' ? /^sha256:([a-f0-9]{64})$/.exec(a.digest) : null
    if (m) out.set(a.name, m[1])
  }
  return out
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Read GitHub and write the answer down. A failed read changes nothing; an unchanged list (304)
 * rewrites no row, only the time it was confirmed.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @param {{ token: string, fetchImpl?: typeof fetch, repo?: string, cache?: import('./github-read-budget.js').ReleaseReadCache }} opts
 */
export async function syncReleases(
  pool,
  { token, fetchImpl = fetch, repo = RELEASES_REPO, cache = sharedReleaseReadCache }
) {
  let list
  let read
  try {
    list = await listReleases({ token, fetchImpl, repo, cache })
    if (list.unchanged) {
      await pool.query(`update quickstart_releases set fetched_at = now() where tag not like $1`, [
        `${LOCAL_TAG_NAMESPACE}%`
      ])
      return { ok: true, count: list.releases.length, unchanged: true }
    }
    read = await readingsOf(list.releases, { token, fetchImpl, cache })
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : String(e),
      ...(e instanceof GithubRateLimited ? { deferredUntil: new Date(e.resetMs).toISOString() } : {})
    }
  }
  await writeReadings(pool, read.readings)
  if (read.complete) list.commit()
  return {
    ok: true,
    count: read.readings.length,
    ...(read.limited ? { partial: read.limited.message } : {})
  }
}

/**
 * Write readings down: one row per release, and each released questionnaire not seen before as a
 * candidate. Shared by the GitHub read and the local one, so a pack is stored exactly as a release.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @param {{ reading: any, questions: any }[]} readings
 */
async function writeReadings(pool, readings) {
  const known = new Set(
    (await pool.query('select id, owner, sha256, source from question_set')).rows
      .filter((r) => r.source === 'released')
      .map((r) => `${r.owner} ${r.sha256}`)
  )
  // 🔒 A PASSING REFUSAL KEEPS THE CATALOGUE. GitHub's secondary rate limit answers 403 for every
  // asset of one read (95 of them, one restart of tracy-web); writing those readings down emptied
  // every `setting` at once and no site could be created until the next good read (18/10/2026).
  // A row that already has a setting keeps it, with its reason, card and pages, when this read
  // could not fetch the file — a 404 or a refused file still replaces it.
  const kept = new Map(
    (await pool.query('select tag, setting, inspiration, pages, tracy, reason from quickstart_releases')).rows
      .filter((r) => r.setting)
      .map((r) => [r.tag, r])
  )
  const parsed = (v) => (typeof v === 'string' ? JSON.parse(v) : v)
  for (const entry of readings) {
    const { questions } = entry
    let { reading } = entry
    const previous = reading.settingUnread ? kept.get(reading.tag) : undefined
    if (previous) {
      reading = {
        ...reading,
        setting: parsed(previous.setting),
        inspiration: parsed(previous.inspiration),
        pages: parsed(previous.pages),
        tracy: previous.tracy,
        reason: previous.reason
      }
    }
    await pool.query(
      `insert into quickstart_releases (tag, release, setting, inspiration, tracy, reason, inspiration_hidden, pages, fetched_at)
       values ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6, $7, $8::jsonb, now())
       on conflict (tag) do update set release = excluded.release, setting = excluded.setting,
         inspiration = excluded.inspiration, tracy = excluded.tracy, reason = excluded.reason,
         inspiration_hidden = excluded.inspiration_hidden, pages = excluded.pages, fetched_at = excluded.fetched_at`,
      [
        reading.tag,
        JSON.stringify({
          name: reading.name,
          kind: reading.kind,
          github: reading.github,
          publishedAt: reading.publishedAt,
          assets: reading.assets,
          archived: reading.archived === true,
          ...(reading.local ? { local: reading.local } : {})
        }),
        reading.setting ? JSON.stringify(reading.setting) : null,
        reading.inspiration ? JSON.stringify(reading.inspiration) : null,
        reading.tracy,
        reading.reason,
        reading.inspirationHidden,
        reading.pages ? JSON.stringify(reading.pages) : null
      ]
    )
    if (!questions) continue
    const key = `${reading.tag} ${questions.sha256}`
    if (known.has(key)) continue
    known.add(key)
    // 🔒 NO CONFLICT TARGET: A SET ANOTHER READ JUST WROTE IS A NO-OP ON EITHER UNIQUE INDEX. `known`
    // is read once, before the loop, so two refreshes at once (the startup read in cron and a
    // Refresh press in /ops, measured right after boot on 21/10/2026) both miss the same set and
    // both insert it. With `on conflict (id)` the second one still raised 23505 on
    // `question_set_released` (owner, sha256) and the door answered 500. Postgres takes one target
    // at most; with none, every unique index of the table arbitrates, and `do nothing` is right for
    // both: the row they name is this very set.
    await pool.query(
      `insert into question_set (id, owner, name, source, version, sha256, doc)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb) on conflict do nothing`,
      [
        `${reading.tag}@${questions.sha256.slice(0, 12)}`,
        reading.tag,
        `Released ${questions.version}`,
        'released',
        questions.version,
        questions.sha256,
        JSON.stringify(questions.doc)
      ]
    )
  }
}

/**
 * Read the packs under `TRACY_LOCAL_RELEASES_DIR` and write them down beside the releases
 * (`local-releases.js` says what a pack is and why it is dev-only).
 *
 * The local rows are REPLACED as a set: a pack removed from the folder leaves the list on the next
 * read, and a stand whose variable was unset loses every local row — a row that outlived its folder
 * would offer a card nothing can be built from. A folder that cannot be read at all changes nothing,
 * as a failed GitHub read does.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[], rowCount?: number | null }> }} pool
 * @param {string | null} dir
 */
export async function syncLocalReleases(pool, dir, { log = console } = {}) {
  if (!dir) {
    await pool.query('delete from quickstart_releases where tag like $1', [`${LOCAL_TAG_NAMESPACE}%`])
    return null
  }
  let packs
  try {
    packs = await readLocalPacks(dir)
  } catch (e) {
    const reason = `local releases in ${dir} could not be read: ${e instanceof Error ? e.message : String(e)}`
    log.warn?.(`[releases] ${reason}`)
    return { ok: false, reason }
  }
  const readings = packs.map((p) => ({
    reading: readingOf(p.release, p.setting, p.reason, {
      inspiration: p.inspiration,
      cardReason: p.cardReason,
      pages: p.pages,
      pagesReason: p.pagesReason
    }),
    questions: p.questions
  }))
  await writeReadings(pool, readings)
  await pool.query('delete from quickstart_releases where tag like $1 and not (tag = any($2::text[]))', [
    `${LOCAL_TAG_NAMESPACE}%`,
    readings.map((r) => r.reading.tag)
  ])
  // The card's pictures, into the store every card is drawn from — written only when the bytes
  // changed, so a read every ten minutes does not rewrite megabytes that are already there.
  const shots = packs.flatMap((p) => p.shots)
  const held = await shotFilesFor(
    pool,
    shots.map((s) => s.templateId)
  )
  for (const shot of shots) {
    try {
      // eslint-disable-next-line no-await-in-loop -- a few pictures, one at a time.
      const bytes = await readFile(shot.path)
      const digest = createHash('sha256').update(bytes).digest('hex')
      if (held.get(shot.templateId)?.get(shot.file) === digest) continue
      // eslint-disable-next-line no-await-in-loop -- same.
      await putShot(pool, { templateId: shot.templateId, file: shot.file, bytes })
    } catch (e) {
      log.warn?.(`[releases] local picture ${shot.file}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  log.log?.(`[releases] ${readings.length} local pack(s) read from ${dir}`)
  return { ok: true, count: readings.length }
}

/**
 * The releases as last read.
 *
 * 🔒 AN ARCHIVED RELEASE (`ARCHIVED_FILE`) IS NOT HERE unless `includeArchived` asks for it: every
 * list, card and create door reads this function, so leaving the row out here is what takes it off
 * all of them at once. With `includeArchived` it comes back marked `archived` and never `choosable`.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @param {{ platform?: string, choosable?: boolean, includeArchived?: boolean }} [filter]
 */
export async function readReleases(pool, { platform, choosable, includeArchived = false } = {}) {
  const { rows } = await pool.query(
    'select tag, release, setting, inspiration, inspiration_hidden, pages, tracy, reason, fetched_at from quickstart_releases'
  )
  return rows
    .map((row) => {
      const release = typeof row.release === 'string' ? JSON.parse(row.release) : row.release
      // Rows stored before 27/09/2026 hold the setting as the release published it.
      const setting = normalizeSetting(
        typeof row.setting === 'string' ? JSON.parse(row.setting) : row.setting
      )
      const inspiration = typeof row.inspiration === 'string' ? JSON.parse(row.inspiration) : row.inspiration
      const pages = typeof row.pages === 'string' ? JSON.parse(row.pages) : row.pages
      // The flag the copy wrote, or the asset itself on a row written before the flag existed.
      const archived = release.archived === true || archivedBy(release.assets)
      return {
        tag: row.tag,
        name: release.name,
        kind: release.kind,
        github: release.github,
        tracy: row.tracy,
        reason: row.reason,
        publishedAt: release.publishedAt,
        assets: release.assets ?? [],
        setting: setting ?? null,
        inspiration: inspiration ?? null,
        inspirationHidden: row.inspiration_hidden === true,
        // The template's pages as its release ships them (`tracy_site_pages.json`); read with `pagesOf`.
        pages: Array.isArray(pages) ? pages : null,
        fetchedAt: row.fetched_at,
        // Where a local pack lies (`local-releases.js`); null for every release read off GitHub.
        local: release.local ?? null,
        archived,
        choosable:
          release.kind === 'quickstart' && release.github !== 'draft' && !archived && Boolean(setting),
        // Without a setting the tag is the only hint of a CMS — enough to sort a list by, never
        // enough to install from, and the screen marks it as a guess.
        platform: setting?.platform ?? platformOfTag(row.tag),
        platformFromTag: !setting
      }
    })
    .filter((r) => includeArchived || !r.archived)
    .filter((r) => (platform ? r.platform === platform : true))
    .filter((r) => (choosable ? r.choosable : true))
    .sort(
      (a, b) =>
        String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')) ||
        // 🔒 A TIE IS BROKEN HERE, NOT BY THE TABLE. Rows with the same date (every local pack and
        // every draft has none) used to come out in whatever order Postgres returned them, and a
        // table that has seen deletes hands back a new row in a freed slot, ahead of older ones:
        // the "(local)" card then jumped ahead of the published card it shadows. A local pack sorts
        // after every release read off GitHub (`local-releases.js`), then by tag.
        Number(Boolean(a.local)) - Number(Boolean(b.local)) ||
        a.tag.localeCompare(b.tag)
    )
}

/** Which CMS a tag suggests when no file says: Tracy's own naming, nothing more. */
export function platformOfTag(tag) {
  if (/\/j\d+$/.test(tag)) return 'joomla'
  if (/\/wp\d+$/.test(tag)) return 'wordpress'
  if (/emdash/.test(tag)) return 'emdash'
  return null
}

/**
 * What the host needs to install one quickstart: the entry shape `quickstart.py` already reads,
 * composed from the setting and the tag. The download address is built here, from the tag and the
 * file name — a setting cannot point a host anywhere else.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @param {string} tag
 */
export async function resolveInstall(pool, tag, { repo = RELEASES_REPO, pinsFile } = {}) {
  const [row] = (await readReleases(pool)).filter((r) => r.tag === tag)
  if (!row || !row.setting) return null
  const entry = { platform: row.setting.platform, version: row.setting.version, format: 'tracy-setting/v1' }
  for (const [part, file] of Object.entries(row.setting.install)) {
    // A local pack is read off this machine: a `file:` address inside the pack's folder, its size
    // and checksum confirmed against the bytes as they are now. No asset id, so no credential —
    // and the host reads such an address only from under its own TRACY_LOCAL_RELEASES_DIR.
    if (row.local?.dir && isLocalTag(tag)) {
      // eslint-disable-next-line no-await-in-loop -- two or three parts.
      entry[part] = await localInstallPart(row.local.dir, file)
      continue
    }
    // The asset list is the release's own: the setting names the file, GitHub says how big it is
    // and under which id the host may fetch it. A name the release does not carry stays unpinned
    // (`bytes: null`), and the host refuses it before any download — never a silent 404 mid-way.
    const asset = row.assets.find((a) => a.name === file.file)
    entry[part] = {
      file: file.file,
      sha256: file.sha256,
      bytes: asset?.size ?? null,
      githubAssetId: asset?.id ?? null,
      url: `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${file.file}`
    }
  }
  if (row.setting.template) entry.template = { id: row.setting.template }
  // 🔒 THE SEAL TRAVELS WITH THE ENTRY, and it is read here rather than carried by the release.
  // `provision.sh` asks `quickstart.py --field contract` for it and `platform/<cms>.sh` writes it
  // into `.content-contracts/<label>.json`; an entry that reaches the fleet without it provisions a
  // site with NO contract — the state in which the Claude Cowork plugin accepts structural writes. Which
  // contract that is, is a fact this repository owns (the profiles say which quickstart they seal),
  // not one the publisher of a release declares. A local pack is sealed as the release it stands
  // for (`publishedTagOf`, applied inside `contractFor` and `coworkPinFor`).
  const sealed = contractFor(contracts(), tag, row.setting.version)
  if (sealed) {
    entry.contract = sealed.id
    if (sealed.coworkMinVersion) entry.coworkMinVersion = sealed.coworkMinVersion
    // The Claude Cowork plugin the seal pins (see `coworkPinFor`): the release's own `install.cowork` wins
    // when it carries one; otherwise the pin this repository records for that release and version.
    //
    // ⚠ UNLESS THE PIN SAYS IT OVERRIDES THE RELEASE (`overridesRelease: true`). Measured 25/09/2026
    // on the dev machine (`capij1510`): `tracy-business/j6` carries `pkg_claudecowork-0.17.4.zip`, so
    // the 0.18.0-rc.1 this repository pins on develop never reached a site and `content.read`
    // answered 501. Flipping the order for every pin is not safe: `main` pins j6 at 0.17.2 while its
    // release carries 0.17.4, and that pin winning would downgrade new production sites. So the pin
    // that must win says so, and every other pin keeps the old order.
    const chosen = installedCowork(entry.cowork, coworkPinFor(tag, row.setting.version, pinsFile))
    if (chosen) entry.cowork = chosen.cowork
  }
  return entry
}

/**
 * Read the releases repository and write the answer down — the one call both the schedule and the
 * Refresh press make.
 *
 * It lives here rather than in `cron.js` so the `ops` domain can make it without importing a
 * top-level module (`test/module-graph.test.mjs`: ops imports `lib/`, `db/` and itself). Says
 * nothing when this deployment has no way in: that is a configuration, not a fault, and the screen
 * reports it where a person can act on it.
 */
export async function refreshReleases(
  pool,
  config,
  { fetchImpl = fetch, log = console, cache = sharedReleaseReadCache, now = Date.now } = {}
) {
  // The local packs first, and whatever GitHub answers: a stand trying a pack that is not
  // published may well have no way into the releases repository at all.
  const local = await syncLocalReleases(pool, config.localReleasesDir ?? null, { log })
  const localCount = local?.ok ? { local: local.count } : {}
  // A token low on quota is shared with provisioning (the host downloads the quickstart with it):
  // the sweep steps aside until the reset rather than spend what is left.
  const until = deferredUntil(cache, now())
  if (until !== null) {
    const at = new Date(until).toISOString()
    const reason = `GitHub rate limit low (${cache.rate?.remaining}/${cache.rate?.limit} left); next read after ${at}`
    if (cache.deferralLogged !== until) {
      cache.deferralLogged = until
      log.warn?.(`[releases] ${reason}`)
    }
    return { ok: false, reason, deferredUntil: at, ...localCount }
  }
  const { token, reason } = await releasesToken(config, fetchImpl)
  if (!token) return { ok: false, reason, ...localCount }
  // Wire the hook on the way past, once the App has answered at all — the same self-repair the
  // site repos get (`ensureRepoWebhook` is idempotent by URL). Without the App there is no hook to
  // wire and the ten-minute sweep is the whole of the freshness.
  if (config.github && !wired) {
    wired = true
    ensureRepoWebhook(
      config.github,
      RELEASES_REPO,
      { url: `${config.origin}/github/release`, secret: config.github.webhookSecret },
      fetchImpl
    )
      .then((r) => {
        if (!r.ok) log.warn?.(`[releases] no webhook on ${RELEASES_REPO}: ${r.reason}`)
      })
      .catch(() => {})
  }
  const result = await syncReleases(pool, { token, fetchImpl, cache })
  if (!result.ok) log.warn?.(`[releases] ${result.reason}`)
  else if (result.partial)
    log.warn?.(`[releases] ${result.count} read, some files skipped: ${result.partial}`)
  else if (!result.unchanged) log.log?.(`[releases] ${result.count} read from ${RELEASES_REPO}`)
  return { ...result, ...localCount }
}

/**
 * The Design inspiration card a release carries, in whichever of the two shapes it is in.
 *
 * 🔒 THE FILE WINS OVER THE BLOCK, and both are read on purpose. `tracy_design_inspiration.json` is
 * what an administrator edits from the operations page; the `card` block inside `tracy_setting.json`
 * is what three releases cut before 16/09 still carry, and they keep working until they are cut
 * again. A release carrying both is a release mid-transition, and the file is the newer truth.
 * @param {any} release from `readReleases`
 */
export function cardOf(release) {
  return release?.inspiration ?? release?.setting?.card ?? null
}

/**
 * The card Design inspiration shows for this release, or null when it shows none.
 *
 * 🔒 ONLY THE LISTING ASKS THIS. A release carrying `DESIGN_INSPIRATION_HIDDEN_FILE` is off the
 * shelf, but it is still a template: "Create with Tracy" on its demo and site creation from it keep
 * reading `cardOf`. Hiding it there too would break sites customers already started from it.
 * @param {any} release from `readReleases`
 */
export function shownCardOf(release) {
  return release?.inspirationHidden ? null : cardOf(release)
}

/**
 * Does this release put a card on Design inspiration for customers on this server?
 *
 * 🔒 ONE PREDICATE, TWO READERS (Lee, 04/10/2026). `templateCards` — what `GET /api/templates`
 * hands every customer — and `inspirationState` — the column and the operations screen — both ask
 * THIS, so no release can be on a customer's shelf while the operations page calls it off, or the
 * other way round. Before 04/10 the column had its own stricter rule (pictures held, a live demo, a
 * `tracy === 'ready'`) and called `tracy/wp7` "not on Design inspiration" while every customer saw it.
 *
 * The rule is the customer's: a release that can be chosen (`choosable`), whose card was not
 * unpublished, and whose card is filed under a template (`card.template`, else the setting's). Missing
 * pictures or demos are warnings the column states, never a reason the card is off.
 * @param {any} release from `readReleases`
 * @returns {boolean}
 */
export function shownOnInspiration(release) {
  return Boolean(release?.choosable && shownCardOf(release) && cardTemplateOf(release))
}

/**
 * The template id this release's card is filed under, or null when it carries no card.
 *
 * 🔒 ONE ANSWER FOR THE SHELF AND FOR CREATION. The card's own `template` wins; a card block left
 * inside `tracy_setting.json` may not repeat it, and then the setting's `template` names it
 * (tracy-saas/emdash-0.x does exactly that). Before 08/10/2026 the listing read this fallback while
 * `templateRelease`, `templateOfTag` and `isTemplateId` did not, so a press naming such a template
 * was taken for a design and the default EmDash base was built in its place, silently (#1013).
 * @param {any} release from `readReleases`
 * @returns {string | null}
 */
export function cardTemplateOf(release) {
  const card = cardOf(release)
  if (!card) return null
  const id = card.template ?? release?.setting?.template
  return typeof id === 'string' && id !== '' ? id : null
}

/**
 * The id this release's pictures and card live under on this server, normalised (`templateIdOf`),
 * or null when it names none.
 *
 * 🔒 THE CUSTOMER CARD'S ID, NOT THE INSTALL FILE'S (10/10/2026). A release carrying a card is keyed
 * by `cardTemplateOf`, the id `GET /api/templates` hands customers and serves pictures under. Its
 * install file may say otherwise: `tracy-base/wp7` says `template: "tracy-base"` while its card is
 * the `tracy` one, and the operations page keyed by the install file asked for
 * `/api/templates/tracy-base/shots/…` that no store holds. A release with no card yet has only its
 * install file to be filed under, so that is the fallback.
 * @param {any} release from `readReleases`
 * @returns {string | null}
 */
export function cardIdOf(release) {
  return templateIdOf(cardTemplateOf(release) ?? release?.setting?.template)
}

/**
 * Which release installs this TEMPLATE on this platform, or null.
 *
 * A template is a finished site a customer picked off Design inspiration, and the press carries its
 * id as `design`. Reading it off the releases keeps one source: before ADR 0017 the same question
 * was answered from the catalogue file, which could name a template no release had.
 * @param {any[]} releases from `readReleases`
 */
export function templateRelease(releases, platform, templateId) {
  if (typeof templateId !== 'string' || templateId === '') return null
  const hit = releases.find((r) => r.choosable && r.platform === platform && cardTemplateOf(r) === templateId)
  return hit?.tag ?? null
}

/**
 * The template card id of the release tagged `tag`, or null when that release is not a Tracy
 * template (a JoomlArt quickstart carries no card) or cannot be installed.
 * @param {any[]} releases from `readReleases`
 * @param {string} tag
 */
export function templateOfTag(releases, tag) {
  const hit = releases.find((r) => r.tag === tag && r.choosable)
  return hit ? cardTemplateOf(hit) : null
}

/** Is this id a template some readable release installs, on any platform? */
export function isTemplateId(releases, id) {
  return typeof id === 'string' && id !== '' && releases.some((r) => cardTemplateOf(r) === id)
}

/**
 * Is this webhook delivery a reason to read the releases again?
 *
 * Only a `release` event, only on the repository the quickstarts live in. A push is the other
 * webhook on the same door (`/github/push`, the push police) and starting a GitHub read from it
 * would tie two unrelated features together — the quickstart list would refresh every time a
 * customer's site pushed a commit.
 * @param {string | null} event the `x-github-event` header
 * @param {any} payload
 */
export function releaseEventWanted(event, payload, repo = RELEASES_REPO) {
  return event === 'release' && payload?.repository?.full_name === repo
}

/**
 * Which release's card a customer sees for each template: template id → the tag whose card
 * (blurb, category, image, layouts…) `templateCards` hands out.
 *
 * 🔒 ONE RULE, TWO READERS (10/10/2026). One template is one card on Design inspiration, however
 * many CMSes build it, and the card content comes from ONE release: the FIRST shown release
 * (`shownOnInspiration`) in the order `readReleases` returns them — newest `publishedAt` first,
 * a local pack after every GitHub release, then by tag. The other shown releases only add their
 * platform. `templateCards` reads this map to pick that release, and `GET /api/ops/quickstarts`
 * reads it to say which CMS chip is the one customers see, so the two cannot disagree.
 * @param {any[]} releases from `readReleases`, in its order
 * @returns {Map<string, string>}
 */
export function cardSources(releases) {
  /** @type {Map<string, string>} */
  const out = new Map()
  for (const r of releases) {
    if (!shownOnInspiration(r)) continue
    const id = /** @type {string} */ (cardTemplateOf(r))
    if (!out.has(id)) out.set(id, r.tag)
  }
  return out
}

/**
 * The finished sites Design inspiration can offer — ONE card per template, however many CMSes
 * build it.
 *
 * `tracy-business/j6` and `tracy-business/emdash-0.x` are one site in two archives: two cards would
 * make a customer pick a CMS before they picked a site (the rule `templates.mjs` already states on
 * the plugin side). A template whose releases are all drafts or unreadable is not offered at all —
 * the same `choosable` rule a build base answers to, for the same reason. A release an operator
 * unpublished is skipped (`shownCardOf`); the template's other releases still draw its card.
 * The preview a card frames is the LIVE demo when one is up (`lib/demo-sites.js`): those are the
 * bytes the fleet installs, at the version it installs them. `tracy_design_inspiration.json` carries
 * no demo of its own — a release cut before 16/09 may still have one inside its `card` block, and
 * that one stands in on a server with no demo host.
 * 🔒 THE DESIGN SYSTEM A CARD WEARS IS JOINED HERE, NOT WRITTEN ON THE RELEASE (Lee, 29/09/2026).
 * The sealing profile (`design.json` beside its manifest) is the one place that names it
 * (`readContracts`); the card file carries no design id, so there is nothing on GitHub to drift
 * from the repository. One card is several archives (`tracy-business/j6` + `/emdash-0.x`): an
 * archive with no contract, or a contract naming no design, says nothing; two archives naming two
 * DIFFERENT designs is a conflict the card states (`designConflict`) rather than a coin toss on
 * which platform was read first.
 * @param {any[]} releases from `readReleases`
 * @param {Map<string, {url: string, version: string | null}>} [live] demos up right now, by tag
 * @param {import('./contracts.js').ContractIndex} [contracts] the profiles, for the design each names
 */
export function templateCards(releases, live = new Map(), contracts = new Map()) {
  /** @type {Map<string, any>} */
  const byTemplate = new Map()
  const sources = cardSources(releases)
  for (const r of releases) {
    if (!shownOnInspiration(r)) continue
    const card = shownCardOf(r)
    const id = /** @type {string} */ (cardTemplateOf(r))
    const platform = {
      platform: r.platform,
      tag: r.tag,
      version: r.setting.version,
      release: quickstartReleaseIdentity(r.setting),
      demo: live.get(r.tag) ?? null
    }
    const design = contractFor(contracts, r.tag, r.setting?.version)?.design ?? null
    // What a site built from THIS archive wears (`wears`): its own profile's look. A catalogue system the
    // card settles on is laid over the archives nothing seals in the last pass below — the create door's
    // rule (`designOfRelease` ?? `templateDesign`), so a brief and the site's record say the same thing.
    platform.wears = wornOf(design)
    // The source release opens the template's entry; every other shown release only adds a platform.
    const existing = sources.get(id) === r.tag ? undefined : byTemplate.get(id)
    if (existing) {
      existing.platforms.push(platform)
      if (design !== null) {
        if (existing.design === null && existing.designConflict !== true) existing.design = design
        else if (existing.design !== null && existing.design.id !== design.id) {
          existing.design = null
          existing.designConflict = true
        }
      }
      continue
    }
    // A local pack's card is its own (`local-<template>`), and says so where a person reads it.
    byTemplate.set(id, {
      id,
      label: r.local ? `${r.setting.label} (local)` : r.setting.label,
      card,
      platforms: [platform],
      design,
      ...(r.local ? { local: true } : {})
    })
  }
  for (const t of byTemplate.values()) {
    if (t.design?.source === 'catalog')
      for (const p of t.platforms) if (p.wears === null) p.wears = wornOf(t.design)
    const shown = t.platforms.find((p) => p.demo)
    if (!shown) continue
    t.card = { ...t.card, demo: shown.demo }
    if (Array.isArray(t.card.layouts)) t.card.layouts = joomlaAddresses(t.card.layouts, shown.platform)
  }
  return [...byTemplate.values()]
}

/**
 * The template ids Design inspiration offers on this server: the `id` of every card
 * `GET /api/templates` answers. Read from `templateCards`, the same function that door uses, so the
 * JoomlArt demo banner (`lib/build-with-tracy-demo.js`) can never offer a card the gallery lacks.
 * Which demos are live and which design a card wears change what a card shows, never whether it is
 * there, so neither is read here.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @returns {Promise<string[]>}
 */
export async function inspirationTemplateIds(pool) {
  return templateCards(await readReleases(pool)).map((t) => t.id)
}

/**
 * What an archive's site wears, as a card says it: name included, tokens never (they stay the record's).
 * @param {import('./contracts.js').ContractDesign | null} design
 * @returns {{ id: string, source: string, name: string | null } | null}
 */
function wornOf(design) {
  if (!design) return null
  const name = design.source === 'quickstart' ? design.name : nameFor(design.id)
  return { id: design.id, source: design.source, name: name ?? null }
}

/**
 * A card's design as the gallery shows it: which system, and where it comes from. A quickstart
 * look carries its whole token map for the build plan (`templateDesign`); a card read on every lane
 * that opens the gallery has no use for it, so `GET /api/templates` answers with this instead.
 * @param {import('./contracts.js').ContractDesign | null | undefined} design
 * @returns {{ id: string, source: string } | null}
 */
export function shownDesign(design) {
  return design ? { id: design.id, source: design.source } : null
}

/**
 * The design system a TEMPLATE wears, read off its card: the profiles of all its archives, joined
 * the way `templateCards` joins them (an archive with no profile says nothing; two archives naming
 * different systems is null). The fallback for a press on a platform whose release nothing seals —
 * measured 29/09/2026 on the local stand: `tracy-base/wp7@1.1.1` had no profile (1.0.0 and 1.1.0 do),
 * so the WordPress press recorded "wears none" while the card, joined from the Joomla archive, said
 * Apple. One card is one site in several archives; what it wears does not change with the CMS.
 *
 * 🔒 ONLY A CATALOGUE SYSTEM FALLS BACK. A `quickstart` look carries ONE CMS's token values, read
 * off that archive's own token file: `tracy-business/j6` and `/wp7` share the id and differ
 * (`--surface` #EDEAE2 on Joomla, #ffffff on WordPress). Handed to a press on another platform —
 * EmDash, or a version with no `.design.json` — it records values that site does not wear, and the
 * design check then measures it against the wrong ruler. A quickstart look is used only for the
 * release whose profile declared it (`designOfRelease`); here it answers null.
 * @param {any[]} readable rows from `readReleases`
 * @param {unknown} templateId the card id the press named
 * @param {import('./contracts.js').ContractIndex} contracts
 * @returns {import('./contracts.js').ContractDesign | null}
 */
export function templateDesign(readable, templateId, contracts) {
  if (typeof templateId !== 'string') return null
  const design = templateCards(readable, new Map(), contracts).find((c) => c.id === templateId)?.design
  return design?.source === 'catalog' ? design : null
}

/**
 * The layouts a Joomla demo is framed at, each with the address it actually answers at.
 *
 * 🔒 A JOOMLA PAGE ALWAYS ANSWERS AT `/index.php/<path>`; `/<path>` ONLY WHEN REWRITING IS ON. Every
 * demo Tracy provisions runs SEF on and rewriting off, so a layout that carries only its `path`
 * frames Apache's 404. Cards generated after 18/09 carry `address` from the outline
 * (`tracy-host` `browser.js`), but a card published before that — or a row added by hand in the
 * editor — does not: measured 22/09 on dev, ja-vogue and ja-voyara had 0 addresses on 5 sub-pages
 * each, and `ja-vogue-joomla.tracy.site/about` answered 404 while `/index.php/about` answered 200.
 * The front controller is not a guess about one demo's rules: it is how Joomla routes, and a demo
 * with rewriting ON answers `/index.php/<path>` too (measured on base-joomla: both 200). A layout
 * that already names its address, and the home page, are left alone.
 * @param {unknown} layouts
 * @param {string} platform the platform of the demo the preview frames
 */
export function joomlaAddresses(layouts, platform) {
  if (platform !== 'joomla' || !Array.isArray(layouts)) return layouts
  return layouts.map((/** @type {any} */ l) => {
    const path = typeof l?.path === 'string' ? l.path : ''
    if (
      typeof l?.address === 'string' ||
      !path.startsWith('/') ||
      path === '/' ||
      /^\/index\.php(?=[/?]|$)/.test(path)
    )
      return l
    // `/?option=…` is a SEF-off page named by its query; its address is the query on the front controller.
    return { ...l, address: path.startsWith('/?') ? `/index.php${path.slice(1)}` : `/index.php${path}` }
  })
}
