/**
 * Quickstart packs that are NOT on GitHub yet, read off a directory of this machine — a dev stand's
 * way to try a pack through the exact road a customer takes, before anybody cuts a release.
 *
 * `TRACY_LOCAL_RELEASES_DIR=<dir>` holds one folder per pack, spelled as the release tag it is a
 * candidate for: `<dir>/<slug>/<cms>/` for a Tracy release (`tracy-business/j6`) and
 * `<dir>/quickstart/<slug>/<cms>/` for a JoomlArt one (`quickstart/ja-essence/j6`), carrying the
 * files a release on `joomlart-products` would carry: `tracy_setting.json`, optionally
 * `tracy_design_inspiration.json`, `tracy_site_question.json` and `tracy_site_pages.json`, the card's pictures, and every file
 * the setting's `install` names. Each pack becomes one row of `quickstart_releases` under the tag
 * `local/` + that release tag, held to the SAME validators a release is (ADR 0017), so a pack that reads
 * here is a pack that will read once it is published.
 *
 * 🔒 A LOCAL PACK NEVER STANDS IN FOR A PUBLISHED ONE. Its tag carries the `local/` prefix and its
 * Design inspiration card carries the id `local-<slug>` (the pack's own release slug, see `readPack`) with
 * "(local)" in its label, so the
 * gallery shows it as a card of its own beside the published card, and "Create with" on the
 * published card still installs the published release. Replacing the published edition in place
 * would make a stand quietly build something no customer can get.
 *
 * 🔒 DEV ONLY, AND REFUSED RATHER THAN IGNORED ELSEWHERE. `config.js` refuses to boot with the
 * variable set on a production runtime or a public origin; `tracy-host` refuses it unless
 * `NODE_ENV=development`; and `quickstart.py` reads a `file:` address only from under this same
 * directory, so a row that outlived its stand still cannot make a host read anything else.
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { validateQuestions } from './questions-schema.mjs'
import { readSitePages, SITE_PAGES_FILE } from './site-pages-schema.mjs'
import { shotProblem, templateIdOf } from './template-shots.js'
import { validateDesignInspiration, validateSetting } from './tracy-setting.mjs'

/** What every local pack's tag starts with — the one mark every reader tells it apart by. */
export const LOCAL_TAG_NAMESPACE = 'local/'

/**
 * The top folder that holds JoomlArt packs, as their release tags do (`quickstart/ja-essence/j6`).
 * Without it a JA pack read as `local/ja-essence/j6` stood for a release that does not exist, so it
 * found no contract and no Claude Cowork pin and installed unsealed.
 */
export const JOOMLART_TAG_NAMESPACE = 'quickstart'

/** One path segment of a pack: the same characters a release tag is spelled with, no path. */
const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/

/** @param {unknown} tag */
export function isLocalTag(tag) {
  return typeof tag === 'string' && tag.startsWith(LOCAL_TAG_NAMESPACE)
}

/**
 * The tag a local pack would carry once published: `local/tracy-business/j6` → `tracy-business/j6`,
 * `local/quickstart/ja-essence/j6` → `quickstart/ja-essence/j6`.
 *
 * This is what a contract profile and a Claude Cowork plugin pin are looked up by (`contracts.js`): a pack is
 * sealed exactly as the release it is a candidate for would be at the same version, so trying it
 * locally tries the site a customer would get. A slug no release uses (`tracy-business-next`) has
 * no profile, and is installed as a template card is — as released, sealed by nothing.
 * @param {string} tag
 */
export function publishedTagOf(tag) {
  return isLocalTag(tag) ? tag.slice(LOCAL_TAG_NAMESPACE.length) : tag
}

/**
 * The EmDash template id a release tag names: the first segment of the tag the release is, or stands for
 * (`tracy-business/emdash-0.x` and `local/tracy-business/emdash-0.x` → `tracy-business`). The ONE place that
 * reads it, so a local pack is never taken for a template called "local". Empty for a tag that is not a string.
 * @param {unknown} tag
 */
export function emdashTemplateIdOf(tag) {
  return typeof tag === 'string' ? publishedTagOf(tag).split('/')[0] : ''
}

/**
 * The card id a local pack is offered under: `tracy-business` → `local-tracy-business`.
 * @param {unknown} template the pack's release slug (`readPack` keys every pack by it)
 * @returns {string | null}
 */
export function localTemplateId(template) {
  const id = templateIdOf(template)
  return id ? `local-${id}` : null
}

/**
 * sha256 of one file, remembered by path, size and modification time: the stand re-reads its packs
 * every ten minutes, and a 100 MB webroot hashed that often is a laptop fan, not a check.
 */
const digestCache = new Map()

/** @param {string} file */
export async function fileSha256(file) {
  const info = await stat(file)
  const key = `${file}\0${info.size}\0${info.mtimeMs}`
  const known = digestCache.get(key)
  if (known) return known
  const hash = createHash('sha256')
  await new Promise((resolve, reject) => {
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', resolve)
      .on('error', reject)
  })
  const digest = hash.digest('hex')
  digestCache.set(key, digest)
  return digest
}

/** @param {string} dir */
async function subdirectories(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((e) => e.isDirectory() && SEGMENT.test(e.name))
    .map((e) => e.name)
    .sort()
}

/** The picture names a card draws: its thumbnail and every layout's shots. */
function picturesOf(card) {
  const names = new Set()
  if (typeof card?.image === 'string') names.add(card.image)
  for (const layout of Array.isArray(card?.layouts) ? card.layouts : [])
    for (const file of Object.values(layout?.shots ?? {})) if (typeof file === 'string') names.add(file)
  return [...names]
}

/**
 * The card a pack carrying none is offered under, so the stand can build it the way a customer
 * presses a card (16/10/2026). A release with no card of its own (`tracy-apple/j6`: customers reach
 * it through the registry design `apple`, which pins the PUBLISHED version) would otherwise leave its
 * local pack with no road at all: no card to press, and the design plan refuses any other quickstart.
 * Local packs only, so the published shelf never grows a card nobody wrote. No picture: the card
 * says plainly that it is a stand-in.
 * @param {any} setting the pack's validated `tracy_setting.json`
 */
function standInCard(setting) {
  return {
    schemaVersion: 'tracy-design-inspiration/v1',
    template: setting.template,
    provider: 'Tracy',
    category: 'Local packs',
    blurb: `${setting.label} ${setting.version}, a local pack that carries no Design inspiration card of its own.`,
    layouts: [{ key: 'home', label: 'Home', path: '/', shots: {} }]
  }
}

/**
 * One pack, read the way `fetchReleases` reads one release — and answered in the same shape, a
 * GitHub-like release plus what Tracy made of it, so `readingOf` turns both into one kind of row.
 *
 * 🔒 A LOCAL CARD IS KEYED BY THE PACK'S RELEASE SLUG, NOT BY THE TEMPLATE ITS CARD NAMES (16/10/2026).
 * Several releases are one template element dressed differently (`tracy-base/j6` and `tracy-apple/j6`
 * both carry the card template `tracy`): keyed by the card's template, two packs collapsed into one
 * `local-tracy` card, the second pack had no card and could not be built from. The slug is one card
 * per release line, and the same line on two CMSes (`tracy-business/j6` + `/emdash-0.x`) is still one card.
 * @param {string} dir the pack's own folder
 * @param {string} tag
 * @param {string} slug the release slug the folder is spelled with (`tracy-apple`, `ja-essence`)
 */
async function readPack(dir, tag, slug) {
  // Regular files only: a symbolic link could name a file outside the directory this stand opened
  // on purpose, and the host would refuse it at download anyway (`quickstart.py`).
  const files = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name)
  const assets = []
  for (const name of files.sort()) {
    // eslint-disable-next-line no-await-in-loop -- a handful of files per pack.
    const info = await stat(path.join(dir, name))
    assets.push({ name, size: info.size, id: null })
  }
  const release = {
    tag_name: tag,
    name: tag,
    draft: false,
    // Prerelease-like: not published, and still choosable — it is on this stand to be chosen.
    prerelease: true,
    // No date: a pack sorts after every release, so no default build base ever becomes a local
    // pack just because it was copied in last (`baseChoices` falls back to the newest).
    published_at: null,
    assets,
    local: { dir }
  }

  let setting = null
  let reason = null
  if (!files.includes('tracy_setting.json')) {
    reason =
      'No tracy_setting.json in this local pack — Tracy cannot tell which CMS this is or which files to install.'
  } else {
    try {
      const doc = JSON.parse(await readFile(path.join(dir, 'tracy_setting.json'), 'utf8'))
      const problems = validateSetting(doc, { assets: files })
      // The checksum a release gets from GitHub's own digest, a pack gets from its bytes — said in
      // this pack's words, not GitHub's, since GitHub has never seen these files.
      if (problems.length === 0) {
        for (const [part, p] of Object.entries(doc.install)) {
          if (!p || typeof p.file !== 'string' || !files.includes(p.file)) continue
          // eslint-disable-next-line no-await-in-loop -- one file at a time; each is large.
          const actual = await fileSha256(path.join(dir, p.file))
          if (actual !== p.sha256)
            problems.push(
              `install.${part}.sha256 must match ${p.file} in this local pack — the file hashes to ${actual}`
            )
        }
      }
      if (problems.length > 0) reason = problems.join('; ')
      else setting = doc
    } catch (e) {
      reason = `tracy_setting.json could not be read: ${e instanceof Error ? e.message : String(e)}`
    }
  }
  if (setting) release.name = `${setting.label} ${setting.version} (local)`

  let questions = null
  if (setting && files.includes('tracy_site_question.json')) {
    try {
      const raw = await readFile(path.join(dir, 'tracy_site_question.json'), 'utf8')
      const doc = JSON.parse(raw)
      questions =
        validateQuestions(doc).length === 0
          ? { doc, sha256: createHash('sha256').update(raw).digest('hex'), version: setting.version }
          : null
    } catch {
      questions = null
    }
  }

  // The card: the file when the pack has one, else the `card` block a pre-16/09 setting carries —
  // the same precedence `cardOf` applies to a release. Either way it is offered under the pack's
  // own id (see the header), never under the published card's.
  let inspiration = null
  let cardReason = null
  if (setting) {
    let card = null
    if (files.includes('tracy_design_inspiration.json')) {
      try {
        const doc = JSON.parse(await readFile(path.join(dir, 'tracy_design_inspiration.json'), 'utf8'))
        const problems = validateDesignInspiration(doc)
        if (problems.length === 0) card = doc
        else cardReason = `tracy_design_inspiration.json: ${problems.join('; ')}`
      } catch (e) {
        cardReason = `tracy_design_inspiration.json could not be read: ${e instanceof Error ? e.message : String(e)}`
      }
    } else if (setting.card && typeof setting.card === 'object') {
      card = setting.card
    } else {
      card = standInCard(setting)
    }
    const id = card ? localTemplateId(slug) : null
    if (card && id) inspiration = { ...card, template: id }
    else if (card) cardReason = 'the pack folder names no slug a local card can be offered under'
  }

  // Pictures the card names and the pack carries, for the picture store (`template_shots`) — the
  // road a published card's pictures take through the operations page, taken on each read here.
  const shots = []
  if (inspiration) {
    for (const file of picturesOf(inspiration)) {
      if (!files.includes(file) || shotProblem({ templateId: inspiration.template, file })) continue
      shots.push({ templateId: inspiration.template, file, path: path.join(dir, file) })
    }
  }
  // The template's pages, held to the validator a release's file is (`site-pages-schema.mjs`).
  const { pages, pagesReason } = setting
    ? await readSitePages(files.includes(SITE_PAGES_FILE) ? path.join(dir, SITE_PAGES_FILE) : null, (file) =>
        readFile(file, 'utf8')
      )
    : { pages: null, pagesReason: null }
  return { release, setting, reason, inspiration, cardReason, questions, shots, pages, pagesReason }
}

/**
 * Every pack under `dir`, as `<slug>/<cms>` folders, and `quickstart/<slug>/<cms>` folders for
 * JoomlArt releases. Throws when `dir` itself cannot be read — the caller keeps the last reading
 * then, as a failed GitHub read does.
 * @param {string} dir
 */
export async function readLocalPacks(dir) {
  const out = []
  /** @param {string} root @param {string} prefix the release tag's leading segments, `/`-ended */
  const readTier = async (root, prefix) => {
    for (const slug of await subdirectories(root)) {
      // The namespace folder is not a slug of its own: its children are read one level down.
      if (prefix === '' && slug === JOOMLART_TAG_NAMESPACE) continue
      // eslint-disable-next-line no-await-in-loop -- few packs; sequential keeps the log readable.
      for (const cms of await subdirectories(path.join(root, slug))) {
        // eslint-disable-next-line no-await-in-loop -- same.
        out.push(
          await readPack(path.join(root, slug, cms), `${LOCAL_TAG_NAMESPACE}${prefix}${slug}/${cms}`, slug)
        )
      }
    }
  }
  await readTier(dir, '')
  const joomlart = path.join(dir, JOOMLART_TAG_NAMESPACE)
  const hasJoomlart = await stat(joomlart).then(
    (info) => info.isDirectory(),
    () => false
  )
  if (hasJoomlart) await readTier(joomlart, `${JOOMLART_TAG_NAMESPACE}/`)
  return out
}

/**
 * One part of a local pack as the host downloads it: a `file:` address, the size the file has NOW
 * and the checksum the setting pinned — confirmed against the bytes here, so a file edited after
 * the last read is refused before the host starts (`pending` is the sentence `quickstart.py`
 * prints instead of downloading), not half way through a customer's provision.
 * @param {string} dir the pack's folder, as the reading recorded it
 * @param {{ file: string, sha256: string }} file the setting's install part
 */
export async function localInstallPart(dir, file) {
  const at = path.join(dir, file.file)
  const url = pathToFileURL(at).href
  if (path.basename(file.file) !== file.file || path.dirname(at) !== dir)
    return { file: file.file, sha256: file.sha256, bytes: null, pending: 'not a file name of this pack', url }
  try {
    const actual = await fileSha256(at)
    if (actual !== file.sha256)
      return {
        file: file.file,
        sha256: file.sha256,
        bytes: null,
        pending: `${file.file} changed after the pack was read: it now hashes to ${actual}`,
        url
      }
    return { file: file.file, sha256: file.sha256, bytes: (await stat(at)).size, githubAssetId: null, url }
  } catch {
    return {
      file: file.file,
      sha256: file.sha256,
      bytes: null,
      pending: `${file.file} is gone from the pack`,
      url
    }
  }
}
