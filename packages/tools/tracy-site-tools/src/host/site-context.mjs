/**
 * ONE WORKSPACE, ONE SITE (15/09/2026) — what a conversation knows about its site before the first
 * tool call.
 *
 * A workspace is a site's folder, and every conversation in it works on that site alone. Without
 * this the agent spent its first steps finding out which site it stood in: `pwd`, the profile tool,
 * README, `start-from.json`, the lane config (measured 15/09 on "Do you know what to do and where to
 * do"). Everything here is read off the site folder the session stands in — no network, no seat —
 * so it costs a few stats per step and says only what is true on disk right now.
 *
 * Pure apart from the file reads, so `test/site-context.test.mjs` pins the wording rules.
 */
import { chatRouteLine, libraryLine } from './chat-design-route.mjs'
import { promises as fs, readFileSync } from 'node:fs'
import path from 'node:path'

// The build pipeline's own reading of "the job of this site" — reused, not restated.
import { readJob } from '../../../../site/tracy-site-build-core/src/host/build.mjs'
// The fence's OWN reading of "is this site sealed" — reused, not restated (as `find.mjs` does).
import {
  QUICKSTART_DESIGN_RULE,
  hasContentContract
} from '../../../tracy-subprocess-docker/src/content-contract.mjs'
// EmDash's own read-only tools (its `readOnlyHint` set), the one list the step budget and the
// scheduler both read; the one sentence that teaches its words road — the `tracy_emdash`
// description quotes the same constant, so the two texts cannot drift apart; and the door's own
// shape repair, so the step budget judges the call `tracy_emdash` actually runs.
import {
  EMDASH_LANGUAGE_RULE,
  EMDASH_READ_TOOLS,
  EMDASH_WORDS_ROAD,
  normalizeEmdashShape
} from './emdash.mjs'
// The one list of the design-system role variables every Tracy template reads — named, not restated.
import { ROLE_VARIABLES } from '../../../../design/tracy-ds-slot/src/role-variables.mjs'
import { UNKNOWN_TEMPLATE_VALUE, roleValueOf } from './ds-slot-worn.mjs'
// One reading of a `tracy_site` call for every classifier, and the contract-language sentences the
// sealed rows and the door's own descriptions both quote (Joomla's, and a bound WordPress site's).
import {
  canonicalCall,
  CONTRACT_LANGUAGE_RULE,
  outcomeUnknown,
  WORDPRESS_CONTRACT_LANGUAGE_RULE
} from './site.mjs'
// The Claude Cowork plugin's own search title and description keys, and the version that prints them.
import { WP_SEO_META } from './wp-seo.mjs'
import { callWriteTargets } from './comment-fence.mjs'

/** The producer a context message names; also how an earlier one is found in the session log. */
/**
 * QUESTIONS ABOUT TRACY ITSELF GO TO `tracy_guide` FIRST. A customer who could not connect their
 * domain asked the agent in the chat; it knew nothing of Tracy as a product and either searched the
 * web or described DNS in general, naming no screen of Tracy's. The guide (tracy-web) holds the steps,
 * the screen, who may do it and this site's live state. `web_search` stays for what is NOT Tracy: the
 * customer's own DNS provider or registrar. One sentence, the same bytes for every site, so it adds
 * nothing to the cached prefix beyond itself (`test/site-context.test.mjs` holds that it names the tool).
 */
export const GUIDE_RULE =
  "TRACY ITSELF. When the customer asks how to do something in Tracy or where a button is (own domain or DNS, publish, putting changes on their real website, backup and restore, export, inviting people, roles, design system, pricing, which CMS or theme a new site can use), call tracy_guide FIRST and answer from it: the steps for their case, the screen link it gives, who may do it. web_search is only for what is not Tracy, such as their DNS provider's own screens. Nothing found: say you do not know and give the Discord link; never describe a Tracy screen, price or DNS step from memory."

/**
 * 🔒 A FILE FOR THE CUSTOMER NEVER GOES PUBLIC (beta week, 21/10/2026): the side panel's download came
 * down as a .json, and the agent put the customer's template zip in `.webroot/images/` so they could fetch
 * it — a file anyone could open. The download is fixed (dsh-better-sidebar `-tracy.92`); this says where
 * such a file goes. One line on every installed site (`test/site-context.test.mjs` `TAKE_AWAY`).
 */
export const TAKE_AWAY_LINE =
  '- A file for the customer to take (a zip, an export) stays here, outside public `.webroot/`: they download it from the side panel.'

export const SITE_CONTEXT_PLUGIN = 'tracy-site-tools:site-context'

/**
 * The source kind of every notice this plugin writes (site context, site state, step budget, turn
 * length, refusal streak); which of them it is travels as `producer`, one of the `*_PLUGIN` names.
 *
 * 🔒 NOT THE RETIRED `plugin` KIND. Session format V4 (dsh 0.1.7) has no shared catch-all kind: every
 * producer owns its own (`MessageSourceMap` in `@deepseek-ai/dsh-llm` `src/message.ts:103-115`), and
 * the V4 codec refuses a `plugin` kind on WRITE as well as on read (`session-format-v3-to-v4`
 * `src/codec.ts:51,68` → `src/message-sources.ts:9`). There is no runtime registry of kinds: any
 * nonempty kind other than `plugin` is admitted (dsh-session `src/index.ts:354-359`), and unknown
 * source fields such as `producer`, `form` and `summary` are kept. The kind is not added to
 * `MessageSourceMap` by module augmentation because this plugin declares no `@deepseek-ai/dsh-*`
 * dependency (`types.ts`); {@link TracyNoticeSource} is the same shape, declared here.
 */
export const SITE_NOTICE_KIND = 'tracy-site'

/**
 * @typedef {{ kind: typeof SITE_NOTICE_KIND, producer: string, form: 'notice', summary: string }} TracyNoticeSource
 */

/**
 * The source of one notice from `producer`.
 * @param {string} producer - one of the `*_PLUGIN` names.
 * @param {string} summary - the one-line account dsh shows without expanding the row.
 * @returns {TracyNoticeSource}
 */
export function noticeSource(producer, summary) {
  return { kind: SITE_NOTICE_KIND, producer, form: 'notice', summary }
}

/**
 * Whether a message source is a notice from `producer`.
 *
 * Two shapes, both current: the one {@link noticeSource} writes, and the one a log written under
 * dsh 0.1.6 comes back as. Such a log is session format V3, and a Session never hands it to a
 * plugin as is: persistence migrates every historical generation to V4 before a handle exposes it
 * (`session-persistence-jsonl` README "Reading the logs", :82), and that migration renamed
 * `{kind:'plugin', plugin:X}` to `{kind:'plugin:X'}`, dropping `plugin` and keeping every other
 * field (`session-format-v3-to-v4` `src/sources.ts:64,86-89`). So the V3 `plugin` field itself is
 * never read here: no Session under dsh 0.1.7 carries it.
 * @param {unknown} source - a message's `source`.
 * @param {string} producer - one of the `*_PLUGIN` names.
 * @returns {boolean}
 */
export function isNoticeFrom(source, producer) {
  if (!source || typeof source !== 'object') return false
  const s = /** @type {{ kind?: unknown, producer?: unknown }} */ (source)
  return s.kind === SITE_NOTICE_KIND ? s.producer === producer : s.kind === `plugin:${producer}`
}

/**
 * One JSON object off disk, or null for anything that is not one.
 * Exported because `content.find` reads the SAME `.tracy/site.json` for the SAME reason, and two
 * readers of one file drift.
 * @param {string} file @returns {Promise<Record<string, unknown> | null>}
 */
export async function readJsonObject(file) {
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'))
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

/**
 * What was measured of a site when it was provisioned — `<sitesRoot>/.site-facts/<label>.json`, its `facts`
 * (`collect-site-facts.mjs`) — or null: no file, JSON that does not parse, `facts` that is not an object.
 * The site context prints them as "This site, measured"; `runSiteCall` asks for them when an address with no
 * language prefix found no page and it must know which language the site serves under one.
 * @param {string} sitesRoot
 * @param {string} label
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function measuredFacts(sitesRoot, label) {
  const facts = (await readJsonObject(path.join(sitesRoot, '.site-facts', `${label}.json`)))?.facts
  return facts !== null && typeof facts === 'object' && !Array.isArray(facts)
    ? /** @type {Record<string, unknown>} */ (facts)
    : null
}

/** @param {string} dir @returns {Promise<boolean>} */
async function isDirectory(dir) {
  try {
    return (await fs.stat(dir)).isDirectory()
  } catch {
    return false
  }
}

/** @param {string} file @returns {Promise<boolean>} */
async function isFile(file) {
  try {
    return (await fs.stat(file)).isFile()
  } catch {
    return false
  }
}

/** @param {unknown} value @returns {string | null} */
const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

/**
 * Which CMS a site folder runs — ONE reader for every place that needs the answer: this context,
 * `content.find`, and the tool surface fitted to the site when its agent is made. Two readers of one
 * fact drift, and here a drift is a context saying "joomla" beside a tool list fitted for WordPress.
 *
 * The folder's own record first (`.tracy/site.json`, written at Add site), then the EmDash handoff
 * (`template/artifact.json` — an EmDash `.webroot/` carries no CMS marker of its own), then the
 * webroot's own files. ⚠ The record is www-data's to write, so nothing that GRANTS may rest on this
 * answer: the context and the tool surface only describe and hide; every door keeps its own fence.
 *
 * @param {string} folder - `<sitesRoot>/<label>`.
 * @param {(root: string) => Promise<string>} detectPlatform - read the CMS off a webroot.
 * @returns {Promise<string>} `joomla`, `wordpress`, `emdash`, what the record declares, or `unknown`.
 */
export async function sitePlatform(folder, detectPlatform) {
  const declared = text((await readJsonObject(path.join(folder, '.tracy', 'site.json')))?.platform)
  if (declared !== null) return declared
  const handoff = await readJsonObject(path.join(folder, 'template', 'artifact.json'))
  const cms = handoff?.cms
  if (cms !== null && typeof cms === 'object' && /** @type {{name?: unknown}} */ (cms).name === 'emdash')
    return 'emdash'
  const webroot = path.join(folder, '.webroot')
  return (await isDirectory(webroot)) ? await detectPlatform(webroot) : 'unknown'
}

/**
 * Whether the site is SEALED, read the way the fence reads it — the same function, so the context
 * can never describe an open site the fence has closed, or the other way round.
 *
 * 🔒 THE FILE'S EXISTENCE IS THE SEAL, NOT ITS CONTENTS. `hasContentContract` stats the marker
 * and never parses it. Until 25/09 this context parsed it instead, so a marker that was not readable
 * JSON left the site "open" here while the fence refused every file tool and the shell on it — the
 * rules then offered doors that could only refuse. The contents still NAME the contract when they
 * parse; they no longer decide whether there is one.
 *
 * 🔒 A MARKER THE FENCE CANNOT READ SEALS, BECAUSE THE FENCE FAILS CLOSED. When the stat fails for any
 * reason but "no such file" (`.content-contracts` a regular file → ENOTDIR, an unreadable directory
 * → EACCES) `hasContentContract` throws. Since ADR 0022 (26/09/2026) the fence reads the marker in
 * one place only — a `bash` command's direct-database-write check (`tracy-subprocess-docker`
 * `approvalReason`) — and dsh answers that throw with an error for the call; the file tools never
 * read it. So "sealed" here means what the contract line says, a quickstart whose slots recommend,
 * never a folder the file tools cannot open (28/09/2026).
 *
 * @param {string} folder - `<sitesRoot>/<label>`.
 * @param {string} label
 * @returns {boolean}
 */
function sealed(folder, label) {
  const sitesRoot = path.dirname(folder)
  try {
    return hasContentContract(path.join(sitesRoot, label), sitesRoot)
  } catch {
    return true
  }
}

/**
 * Whether a SEALED site's writes go through a bound content contract — its words by slot, through
 * `content.contract` — rather than record by record. ONE reader for the three texts fitted to the
 * site: this context, the `tracy_site` surface registered at `agent/created` (`surfaceOf`), and the
 * call normaliser (`index.ts` → `normalizeCall`); two readers of one fact is a context offering the
 * contract beside a tool that refuses it.
 *
 * 🔒 EVERY SEALED JOOMLA SITE IS BOUND; A SEALED WORDPRESS SITE ONLY WHEN PROVISION BOUND IT (#337,
 * merge of PR #336 with it, 25/09/2026). Provision writes the marker for both platforms — it is what
 * closes the shell and the files — but a WordPress site is bound to its contract only when its
 * release pins a Claude Cowork plugin: `provision/platform/wordpress.sh` then installs that zip, binds, inspects,
 * and names the Claude Cowork plugin in the marker (`coworkContractVersion`); a bind that fails stops the provision.
 * The build's check stage reads the same field to demand the binding (`sealOf`,
 * `tracy-site-build-wordpress/src/host/stages.mjs`). A marker that names none — a release that pins
 * no Claude Cowork plugin (`tracy-base/wp7`), or a site sealed before #337 — is the record road: the Claude Cowork plugin
 * takes `content.update`, and the host fence alone seals the site.
 *
 * 🔒 A WORDPRESS MARKER THAT CANNOT BE READ SAYS NOTHING ABOUT THE ROAD: null. The seal is the fence's
 * to answer (`sealed`); the tool then keeps its full description, where both roads are offered and the
 * Claude Cowork plugin's own answer decides.
 *
 * @param {string} sitesRoot - the folder holding every site folder and `.content-contracts/`.
 * @param {string} label
 * @param {string} platform - `sitePlatform`'s answer.
 * @param {boolean | null} isSealed - the fence's answer (`hasContentContract`).
 * @returns {boolean | null} false for a site that is not sealed and for EmDash (no component to bind);
 *   true for every other sealed site whose platform is not WordPress (Joomla, and one whose platform
 *   could not be read — the contract line alone is known true there, as before #337).
 */
export function contractDoorOf(sitesRoot, label, platform, isSealed) {
  if (isSealed !== true) return isSealed === null ? null : false
  if (platform === 'emdash') return false
  if (platform !== 'wordpress') return true
  try {
    const marker = JSON.parse(
      readFileSync(path.join(sitesRoot, '.content-contracts', `${label}.json`), 'utf8')
    )
    const pinned =
      marker !== null && typeof marker === 'object'
        ? (marker.coworkContractVersion ?? marker.receiverVersion) // vocabulary-allow: pre-rename key in published data
        : undefined
    return typeof pinned === 'string' && pinned.trim() !== ''
  } catch {
    return null
  }
}

/**
 * Whether an IMPORTED copy's own Claude Cowork plugin derived a content contract at import provisioning —
 * ONE reader for the texts fitted to the site, as `contractDoorOf` is for a quickstart's: the `tracy_site`
 * surface registered at `agent/created` and the call normaliser (`index.ts`). The per-step context does NOT
 * read it: an imported copy's context equals an open copy's byte for byte (a derived "Content map" line
 * there only repeated what the surface and `slots.tsv` say, at ~100 tokens a step; review, 02/10/2026).
 *
 * 🔒 THE HOST'S RECORD, BESIDE THE SITE FOLDERS, AND NEVER THE SEAL. `collect-import-contract.mjs` writes
 * `<sitesRoot>/.import-contracts/<label>/manifest.json` at import provisioning, only after the copy's
 * plugin answered an inspect of `derived/<label>`; no seat writes there (the file tools are fenced to the
 * site's own folder). It is NOT `.content-contracts/<label>.json`: that marker seals a quickstart — the
 * SQL fence, the quickstart wording, a refused re-provision — and an imported copy keeps every open road.
 *
 * 🔒 FAILS CLOSED TO THE OPEN SITE. A missing, unreadable or foreign record (another label, another CMS,
 * another schema) answers null, and the copy keeps the open surface it had before 01/10/2026. So does a
 * folder whose own record (`.tracy/site.json`, written by provision) does not say `origin: "imported"`:
 * both halves must agree, and no seat can write the host's half.
 *
 * @param {string} sitesRoot - the folder holding every site folder and `.import-contracts/`.
 * @param {string} label
 * @param {string} platform - `sitePlatform`'s answer.
 * @returns {{ id: string } | null} the derived contract's id (`derived/<label>`), or null.
 */
export function derivedContractOf(sitesRoot, label, platform) {
  if (platform !== 'joomla' && platform !== 'wordpress') return null
  try {
    const site = JSON.parse(readFileSync(path.join(sitesRoot, label, '.tracy', 'site.json'), 'utf8'))
    if (site === null || typeof site !== 'object' || site.origin !== 'imported') return null
    const manifest = JSON.parse(
      readFileSync(path.join(sitesRoot, '.import-contracts', label, 'manifest.json'), 'utf8')
    )
    if (manifest === null || typeof manifest !== 'object') return null
    if (manifest.schemaVersion !== 'tracy-import-contract/v1' || manifest.mode !== 'derived') return null
    if (manifest.id !== `derived/${label}` || manifest.platform !== platform) return null
    return { id: manifest.id }
  } catch {
    return null
  }
}

/**
 * The WORDS and SETTINGS half of the WordPress row, which an open and a sealed WordPress site share
 * word for word; only the layers the seal closes differ (`SEALED_WORDPRESS_WHERE`).
 *
 * 🔒 THE KINDS AND FIELD NAMES THE COMPONENT HAS, NOT THE ONES WORDPRESS HAS. This said `category`,
 * `tag` until 24/09; the component's `SiteWriter::KINDS` is post · postmeta · option · templatePart ·
 * term · menuItem, so the two named ones were refused and the two that exist were never mentioned.
 * Every other WordPress refusal measured that day was a NAME too — on `wp-dmlj6g` (ja-business, suite
 * v2, 33 turns): 13 post writes refused on `content`, `title`, `status` or a block name, and
 * `content.list` refused 9 times on `menuItem`, `option` or `templatePart`. A `templatePart` written
 * without `title` is renamed to its slug, an update without `id` INSERTS a draft, and a block theme's
 * menus are `wp_navigation` posts, where `menuItem` can only refuse ("this site has no menu called …").
 */
const WORDPRESS_WORDS =
  'WORDS — `content.get`/`content.update`, always with `id` (an update without one CREATES a draft): a page or post is kind `post`, its fields `post_title`/`post_content`/`post_excerpt` both ways (`fields:{…}` to write), `post_content` WHOLE; a block theme\'s header and footer are kind `templatePart` (`key:"header"|"footer"`, written `fields:{content, title}` — without `title` the part is renamed) and its menus `wp_navigation` posts (kind `post`; `menuItem` is a classic theme\'s); categories and tags are kind `term`. `content.list` answers the default language only. SETTINGS — options: the site title and tagline are `blogname` and `blogdescription` (kind `option`, `key`, written `fields:{value}`), not theme files. '

/**
 * The door to the translation WordPress itself ships, named in the PHRASES layer of both WordPress
 * rows — open and sealed alike.
 *
 * 🔒 THE PHRASES LAYER NAMED NO DOOR, AND THE TRANSLATION RULE POINTS AT IT. The rule says "the
 * platform line above says through which door" packs are installed, and until 25/09 neither
 * WordPress row named one: the open row said "FIRST the translations the locale already has" and
 * stopped, and the sealed row said PHRASES were closed — "say so" — while the same prompt's
 * `tracy_site` description offered `language.install {locale}`, the site context and the tool telling
 * the agent two opposite things. The door is real on both: the WordPress component dispatches
 * `language.install` (claude-cowork `wordpress/cowork/lib/Engine.php:127`, `wp_download_language_pack`,
 * wp-admin's own road) and binds no contract, so a seal does not close it. The locale is WordPress's
 * spelling; the component refuses any other shape (`^[a-z]{2,3}(_[A-Za-z0-9]+){0,2}$`).
 */
const WORDPRESS_LANGUAGE_DOOR = '`language.install {locale}` (`vi`, `pt_BR`)'

/**
 * The parts of the EmDash row an open and a quickstart site share word for word (the open row is
 * these parts joined, byte for byte what it was before the split): how every layer is reached, the
 * words road and the language rule, where a Tracy template keeps its words; where they are NOT found;
 * and the two layers no EmDash site has a door for.
 *
 * 🔒 NOT "EVERY LAYER" (09/10/2026): this said every layer goes through `tracy_emdash`, while the same row's
 * PHRASES and PRESENTATION line (`SHELL_STEPS.emdashCode`) sends the template's code to bash in `/app` and
 * `site.rebuild`. Content goes through the tool; the code does not.
 */
const EMDASH_WORDS_WHERE = `No PHP and no CLI: words, pictures, menus and settings go through \`tracy_emdash\`, EmDash's own tools as \`{tool, arguments}\`; the template's code is PHRASES and PRESENTATION below. ${EMDASH_WORDS_ROAD} ${EMDASH_LANGUAGE_RULE} On a Tracy template what every page shares (top bar, logo, footer, contact details) is the one entry of collection \`site\`, and a page's own words are the one entry of the collection named after it (\`home\`, \`about\`, \`contact\`; a listing page's is \`<name>_page\`, e.g. \`news_page\`). Fields ending \`_a\` and \`_b\` are ONE heading on two lines: a new heading fills both, split at the customer's line break, else at a dash, comma or colon, else at the word nearest the old split; one word leaves \`_b\` empty.`
// E2 (27/09): asked for a line "under the opening hours in the footer", the agent spent 14 steps and
// 347 s grepping the template in `/app` and wrote nothing (A1 C54). The template prints each fact from
// one field (`<span>{site.hours}</span>`): new words beside it are that field's words, and a line of
// their own is the template's markup.
// 🔒 "FIRST", NOT "NEVER IN /app" (09/10/2026): words written into the template's code (a label in a view)
// ARE in `/app` — that is the PHRASES line, edited there by a mode with bash, then rebuilt. Saying
// "never in `/app`" here contradicted that line in the same row.
const EMDASH_FIND_WORDS =
  'Find the words in content first: only words no field holds are written into the template\'s code (PHRASES below), and `.webroot/data` is the raw database, never edited by hand. Words beside a fact (under the hours) go in its field: `content.replace {find:"<fact>", replace:"<fact> · <words>"}`.'
const EMDASH_NO_DOOR = 'Category and form labels have no door here. INSTALLED — not reachable from here.'

/**
 * The sentences of the platform rows that prescribe a shell command, each with what a mode WITHOUT
 * one does instead (`toolReach`): `shell` for Designer and Developer, `none` for Writer and SEO/GEO.
 *
 * 🔒 THE ROAD THE MODE HAS, NOT A SILENCE. Joomla's language keys: `content.find {text}` names a
 * phrase's key and the override line that changes it, on every Joomla and WordPress surface
 * (`FIND_BLOCK`, `surface.mjs`), and the override `.ini` is a file the file tools write (it is not
 * platform core, `site-guards.mjs`). Clearing Joomla's cache or a WordPress page cache after a file
 * edit, and EmDash's code under `/app`, have no door without a shell: said as such, so the customer
 * hears it rather than the agent trying.
 *
 * 🔒 `/app` IS EDITABLE, FROM A SHELL (ADR 0022). Its code belongs to www-data since the guard came
 * out (`drop-old-guard.mjs`), `site.rebuild` builds it inside the container for the site's own chat
 * (`tracy-site-build-emdash` `requests.mjs`, a37a4e5b8), and `bash` runs there by `docker exec`
 * (`tracy-subprocess-docker`); the file tools run in dsh, where `/app` is outside the site folder and
 * fenced. The persona (`config/mode-matrix.json`), the site's AGENTS.md and the fence's answer say
 * the same (28/09/2026).
 */
const SHELL_STEPS = Object.freeze({
  joomlaKeys: {
    shell:
      'Find the keys in ONE pass — `grep -rn` all the English words you can see, together, over `language/en-GB/` — not one grep per key.',
    none: 'Find the keys in ONE step — one `content.find {text}` per phrase you can see, all in the same step — not by reading the `.ini` files.'
  },
  joomlaCache: {
    shell: 'only a FILE edit (an override, a template file) needs `php cli/joomla.php cache:clean` after it.',
    none: 'only a FILE edit (an override, a template file) needs the cache cleared after it, which takes a shell this mode does not have: tell the customer it may show a little later.'
  },
  wordpressInstalled: {
    shell: '; `wp-cli` may be absent. If a page cache plugin is active, flush after a change.',
    none: '. If a page cache plugin is active, a change shows once its cache is flushed, which takes a shell this mode does not have: tell the customer it may show a little later.'
  },
  emdashCode: {
    shell:
      "PHRASES and PRESENTATION (a line of its own, too) — the template's code in `/app`, this site's own copy: `bash` in the site's container edits it (the file tools do not reach `/app`), then `tracy_site_build_emdash request site.rebuild` serves it; a change every site of this template should get belongs to the template — say so.",
    none: "PHRASES and PRESENTATION (a line of its own, too) — the template's code in `/app`, which only a mode with a shell edits (Designer, Developer): say so, and that a change every site of this template should get belongs to the template."
  }
})

/**
 * Where the words a visitor reads are stored, per platform, for a mode with a shell or without one
 * (`SHELL_STEPS`). Measured 15/09 on "Change word Cassiopeia to …": without this the agent grepped
 * template files and language `.ini`s, decided visitors never see the word (it is the default logo
 * image), and offered to rename the template.
 * @type {Record<string, (way: 'shell' | 'none') => string>}
 */
const WHERE_TEXT_LIVES = {
  // 🔒 ONE ROW PER LAYER, IN THE ORDER THE SHARED RULE NAMES THEM. This was prose until 17/09 and it
  // grew a clause per incident — the brand, the breadcrumb, the language — each true, none findable.
  // A layer table is addressable: the agent names a layer, then reads that layer's door, and a new
  // case is a row rather than a paragraph. What differs between platforms is ONLY the door, which is
  // why the mechanism lives here and the shape lives in the shared rule.
  joomla: (way) =>
    "WORDS — articles, menu items, module text: `content.update`. SETTINGS — a record's `params`: the header brand is the default template style's `siteTitle` (with it and `logoFile` both empty the template falls back to the logo IT ships, usually an image — so the word on screen may be text nowhere in the database; read which template this site runs before looking, never assume one); the breadcrumb's \"Home\" is the breadcrumbs module's `homeText`; the site language is `com_languages`'s `site` param AND a published row in the languages table, both or neither. PHRASES — what Joomla ships (the login form's fields, `You are here:`, buttons): FIRST the pack, which is the translation already written — `content.list` kind `language` says which exist and which is published, and `extension.install {url}` installs one from an https zip the SITE downloads itself, so a pinned catalogue of packs (URL + sha256) is all you need and this site may carry one. Only what the pack does NOT cover is an override: one `KEY=\"value\"` line in `language/overrides/<tag>.override.ini` (`administrator/language/overrides/` for the admin side), never an edit to a shipped `.ini`. " +
    SHELL_STEPS.joomlaKeys[way] +
    " PRESENTATION — `templates/<template>/html/` overrides, never core. INSTALLED — `extension.list` says what is installed and `content.list` kind `language` says which languages exist and which is published; the admin is at `/administrator` but you cannot open it, and the database is never the way to answer either. A write through the door clears Joomla's cache itself; " +
    SHELL_STEPS.joomlaCache[way],
  // 🔒 PRESENTATION NAMES THE THEME THE PAGE RUNS (09/10/2026): its child theme's files first when one runs.
  // It said "a child theme or the block editor" while the LOOK line, three rows down, wrote the active
  // theme's own `theme.json`. A LOOK change itself now goes into Additional CSS (`LOOK_ROAD`), not the theme.
  wordpress: (way) =>
    `${WORDPRESS_WORDS}PHRASES — what WordPress and its plugins ship: FIRST the translations the locale already has, WordPress's own through ${WORDPRESS_LANGUAGE_DOOR}; only what they do not cover is a translation file of your own or a \`gettext\` filter, never an edit to a shipped \`.po\`/\`.mo\`. PRESENTATION — template parts on a block theme, PHP templates on a classic one: check which, then change the files of the theme this site runs (its child theme's first, when one runs), never \`wp-admin/\`, \`wp-includes/\` or a plugin you did not author. INSTALLED — \`plugin.list\`, \`theme.list\`${SHELL_STEPS.wordpressInstalled[way]}`,
  // 🔒 EMDASH ANSWERS EVERY LAYER THROUGH ONE TOOL, and saying so is the point: the line here used to
  // name `tracy_site`, which refuses on this platform, so every layer pointed somewhere dead.
  // Reported 16/09: asked to add a language it read file after file, because nothing it had been
  // told led anywhere.
  //
  // ⚠ AND THE FIX FOR THAT INTRODUCED A SECOND DEAD POINTER, MEASURED 20/09. It also dropped the
  // `.webroot/` path on the belief that EmDash has none. EmDash HAS one: the site's compose mounts
  // `<private>/data` and `<private>/uploads` at `<site>/.webroot/data` and `<site>/.webroot/uploads`,
  // which is where the agent's own `docker exec` lands. Inside `site-h330yd-web-1`:
  // `/site/site-h330yd/data` does not exist, `/site/site-h330yd/.webroot/uploads` holds 116 entries.
  // So the line denied the one directory that exists and named two that do not — worse than the
  // pointer it replaced, because an agent that looks and finds nothing concludes the site is empty.
  // Read-only is still the rule: the path is for LOOKING; every change goes through the tool.
  //
  // 🔒 AND NOW IT NAMES THAT PATH TO SAY THE WORDS ARE NOT THERE (25/09). "For LOOKING" still read as
  // "look here": r2 C04 ran `grep -ao` into `.webroot/data/data.db`, and ~60 bash, grep and read calls
  // went into `/app` hunting which field prints which words. Both hold something real — the raw
  // database and the template's code — and neither is where a word is found or changed, so the row
  // says exactly that, and `/app` stays only under PRESENTATION, where an edit there is the answer.
  //
  // 🔒 THE WORDS ROAD IS ONE CONSTANT, `EMDASH_WORDS_ROAD`, quoted here and in the `tracy_emdash`
  // description: two copies of one rule drift until they disagree in the same prompt. No `locale:"en"`
  // (Tracy fills this site's own language; a hard-coded one is wrong on every other site) and no
  // `{list: true}` at all (the description carries it as the exception).
  //
  // 🔒 WHICH LANGUAGES A CHANGE REACHES IS `EMDASH_LANGUAGE_RULE`, quoted here only, right after the
  // road: PR1 bench C21 and C23 asked the customer "en or all 40?" when nothing said (25/09). A fact
  // goes to every language served, words to the page's own — the split Joomla's contract row makes.
  //
  // 🔒 THE FEW TOOLS A TEXT EDIT NEEDS, WITH THEIR ARGUMENTS — NOT "SEND `{list: true}` FIRST".
  // Measured 24/09 on `ed-ivj9ni` (ja-business, suite v2, 33 turns, 288 steps): `{list: true}` in 32
  // turns at 49,977 characters each, re-read on every later step; `content_list` 62 times, most
  // without `locale` (246–362k characters, cut to ~46k and spilled); 8 `content_publish` refusals,
  // every one a slug with no locale (a slug without `locale` resolves to the `af` entry); ~60 bash,
  // grep and read calls into `/app` hunting which field prints which words. Every edit ran skill →
  // list → schema → list → get → update → publish, 6–14 steps, where two calls do it: `content_get`
  // with `locale` answers the fields AND `_rev`, and `content_update` with `status:"published"`
  // writes and publishes in one call (EmDash's own handler updates, then publishes with the
  // revision the update returned; r2 C11 used it). C05 wrote `settings.tagline`, which neither
  // Tracy EmDash template prints — the logo's words are fields of `site`.
  //
  // 🔒 A HEADING ON TWO LINES IS ONE HEADING. Tracy's EmDash templates print `hero_title_a` and
  // `hero_title_b` as the two lines of one headline, the same shape as Joomla's `title` +
  // `title-accent` that failed most on r2 (C01, C29 wrote one part and left the other on screen). The
  // split is the one rule every CMS uses (plan D13).
  emdash: (way) =>
    `${EMDASH_WORDS_WHERE} Menus: \`menu_get {name}\`, then \`menu_set_items {name, items}\` with every item. ${EMDASH_FIND_WORDS} SETTINGS — \`settings_update\`: its \`title\` is in every browser tab, its \`tagline\` is printed nowhere. ${SHELL_STEPS.emdashCode[way]} ${EMDASH_NO_DOOR}`
}

/**
 * The last sentence of the "Where visible text lives" row — open, sealed or bound, every mode — on a site
 * whose quickstart release has a where-map (`WHERE_MAP_RELEASES`): the
 * quickstart's where-map, by topic (`apps/tracy-web/src/sites/content-where.js`, read off each
 * release's own files, each entry with the call that changes it).
 *
 * 🔒 THE MAP WAS THERE AND NOTHING SENT THE AGENT TO IT AT THE MOMENT IT WENT HUNTING. Bench flow D
 * (05/10/2026, 55 runs on WordPress, EmDash and Joomla Tracy Business): 6 runs read the describe; 43
 * reads were CMS or plugin source. "Turn the contact form off because of spam, then back on exactly as
 * before" cost WordPress 28 calls (Contact Form 7's PHP for 8 steps), EmDash 34 (the Forms plugin for
 * 13, then a patch of the template and a rebuild), Joomla 42 (com_contact core after 23k + 50k of
 * listings) — each before the one write its map now names, with the way back. The topics named are the
 * ones those reads hunted; a release no map was read off answers no `where`, and the sentence asks
 * nothing more of that site than one read.
 */
const WHERE_MAP_POINTER =
  "Where the quickstart keeps a form, page, menu, the design or SEO, and the call that changes it or turns it off and back on: `content.read {describe:true}`'s `where.<topic>`, before any CMS, plugin or template source."

/**
 * The quickstart releases a where-map was read off — `platform` and `quickstart` of each file in
 * `apps/tracy-web/src/sites/where/` (`whereMapFor`: EmDash names the template id, the others the release
 * tag). `test/site-context.test.mjs` holds this list to those files, so a new map fails the suite until it
 * is named here too.
 *
 * 🔒 THE POINTERS TO `where.*` GO ONLY TO A SITE ONE OF THESE BUILT (09/10/2026). They were sent to every
 * site, and the relay answers no `where` for any other — an open or imported site, Tracy Base, a JoomlArt
 * quickstart — so on those the pointer bought one describe read that could only come back without the
 * block it promised. Matched on the release, not its version: the folder holds no quickstart version (a
 * Joomla marker names the CONTRACT version, which several releases share), so a site of another version
 * of a mapped release may still read a describe with no `where`, the one read the pointer costs.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const WHERE_MAP_RELEASES = Object.freeze({
  joomla: Object.freeze(['tracy-business/j6']),
  wordpress: Object.freeze(['tracy-business/wp7']),
  emdash: Object.freeze(['tracy-business'])
})

/**
 * The quickstart release a site folder says it was built from, spelled as the where-maps spell it, or
 * null: on EmDash the template handoff's `templateId` (`template/artifact.json`); elsewhere the content-
 * contract marker provision writes — WordPress's `quickstart`, else the contract id
 * `<template>/<platform>/<version>` without its version (a derived contract's id is kept whole, and
 * matches no map). Both files are www-data's to write: this only decides whether a pointer is said.
 * @param {string} platform
 * @param {Record<string, unknown> | null} marker - `.content-contracts/<label>.json`, parsed.
 * @param {Record<string, unknown> | null} artifact - `template/artifact.json`, parsed.
 * @returns {string | null}
 */
export function quickstartReleaseOf(platform, marker, artifact) {
  if (platform === 'emdash') return text(artifact?.templateId)
  const named = text(marker?.quickstart)
  if (named !== null) return named
  const id = text(marker?.contract)
  if (id === null) return null
  const parts = id.split('/')
  return parts.length > 1 && /^\d+\.\d+\.\d+/.test(parts.at(-1) ?? '') ? parts.slice(0, -1).join('/') : id
}

/**
 * Whether the release a site was built from has a where-map.
 * @param {string} platform
 * @param {string | null} release - `quickstartReleaseOf`'s answer.
 */
function hasWhereMap(platform, release) {
  return (
    release !== null &&
    Object.hasOwn(WHERE_MAP_RELEASES, platform) &&
    WHERE_MAP_RELEASES[platform].includes(release)
  )
}

/**
 * The search-facing head, for the SEO/GEO mode only — whose persona asks it to measure "the title,
 * description, headings and links", and which nothing told where those live (28/09/2026).
 *
 * 🔒 THE PLACES ARE THE QUICKSTART'S, SO THEY ARE `where.seo`'S TO SAY, NOT THIS LINE'S. A Tracy
 * quickstart's `content.read {describe:true}` carries a `where` block read off that release's own
 * files, each entry with its proof and its call (`apps/tracy-web/src/sites/content-where.js`, fix B
 * of perf/agent-accuracy-speed), and the relay describes a site even where it has no reader. A place
 * written here per platform would be one theme's truth said to every site of that CMS (the Business
 * WordPress theme prints no meta description; `wp-ja-kinetic` does) and a second copy to drift. So
 * this line names the read that shows the head (`page.text {path, head:true}`, fix C), sends the
 * agent to `where.seo`, and adds only what holds for every site of the platform:
 *
 * - WordPress: WordPress prints no meta description and builds `<title>` from the post title, so a
 *   site with no SEO plugin had no place for either: the plugin's `seo:{title, description}` wrote
 *   nothing, silently, and the agent renamed the page instead — its breadcrumb too (05/10/2026,
 *   Tracy Business wp7). From Claude Cowork `WP_SEO_META.since` the plugin keeps both in its own post
 *   meta and prints them itself while no SEO plugin runs (`wp-seo.mjs`); an older plugin has neither.
 *   `tracy_site` checks the version and the SEO plugin before such a write (`normalize.mjs` `wpSeoMeta`).
 * - Joomla: core's order for a page's description — the article's `metadesc` (on a contact page the
 *   contact record's: 29/09/2026, v6 Joomla L1-01 wrote it with `content.update {kind:"contact"}`), the menu item's
 *   `menu-meta_description` param, the language row's `metadesc` — all columns the component's
 *   `content.update` writes (claude-cowork `JoomlaSiteWriter.php` `MAP`); `params` is one column,
 *   written whole.
 * - EmDash: nothing beyond `where.seo`, which already says the template's own head wins over the
 *   entry SEO panel.
 * @type {Record<string, string>}
 */
const SEO_EXTRA = Object.freeze({
  wordpress: ` With no SEO plugin, Claude Cowork ${WP_SEO_META.since}+ (\`tracy_site info\` answers \`info.component\`) prints a page's own search title (the whole <title>: keep its ' – <site name>' end unless the customer asked for a different full title) and meta description from post meta \`${WP_SEO_META.title}\` and \`${WP_SEO_META.description}\`: \`content.update {kind:"postmeta", id, key, fields:{value}}\` changes only those, not the page title, breadcrumb or heading; Tracy writes Yoast's or Rank Math's own key instead where one runs, and refuses where another SEO plugin keeps them. An older plugin has neither: the page title is the title, and renaming the page renames its breadcrumb and heading too — say so.`,
  joomla:
    " A page's meta description is its article's `metadesc`, else its menu item's `menu-meta_description` param, else the language's `metadesc` (kind `language`); on the Contact page it is the contact record's `metadesc` (kind `contact`, the id in its menu item's link); a menu item's `params` are written whole.",
  emdash: ''
})

/**
 * ADDING A RECORD (a post, an article, a team member), said once per platform to EVERY mode — the create
 * recipe the model had to rediscover on every add (fix A of perf/round7, 30/09/2026).
 *
 * 🔒 THE CREATE SHAPE WAS NOWHERE, SO EVERY ADD LEARNED IT FROM ITS NEIGHBOURS. The round-7 bench asked
 * all four modes on all three platforms to post one news item: the 12 chat runs took 4–23 LLM calls
 * (the 11 the triage flagged, 8–23, median 11) against a floor of 3–4, with 75 calls counted wasted.
 * They read the 15–41k-character describe and page maps, sibling records, the page, the theme's
 * templates, a recipe file, the Claude Cowork plugin's source and WordPress core — to learn which
 * collection or category "News" is, which fields the create door takes and in what shape, and what a
 * date looks like. The WORDS rows above teach EDITING (the WordPress one even says an update without an
 * id "CREATES a draft" and never how to do it on purpose), and `content.update`'s description says
 * "id left out CREATES" without one field name.
 *
 * 🔒 EVERY NAME BELOW IS ONE THE DOOR TAKES, held by `test/consistency.test.mjs` (WordPress: the
 * component's post fields, `WP_POST_FIELDS`; Joomla: the article columns `JoomlaSiteWriter::MAP` lists;
 * EmDash: `content_create`'s own arguments in `tools-0.38.json`), and the shapes are the ones the
 * component reads:
 * - WordPress: a create with no `post_status` is a DRAFT, on purpose (`write_post`: "a new page
 *   appearing on a live site without anyone saying so is the one outcome an Apply must not produce by
 *   omission"); `post_date` goes to `wp_insert_post` as given; a page is `kind:"page"` (`normalize.mjs`
 *   WP-21); a body is block markup (`postFields`).
 * - Joomla: a create stores only the whitelisted columns and stamps `access:1`, `language:"*"` and the
 *   creation time itself, so a site with two languages needs the `language` of the category the
 *   article joins; `state:1` is published, `publish_up` a UTC `Y-m-d H:i:s`; nothing mints a Joomla
 *   content `apply_id`, the model names it (`joomlaWriteBlock`). A new PAGE is more than this row: an
 *   article in the pages category AND its menu item, which `page.create` makes in one call (05/10/2026)
 *   — the Writer line below points there too, but Designer, Developer and SEO/GEO would read "add a
 *   page" as this row and leave an article no menu reaches, so the row says so.
 * - EmDash: the entries a listing page shows are the collection whose LABEL is the page's
 *   (`schema_list_collections` answers slug, label and urlPattern), not a slug guessed from the page
 *   name (refused in 2 of the 4 EmDash runs) and not `news_page`, which holds the page's OWN words;
 *   a `datetime` field took an ISO string in every run that wrote one, and the `Rich text: a Markdown
 *   string.` rule stays in the `tracy_emdash` description, where it already is. F4 (30/09): the list
 *   itself answers the fields of the collections that hold records (`recordFields`, `emdash.mjs`
 *   `recordCollectionsOf`), so the `schema_get_collection` step the row used to send every add to is
 *   now only the fallback for a collection the list did not cover — 4 steps to 3. The row paid for the
 *   key with "(never guess)": the door answers a guessed slug with the collections it has (round 7,
 *   `collectionsAnswer`), and `recordFields` is keyed by the real slugs.
 *
 * 🔒 "ONLY WHAT THE CUSTOMER GAVE" IS THE OTHER HALF. Nothing said so, and the same runs added a category
 * the customer never named (WordPress 4 of 4 with `post_category`, EmDash 1 of 4; on Joomla all 4
 * filed the article under a subcategory of the page's own), an excerpt — their first paragraph again,
 * or a sentence of the agent's own (WordPress 4 of 4, EmDash 2 of 4) — and, once, an unpublished
 * second-language copy holding the ENGLISH text plus its association (two extra writes and the reads to
 * find the association's shape). A category or an excerpt is a choice for the customer to make, and
 * invented data is worse than an empty field: the site then shows a classification nobody chose. Joomla's
 * `catid` is the exception that proves it — an article with no category never reaches the page the
 * customer named — so it is the category THAT page lists, and not a subcategory the customer did not name.
 *
 * 🔒 WORDPRESS HAS THE SAME EXCEPTION, AND THE FIRST WORDING FORBADE IT (adversarial review of round 7, PP-3).
 * A listing page of a Tracy WordPress theme can filter its post query by category (the query block's
 * `taxQuery.category` ids, what the seeder writes; wp-ja-vega's `content-model.md`, the Claude Cowork
 * plugin's own note on `post_category`: "a post without its category never appears in the blog listing"),
 * so "no category, ever" filed a post under the default category where the page the customer named would
 * never show it — and its `/<listing>/<post-slug>` address would not answer either. The describe names
 * nothing of the kind (its `where` map is about pages, menus, head, forms), so the row says where the
 * category is written on the page (`wp:query`'s `taxQuery.category`) and leaves it out otherwise: a listing
 * of every post needs none.
 *
 * 🔒 THE TIME OF DAY IS 00:00:00 (PP-1). The Today notice is a UTC DATE and nothing on the host says what
 * o'clock it is for the site, so any time the model writes is invented, and a time later than now is not
 * harmless: WordPress turns `publish` into `future` for a `post_date` more than a minute ahead, and Joomla
 * keeps a state-1 article "pending" until `publish_up`. Midnight of the day named is never ahead of a day
 * that is not today. WordPress reads `post_date` in the SITE's own time, which can still be yesterday
 * where the UTC day has just turned (an evening west of UTC), so it is sent only for another day the
 * customer named; with none, the door dates the post now. Joomla's `publish_up` is UTC like the Today
 * notice, so its midnight is never ahead and the field stays in the row.
 *
 * Keyed on the site's platform and told to every mode (the recipe is what Designer and Developer
 * needed most: they explored theme files and plugin source; Writer and SEO/GEO read the describe), so
 * the block stays byte-stable per (site, mode). One row per platform: 390–475 characters on every step.
 * The WordPress row paid for the two clauses above with the sentence "without `post_status` it stays a
 * draft" (still true — `write_post` — and kept in the skill's WordPress reference: the example already
 * spells `post_status:"publish"`, so a create that leaves it out is the model's own choice) and with
 * "one per paragraph".
 *
 * 🔒 THE WORDPRESS AND JOOMLA ROWS NAME THEIR FIRST CALL (30/09/2026, `page-lists.mjs`). The rows above named
 * only the create, and the create needs one fact they could not carry: which category or query the page the
 * customer named lists. In 14 of 16 WordPress and Joomla add-by-chat runs the first call was never named; the
 * Joomla row sent the model to `content.list {kind:"category"}`, a door that lists all 97 categories and cannot
 * say which one a page lists (8 of 8 Joomla runs listed them, then read the page's menu item anyway), and those
 * runs averaged 9.8 steps against 4.4 for the EmDash runs that follow a named procedure (row below). Now the
 * row names `content.read {view:"pages", url}`, whose answer carries `lists.create` — the create with the
 * category (Joomla: the one the page's menu item lists, in its language) or the category ids/slug (WordPress:
 * the page's `wp:query`) already filled in, read off the site by the host. The category clauses of the two
 * review rows above moved there: the door fills what the page needs, the row says only what the customer's
 * words decide. Both rows are SHORTER than the ones they replace (WordPress 418 → 412, Joomla 476 → 474), so
 * the every-step prefix does not grow, and each still spells what to send when the page has no `lists` — a
 * page that lists nothing the host can name (no query, a menu item that is not a category list, a read that
 * failed): the shape that always worked, and on Joomla the road to the category, which is the menu item's
 * `link`. On WordPress the road to the category is not in the row any more (the clause `post_category:[id] if
 * their page's wp:query has taxQuery.category` went with the others): a page that HOLDS a query the host could
 * not reduce to one call — the seeder's category page with child pages, a filtered or a nested one — is
 * answered with `lists.note`, which says where to read the query and that a post outside it shows nowhere
 * (PP-3), and no `create`. The one gap left is a page whose own read failed: it carries neither the note nor the
 * clause. The names in the fallback are held to the door's tables by `test/consistency.test.mjs`.
 * @type {Record<string, string>}
 */
const ADD_RECORD = Object.freeze({
  wordpress:
    '- Adding a record: `content.read {view:"pages", url:<the page>}` answers `lists.create`, the call to fill (a page: `kind:"page"`), else `kind:"post", fields:{post_title, post_content, post_status:"publish"}`. `post_content` as `<!-- wp:paragraph -->` blocks. Only what the customer gave: `post_date:"YYYY-MM-DD 00:00:00"` for a day they named (not today); no excerpt, picture or other-language copy unless named.',
  joomla:
    '- Adding a record: `content.read {view:"pages", url:<the page>}` answers `lists.create`, the call to fill, else `kind:"article", fields:{title, catid, state:1, language, publish_up:"YYYY-MM-DD 00:00:00", introtext}, apply_id`; `catid` is `id=` in its `native` menuItem\'s `link` (`content.get {kind:"menuItem", id}`). Only what the customer gave: no picture, extra category or other-language copy unless named. A new PAGE with its menu item: `page.create`.',
  emdash:
    '- Adding a record: it lives in the collection LABELLED like the listing page — ONE `schema_list_collections` gives its slug and `recordFields` (else `schema_get_collection {slug}`) — then ONE `content_create {collection, slug, status:"published", data:{title, date:"YYYY-MM-DDT00:00:00Z", …}}`. Only what the customer gave: no category, excerpt, picture or other-language copy unless named.'
})

/**
 * THE LOOK ROAD: how a mode with a shell changes how one element looks, per platform (fix G of
 * perf/agent-accuracy-speed, 29/09/2026). David lifted RAISE 2 that day — a picked element's look is
 * CHANGED by the agent, not refused — and the pick turn now only points here (`comment-turn.mjs`
 * `LOOK`), because this line knows the platform and the mode and that one knows neither.
 *
 * 🔒 WHAT THE v6 DESIGNER BENCH MEASURED (BEFORE, `ANALYSIS-designer.md`): 43.5 % of agent time
 * went before the first change of a turn, finding where a look lives — theme archaeology, WordPress
 * core, T4 internals, whole-webroot greps — and 8 of 15 FAILs were traps this line names:
 * - the customer's "white" became the nearest grey token on WordPress AND Joomla (L2-01), so the
 *   value named wins;
 * - WordPress's orange is two tokens — `settings.custom.tracy.brand.orange` and the palette `warn`
 *   that seeded page content uses inline (`about.html` fixture: `color: var(--wp--preset--color--warn)`)
 *   — and L4-01 and L5-01 changed one; CSS put in the user global-styles record replaced the theme's
 *   own `styles.css`, which holds its dark mode (theme.json `styles.css`, released 1.1.0/1.2.0);
 * - on Joomla an edit to `etc/theme/*.json` changed nothing a visitor saw: Tracy's T4 templates load
 *   `css/styles/<theme>.css` after T4's bundle (`index.php`, released 1.2.0), so its tokens win; and
 *   seven runs deleted `media/t4/*` because the template's own notes say to clear it, which caused 3
 *   of 4 `page.look` failures — T4 rebuilds both on the next request (its `Optimizer/Base.php` by
 *   mtime, `Document/Template.php` by the rendered CSS's hash);
 * - an EmDash rebuild is a full `astro build` (41–165 s): one per turn, never one per edit.
 * `page.look {style}` (fix C) names the rule, stylesheet and token in one ~6 s call; a rule it finds
 * in `/media/t4/optimize/` is a Joomla bundle, so the Joomla line says where its source is.
 *
 * 🔒 ONLY WHERE THE MODE CAN ACT ON IT (`toolReach`): a Joomla compile and an EmDash rebuild take a
 * shell, and so does every road here on EmDash. A mode without one gets the one line that is true
 * for it (`LOOK_NONE`), naming the mode that can, and the words it can change instead.
 * @type {Readonly<Record<string, string>>}
 */
const LOOK_ROAD = Object.freeze({
  // 🔒 WORDPRESS LOOKS LIVE IN ADDITIONAL CSS (09/10/2026, `look-set.mjs`): a rule appended to a theme
  // stylesheet or a value edited in `theme.json` vanished at the next theme update (Tracy's themes update
  // themselves), so the road by hand writes where look.set writes.
  // ⚠ ONLY WHERE THE PAGE PRINTS IT (#1710, dev wp-tracy-ai, 25/10/2026): a block theme prints Additional CSS
  // inside global styles, and a page that drops them printed none of it — the agent wrote there twice, told
  // the customer it chose it so an update would keep it, and the rule never showed. Such a page, or a file
  // the customer names, takes the theme stylesheet the page loads, with the update said to the customer.
  wordpress:
    "WordPress: look.set writes the site's Additional CSS (the `custom_css` post of the theme it runs, kept in the database, so a theme update keeps it); by hand the same, with wp-cli: `wp eval 'kses_remove_filters(); wp_update_custom_css_post(wp_get_custom_css() . \"<rule>\");'` — not a theme file or `theme.json`, which a theme update replaces, unless the page does not print Additional CSS (look.set answers LOOK_SET_NOT_PRINTED) or the customer names the file: then the theme stylesheet the page loads, and tell them a theme update replaces it. A token is set again there on `:root`: `--wp--custom--<a>--<b>` (`settings.custom.<a>.<b>`), `--wp--preset--color--<x>` (palette `<x>`); one value can be both, and page content may use the preset inline (Tracy Business's orange is `custom.tracy.brand.orange` AND palette `warn`): set each. One section: a rule MORE specific than the one it beats (a block theme prints Additional CSS before its own sheets), scoped by body class (`home`, `page-id-<n>`); phones only: inside `@media (max-width: 767.98px)`. Never CSS in the global-styles record: it replaces the theme's own, dark mode included.",
  joomla:
    "Joomla (T4): a token set in `templates/<template>/css/styles/*.css` (Tracy's templates load it after T4's bundle, so it beats `etc/theme/*.json`) is edited there, no compile. A rule in `/media/t4/optimize/…` is T4's bundle of `css/template.css`, compiled from `templates/<template>/scss/`: find the selector in its `_*.scss` (grep that folder, never all of `.webroot/`), edit, then `php tools/t4-scss.php` from this folder; phones only: `@include media-breakpoint-down(md)`. T4 rebuilds its bundle and style CSS on the next request: never delete or edit `media/t4/` — \"clear the T4 optimize cache\" in the template's notes is a build-machine step.",
  emdash:
    "EmDash: the look is this site's code under `/app/src` — tokens in `styles/tokens.css`, shared classes (`.h-*`, `.btn-*`) in `styles/global.css`, one section's classes in its `views/*.astro` or `components/` (phones only: `max-md:` or `hidden md:…`). Find it with ONE `grep -rn` over `/app/src`, edit with bash in the site's container, make every look edit of the request, then ONE `tracy_site_build_emdash request site.rebuild` — never one per edit. A value the design-system slot sets (the Design system line) beats tokens.css: write the element's class relative to the slot's variable (`!py-[calc(var(--ds-btn-pad-y,15px)+4px)]`), never a literal. Swap every literal the element already has for something the slot sets (`!rounded-full` → `!rounded-[var(--ds-btn-radius,0)]`, `!px-[34px]` → `!px-[var(--ds-btn-pad-x,30px)]`); `!` only before a `var(--ds-…)` value, never before a literal."
})

/**
 * THE ONE-CALL WRITE, said before the road (PR #926, `look-set.mjs`): `look.set` writes from the
 * same reading `page.look` gives — the scoped rule, or the token where it is set — keeps a look undo
 * and answers the values before and after. The road below stays for what it refuses.
 *
 * 🔒 MEASURED BEFORE (flow D, 05/10/2026): "one button blue" 24 calls on WordPress, "hide it on phones"
 * 15–20, "primary colour except Contact" 72 calls on Joomla, nearly all of them finding a file and a
 * selector `page.look` had already named. EmDash gets the token sentence only: its sections are classes
 * in `.astro` views, which look.set does not write (it refuses them and names this road).
 * @type {Readonly<Record<string, string>>}
 */
const LOOK_SET = Object.freeze({
  wordpress:
    'Then ONE `tracy_site look.set {path, target:{text|selector, nth?:0 = the first}, props:{"background-color":"#1d4ed8"}, scope, viewport?:"mobile"}` writes it, keeps an undo and answers before/after: scope "element" this one, "page" every one like it on this page, "site" the token on every page; hide on phones = props {display:"none"}, viewport "mobile". The road below only when it refuses:',
  joomla:
    'Then ONE `tracy_site look.set {path, target:{text|selector, nth?:0 = the first}, props:{"background-color":"#1d4ed8"}, scope, viewport?:"mobile"}` writes it, keeps an undo and answers before/after: scope "element" this one, "page" every one like it on this page, "site" the token on every page; hide on phones = props {display:"none"}, viewport "mobile". The road below only when it refuses:',
  emdash:
    'A token for the whole site: ONE `tracy_site look.set {path, target:{text|selector}, props:{…}, scope:"site"}` changes it in `styles/tokens.css` with an undo (then the one rebuild). Anything else:'
})

/** The LOOK line's lead, the same on every platform: read first, the value named, this element. */
const LOOK_LEAD =
  '- LOOK (colour, size, spacing, font, showing on phones): first `tracy_site page.look {path, style:{text, props?, viewport?}}` — it names the rule, the stylesheet and the `var()` token that paint the element, and the same call checks it after the change. Use exactly the value the customer named: a named colour or size wins over the nearest token. Change this element or section only (the shared token only when every one like it should change), and nothing nobody asked for.'

/** …and the whole line for a mode without a shell: which mode can, and what this one changes instead. */
const LOOK_NONE =
  '- LOOK (colour, size, spacing, font): this mode does not change how a site looks; the Designer mode does. Say so, and what this mode can change instead: the words, pictures and links.'

/**
 * THE READ-BACK AFTER A HAND EDIT, on every platform (10/10/2026). look.set answers the values before
 * and after; a look changed by hand (a file, wp-cli, a rebuild) answers nothing about the page.
 * Measured on the stand 09–10/10 (WordPress): the agent wrote a look by hand and told the customer it
 * was done without reading the computed value back — the one check `page.look` makes in a call.
 *
 * THE LAYOUT SENTENCE (22/10/2026). A customer asked six times for a menu in one row; each time the agent
 * wrote CSS, read one computed value back and said it was done, while the real cause was a class on the
 * menu module (`nav-pills`, set in the module's own params) that no rule it wrote could outrank in the
 * way it looked for. A layout is often a class of the record that prints the element, so the look is
 * sought there first (`page.look` now names up to six classes per element, `look-style.mjs`) and "done" is
 * said for what the customer asked — the items in a row — not for a value that moved.
 *
 * THE RULE FOR NOTHING ON THE PAGE (#1710, 25/10/2026). "Add `.x { outline: 0 }`" names no element to read
 * back, so the agent read nothing and said done — for a rule saved where the page never loads it. A selector
 * no element matches now answers whether a stylesheet the page loads holds a rule for it (`look-style.mjs`
 * `findTarget`), and the sentence asks for that read.
 */
const LOOK_CHECK =
  'After a change by hand, read the element again with `page.look` and tell the customer the value it now shows — never that it is done without that reading. A layout (a row, columns, pills, stacked) is often a class set in the settings of the menu, module or block that prints it, not in CSS: look at the classes `page.look` names around the element before writing a rule, and say done only when the items stand as asked. A rule for nothing on the page: `page.look {path, style:{selector}}` says if the page loads it; CSS it does not load is not done.'

/**
 * The LOOK line for a (platform, mode), or null: none for a platform without a road above, and none
 * for a session whose mode is not known (a lane, a test) — the rules then read as they did before.
 * @param {string} platform
 * @param {string | null} role - `PRESET_ROLE`'s answer.
 * @param {boolean} shell - `toolReach`'s answer.
 * @returns {string | null}
 */
export function lookLine(platform, role, shell) {
  if (role === null || !Object.hasOwn(LOOK_ROAD, platform)) return null
  return shell ? `${LOOK_LEAD} ${LOOK_SET[platform]} ${LOOK_ROAD[platform]} ${LOOK_CHECK}` : LOOK_NONE
}

/**
 * The roads whose `tracy_site` `content.replace` is built (F3 of `perf/harness-text-edits`), keyed
 * by `replaceKey`: `wordpress`, `emdash`, `joomla` (an open site, through `content.update`),
 * `joomla-contract` (a sealed one, through `content.contract` apply) and `wordpress-contract` (a
 * WordPress site provision bound, #337) — three different writes.
 *
 * 🔒 NAME ONLY DOORS THAT EXIST — the `browser_read` lesson, now held by a test rather than by
 * memory. The replace road is the shortest one a word edit has (one call: locate, write, receipt),
 * so the context offers it FIRST — but only on a platform where the action is registered. The
 * test `every door the context names exists` reads each `tracy_site` action this text names and
 * finds it in `LOCAL_ACTIONS` ∪ `RELAY_ACTIONS`, so a platform added here before its branch ships
 * turns the suite red instead of sending agents to a refusal.
 * @type {ReadonlySet<string>}
 */
export const REPLACE_PLATFORMS = new Set(
  // IX2 (PR2, 25/09/2026): the three engines whose suites are green — sealed Joomla through its
  // contract apply (P9), WordPress through its records (P10), EmDash through its own write script
  // (P11). A WordPress site bound to its contract takes the WordPress engine (27/09): since ADR 0022
  // its Claude Cowork plugin writes records like any site's (the component decides, #337's handler test), and
  // its slots are those records' words. Open Joomla (27/09) takes its own records engine
  // (`replace-joomla-open.mjs`): articles, modules, menu items, categories and word params, each by one
  // `content.update` under one apply id.
  /** @type {string[]} */ (['joomla-contract', 'joomla', 'wordpress', 'wordpress-contract', 'emdash'])
)

/**
 * The `REPLACE_PLATFORMS` key of a site: its platform, or `<platform>-contract` when its writes go
 * through a bound contract — `joomla-contract` for every such site but a WordPress one (a sealed site
 * whose platform could not be read is written as Joomla's, as before #337).
 */
export const replaceKey = (/** @type {string} */ platform, /** @type {boolean} */ contractDoor) =>
  contractDoor ? (platform === 'wordpress' ? 'wordpress-contract' : 'joomla-contract') : platform

/**
 * The replace road, set ahead of a platform's WORDS row wherever `REPLACE_PLATFORMS` has it.
 *
 * 🔒 LOCATING WAS HALF THE BILL. 19 historical edit turns took 179 steps against a floor of 66, and
 * 73 of the 113 extra steps — 47% of the wall time, 69% of the new tokens — went on finding which
 * record and field held a string the customer could SEE. `content.replace` does that host-side
 * from the words themselves, so the model never reads a store to find them.
 */
const REPLACE_ROAD =
  // 🔒 THE ROAD, NOT ITS RULES (D23): `where`, `all`, `at` and the refusals are in the action's own
  // block of `tracy_site`'s description, sent once; said here too they cost 160 characters on every
  // step and pushed open WordPress over the develop size this file keeps (IX2, 25/09).
  'FIRST, words already on a page: `tracy_site` `content.replace {find, replace}`, `find` as they read now, rewrites them where stored in one call; its answer is the receipt. The rest is for what it cannot do. '

/**
 * Where visible text lives on a SEALED Joomla quickstart: the road the contract leaves open, and a
 * plain word on every layer it closes.
 *
 * 🔒 ON A BOUND SITE THE GENERAL JOOMLA ROW NAMES DOORS THAT ALL REFUSE. Once a contract is bound
 * the component answers `LEGACY_STRUCTURE_CODE` to `content.update`, `content.batch`, `content.delete`,
 * `extension.*`, `db.*` and `core.upgrade` (`Engine.php`), and the file fence closes every `.ini`
 * and template file. Measured 24/09 on `j-1ibzqi` (tracy-business/j6, suite v2, 33 turns): 41 steps
 * in 16 turns went on `content.get`/`content.list`/`content.update` beside the contract, 20 of them
 * on what the row and the address line pointed at — `templateStyle`, `extensionParams`, `language`
 * reads, `content.update` → `LEGACY_STRUCTURE_CODE` — 4 in C01 and 7 of C05's 22 (the logo tagline, which
 * lives in a hash-locked template file that no slot reaches).
 *
 * 🔒 THE DOOR'S ROAD, SAID THE SAME WAY HERE (J1, 26/09/2026). `CONTRACT_BLOCK` sends the agent
 * content.read → ONE apply with no inspect since `753c6923c`, while this row still said "Find them with
 * ONE inspect": two first steps in one prompt, and the inspect is the 12–20 s one (19 inspects ×
 * 13.6 s on the 25/09 Joomla bench, before `content.read` existed). So the row names the read first
 * and keeps the narrowed inspect below only for a slot the read does not show; `consistency.test.mjs`
 * pins both texts to the same first step. "Anything no slot holds" replaced "anything the inspect does
 * not list" for the same reason: the read already tells a slot (writable) from a field that is not.
 *
 * 🔒 ONE INSPECT PER REQUEST, BECAUSE NARROWER IS NOT FASTER. The component reads only `operation`;
 * `page`, `entity` and `slots` are cut host-side by `narrowInspect` after the whole answer arrived.
 * Measured: 12.5 s median narrowed (n=96, 10.1–22.0 s), 19.1 s unnarrowed; the suite ran 123
 * inspects in 33 turns, C04 alone 44 of them (568 s, then a timeout) and C10 16 (229 s). The call
 * named here is the one the host narrows best: one page, text slots only, and `match` — the words
 * the agent looks for — so the answer carries the slot it needs and not the page's 200 others.
 *
 * 🔒 THE TWO-LINE HEADING IS THE CASE THAT FAILED MOST. `tb-hero` prints `title`, then
 * `title-accent` on a second line, and the contract refuses to empty an occupied slot. Five of the
 * 33 cases change that headline: r2 wrote `title` alone and left the old accent on screen (C01,
 * C29: FAIL) or asked the customer instead of writing (C15, C16, C33).
 *
 * 🔒 SITE FACTS ONLY; THE DOOR'S RULES ARE IN THE DOOR'S DESCRIPTION (25/09, plan v2 D23). This row
 * used to carry the apply's shape too — `expected_revision`, `apply_id`, `request_id`, the occupancy
 * rule — which the `tracy_site` description also states: 1,307 characters (1,734 with the replace
 * road), re-read every step, saying one thing twice in two wordings. Two wordings of one rule are how V6 found the context and
 * the description telling the agent two different things about languages. So the apply's rules live
 * once, in the description, and the one sentence both must say — which language a slot changes in —
 * is one constant both quote (`CONTRACT_LANGUAGE_RULE`).
 *
 * 🔒 VERSION-AGNOSTIC: THE INSPECT DECIDES, NOT A LIST. The 24/09 row listed what no slot reaches on
 * Tracy's templates — "the logo's name and tagline, the site name in the browser tab …". That was
 * true of tracy-business/j6 1.1.0 and false the day 1.2.0 shipped a `[Tracy] Site identity` slot
 * for exactly those (tracy-apple 1.3.0 and tracy-airbnb 1.2.0 carry it too): a sealed row read as a
 * claim would have told the agent the logo cannot change on a site where it can. So the row names
 * the identity slot conditionally and leaves every other "can this change?" to the inspect's list.
 *
 * 🔒 THE PAGE IS NAMED AS A ROUTE, WITH AN EXAMPLE. `page:"<the page>"`, read right after `page.text
 * {path:"/"}`, was sent as a path in 31 of 32 Joomla cases of the PR1 bench (25/09: "/" ×80, "/en/"
 * ×28, "/about", "Home"); each came back an empty list, which the "does not list" rule below turned
 * into "cannot change" (C12). `narrowInspect` now reads a path as its route and names the routes
 * when none matches; the example saves that step.
 */
const SEALED_JOOMLA_WHERE = `in the content contract's slots. \`content.read\` shows them (a writable field's \`next\` is the apply): change them with ONE apply carrying every change (its rules are in \`tracy_site\`'s description). Only when the read does not show the slot, find it first with ONE \`content.contract {operation:"inspect", page:"<its route: home, contact…>" (or [every page the request touches]), slots:"text", match:"<words you look for>"}\`. If the inspect lists \`[Tracy] Site identity\`, the site name, slogan, monogram, phone, e-mail, address, hours and social links are ONE slot each for every page and language and may be emptied or filled; words showing \`{site.name}\` or \`{contact.*}\` stay tokens. A heading on two lines is two slots (\`…/title\`, \`…/title-accent\`): a new heading fills BOTH, split at a natural break into two non-empty parts. ${CONTRACT_LANGUAGE_RULE} Anything no slot holds — other words, SETTINGS, PHRASES, PRESENTATION, WHAT IS INSTALLED — changes as on any Joomla site: \`tracy_site\` \`content.update\` and its other actions first (they keep a receipt and an undo), else template files and overrides under \`.webroot/templates/\`; never SQL. ${QUICKSTART_DESIGN_RULE}`

/**
 * Where visible text lives on a WordPress site provision BOUND to its contract (#337): the same road
 * as sealed Joomla's — content.read shows the slots, ONE apply changes them, a narrowed inspect only
 * for a slot the read does not show (J1, as `WORDPRESS_CONTRACT_BLOCK` says it) — in WordPress's own
 * words. `identity.*` is named "when the site has them", not "when the inspect lists them": the road
 * no longer passes through an inspect.
 *
 * 🔒 WHAT A SLOT IS HERE, SAID ONCE. The inspect of a bound WordPress site answers the SOURCE
 * edition's slots, keyed `<page>.<block>` after the named blocks of the mapped pages (`home.hero.heading`),
 * plus the options the contract maps: `site.name` / `site.tagline`, and from `tracy-business/wp7` 1.2.0
 * the fourteen `identity.*` fields the theme prints in the header, footer and browser tab
 * (`inc/identity.php`). #337 said this in the contract line together with the refused writes; the
 * refused writes are not named here (no text names an action this site's `tracy_site` does not list —
 * `consistency.test.mjs`), and neither is a build request for a new language, which WordPress's build
 * tool does not have.
 *
 * 🔒 NO PICTURE ROAD, SAID AS SUCH. The WordPress contract has no picture slot, so the words-only
 * answer is the truthful one; an agent asked for a new hero picture says so instead of looking for a
 * way in.
 */
const SEALED_WORDPRESS_CONTRACT_WHERE = `in the content contract's slots: the named blocks of the mapped pages, keyed \`<page>.<block>\` (\`home.hero.heading\`), and the site-wide \`site.name\`, \`site.tagline\` and — when the site has them — \`identity.*\`, the name, slogan, monogram, contact details and social links the header, footer and browser tab print. \`content.read\` shows them (a writable field's \`next\` is the apply): change them with ONE apply carrying every change (its rules are in \`tracy_site\`'s description). Only when the read does not show the slot, find it first with ONE \`content.contract {operation:"inspect", page:"<its route: home, about, contact…>" (or [every page the request touches]), match:"<words you look for>"}\`. ${WORDPRESS_CONTRACT_LANGUAGE_RULE} A picture slot takes the path media.draw {prompt, slot} answers. Anything no slot holds — other words and pictures, SETTINGS, PHRASES, PRESENTATION, WHAT IS INSTALLED — changes as on any WordPress site: \`tracy_site\` \`content.update\` and its other actions first (they keep a receipt and an undo), else the files of the theme this site runs (its child theme's first, when one runs); never SQL. ${QUICKSTART_DESIGN_RULE}`

/**
 * THIS SITE'S OWN ADDRESSES, rendered above the platform prose that explains them.
 *
 * 🔒 THE LINE THAT REMOVES A QUARTER OF THE CALLS. Decoded from four sessions on 17/09: of 213 tool
 * calls, **53** were reads whose only purpose was finding WHICH RECORD holds the thing the customer
 * named — the template style carrying the brand (8), the module drawing the breadcrumb (11), which
 * languages exist (27), the menu item that is the front page (7). The prose below already told the
 * agent the mechanism and it is a good sentence; what it could not say is `id 17`.
 *
 * 🔒 ADDRESSES, NEVER VALUES. An id survives every edit this tool exists to make — renaming the
 * breadcrumb does not renumber the module — so it can be stated flatly, with no freshness claim and
 * nothing inviting the agent to go and check. A VALUE would be wrong the moment the agent wrote to
 * it, and a stale value injected as fact is worse than no fact at all: it is acted on without a
 * reason to doubt it. The door answers values; this line answers where.
 *
 * Absent when nothing could be measured, which is how `collect-site-facts` reports a site it could
 * not reach — so the agent falls back to the prose, exactly where it was before.
 *
 * @param {Record<string, unknown> | null} facts
 * @param {string} platform
 * @returns {string | null}
 */
export function addressLine(facts, platform) {
  if (facts === null || typeof facts !== 'object') return null
  /** @param {unknown} v */
  const has = (v) => v !== undefined && v !== null && v !== ''
  const parts = []
  if (platform === 'joomla') {
    if (has(facts.templateStyleId))
      parts.push(
        `the default template style is \`${facts.templateStyleId}\`${has(facts.template) ? ` (${facts.template})` : ''} — the brand lives in its params`
      )
    if (has(facts.breadcrumbsModuleId))
      parts.push(`the breadcrumbs module is \`${facts.breadcrumbsModuleId}\``)
    if (has(facts.homeMenuItemId)) parts.push(`the front page is menu item \`${facts.homeMenuItemId}\``)
    const prefixes =
      facts.languagePrefixes !== null &&
      typeof facts.languagePrefixes === 'object' &&
      !Array.isArray(facts.languagePrefixes)
        ? /** @type {Record<string, unknown>} */ (facts.languagePrefixes)
        : null
    const home =
      typeof facts.siteLanguage === 'string' && facts.siteLanguage !== '' ? facts.siteLanguage : null
    /** @param {unknown} code */
    const prefixOf = (code) => {
      const sef = prefixes?.[String(code)]
      return typeof sef === 'string' && sef !== '' ? sef : null
    }
    /** @param {unknown} code - where that edition is served: `/ru/`, or `/` for a default without prefix */
    const pathOf = (code) => {
      const sef = prefixOf(code)
      if (sef === null) return null
      return code === home && facts.defaultPrefixRemoved === true ? '/' : `/${sef}/`
    }
    if (Array.isArray(facts.languages) && facts.languages.length > 0)
      parts.push(
        `the only language${facts.languages.length > 1 ? 's' : ''} installed ${facts.languages.length > 1 ? 'are' : 'is'} ${facts.languages
          .map((one) => {
            // the URL prefix of a published language, when the language filter serves one (J4)
            const at = pathOf(String(one).split(' ')[0])
            return at === null ? String(one) : `${one} \`${at}\``
          })
          .join(', ')}`
      )
    // J4: which edition `/` is. An agent asked for "the Russian version" of a 44-language site asked
    // the customer which one, or read pages to find it; the prefix is the site's own `sef`.
    if (home !== null && prefixes !== null) {
      const at = pathOf(home)
      parts.push(
        at !== null && at !== '/'
          ? `\`/\` opens \`${at}\`, the ${home} edition (the default)`
          : `\`/\` is the ${home} edition (the default)`
      )
    }
  } else if (platform === 'wordpress') {
    if (has(facts.theme))
      parts.push(
        `the active theme is \`${facts.theme}\`${has(facts.themeKind) ? `, a ${facts.themeKind} theme — that decides which edit works` : ''}`
      )
    if (has(facts.permalinks)) parts.push(`permalinks are \`${facts.permalinks}\``)
    // 🔒 NOT `activePlugins` (dropped 25/09). A count is a VALUE — the rule above — and it named no
    // plugin, so it answered nothing an agent asks; yet it changed the whole block's bytes each time a
    // plugin was switched on or off, and a changed block is re-sent whole (≈ 2.2k tokens, then re-read
    // on every later step). `plugin.list` answers which plugins, when a request needs it.
  }
  return parts.length === 0 ? null : `- This site, measured: ${parts.join('; ')}.`
}

/** The platform a mode was written for, read off its id (`designer-wordpress`), or null. */
const PRESET_PLATFORM = /-(wordpress|joomla|emdash)$/
/** The role a mode was written for, read off its id (`seo-geo-joomla`), or null. */
const PRESET_ROLE = /^(designer|developer|writer|seo-geo)-/

/**
 * Which of the tools the working rules name this session's agent actually has: a shell (`bash`) and
 * a visible plan (`todo_write`). Read off the tool list the agent is sent, never off the mode's name.
 *
 * 🔒 A RULE THAT NAMES A TOOL THE MODE LACKS COSTS A STEP, THEN A HABIT. Writer and SEO/GEO carry no
 * `bash`, `todo_write`, jobs or plan (`config/mode-matrix.json`), yet until 28/09 every mode read "call
 * `todo_write` FIRST", "`grep -rn` … over `language/en-GB/`" and "`php cli/joomla.php cache:clean`".
 * The tool list is the truth the rules must match — a preset renamed or re-cut changes it, and a
 * hand-kept table of roles would not follow.
 *
 * 🔒 UNKNOWN IS "EVERYTHING", SO THE TEXT FALLS BACK TO WHAT IT WAS. No list (a lane, a test double,
 * a dsh without `schemas`) or an empty one keeps every sentence as it read before this reading
 * existed; the list is fixed when the agent is made (CS1), so the block stays byte-stable per
 * (site, mode).
 * @param {Iterable<string> | null | undefined} tools - the names of the tools the agent is sent.
 * @returns {{ shell: boolean, todo: boolean }}
 */
export function toolReach(tools) {
  const names = tools === null || tools === undefined ? new Set() : new Set(tools)
  if (names.size === 0) return { shell: true, todo: true }
  return { shell: names.has('bash'), todo: names.has('todo_write') }
}

/**
 * The build on record for a site folder, or null when no build ran from it.
 *
 * 🔒 A BUILD IS FILED UNDER THE SITE IT DRESSED, NOT UNDER THE WORKSPACE IT RAN FROM.
 * `jobFileFor` names the file after `targetSiteKey`, so when a build dresses another site this
 * workspace holds NO file under its own key and `readJob` answers null — the context then shows
 * no Build line at all, and the agent cannot even tell that a build happened. Measured 20/09/2026
 * in `site-4x82yk`: the only file in `docs/agents/build/sites/` was `ban-xe-noi-that.tracy.test.json`.
 * So when this workspace's own key has no job, look for the one it does have.
 * @param {string} folder - the site's workspace folder.
 * @param {string} siteKey - the site's key (`.tracy/site.json`), else its label.
 * @returns {Promise<ReturnType<typeof readJob>>}
 */
export async function buildJobOf(folder, siteKey) {
  const own = readJob(folder, siteKey)
  if (own !== null) return own
  try {
    const filed = (await fs.readdir(path.join(folder, 'docs', 'agents', 'build', 'sites')))
      .filter((name) => name.endsWith('.json'))
      .sort()
    for (const name of filed) {
      const other = readJob(folder, name.slice(0, -'.json'.length))
      if (other !== null) return other
    }
  } catch {
    // No builds have run from this workspace at all.
  }
  return null
}

/**
 * Whether a site's build is still open — running, waiting on the customer, paused or failed — so the
 * conversation may need to answer, rerun or follow it. False with no build on record, or one done.
 * Reads only files (no docker call): `agent/created` asks it before any step.
 * @param {string} folder - the site's workspace folder.
 * @param {string} label - the folder's site label, the key when `.tracy/site.json` names none.
 * @returns {Promise<boolean>}
 */
export async function siteBuildOpen(folder, label) {
  try {
    const record = await readJsonObject(path.join(folder, '.tracy', 'site.json'))
    const job = await buildJobOf(folder, text(record?.siteKey) ?? label)
    return job !== null && job.status !== 'done' && buildLine(job) !== null
  } catch {
    return false
  }
}

/**
 * The build line: where the site's build stands, or null when this site has no build on record.
 * @param {ReturnType<typeof readJob>} job
 * @returns {string | null}
 */
export function buildLine(job) {
  if (job === null || !Array.isArray(job.stages) || job.stages.length === 0) return null
  const total = job.stages.length
  /** @param {string} status */
  const at = (status) => job.stages.findIndex((stage) => stage.status === status)
  /** @param {number} index */
  const named = (index) => `"${job.stages[index].name}" (${index + 1} of ${total})`
  switch (job.status) {
    case 'done':
      return 'done'
    case 'failed': {
      const index = at('failed')
      const detail = index >= 0 ? text(job.stages[index].detail) : null
      return index >= 0 ? `failed at ${named(index)}${detail ? `: ${detail}` : ''}` : 'failed'
    }
    case 'waiting': {
      const index = at('waiting')
      const detail = index >= 0 ? text(job.stages[index].detail) : null
      return `waiting${index >= 0 ? ` at ${named(index)}` : ''}${detail ? `: ${detail}` : ''}`
    }
    case 'running': {
      const index = at('running')
      return `running${index >= 0 ? ` ${named(index)}` : ''}`
    }
    // A deploy asked long work to hold off (#295): the run started no new stage and resumes by itself
    // once the host is back, so the next stage is the first one not yet done.
    case 'paused': {
      const index = job.stages.findIndex((stage) => stage.status !== 'done' && stage.status !== 'skipped')
      return `paused${index >= 0 ? ` before ${named(index)}` : ''} while the host updates; it resumes by itself`
    }
    default:
      return null
  }
}

/** The producer a site-state notice names; also how the last one sent is found in the session log. */
export const SITE_STATE_PLUGIN = 'tracy-site-tools:site-state'

/** A site-state notice, whole: small enough that re-sending it on a stage change costs nothing. */
const SITE_STATE_CHARS = 300

/**
 * What changes about a site WHILE a conversation runs — today its build — as its own small notice,
 * or null when there is nothing to say.
 *
 * 🔒 THE BUILD LINE LEFT THE SITE CONTEXT, BECAUSE A STAGE CHANGE RE-SENT THE WHOLE BLOCK. The context
 * is sent again whenever ANY byte of it differs (the pre-step hook compares whole texts), and it is
 * 7–10k characters of rules that never change — so `Build: running "seed" (3 of 6)` becoming `(4 of
 * 6)` re-sent ≈ 2.2k tokens of rules to say one number, and those tokens are then re-read on every
 * later step (plan v2 V2 §4: 10 whole re-sends in 8 of 78 historical sessions). Develop's `paused`
 * status (#295) adds a running ↔ paused flip around every deploy. So the block keeps only what stays
 * put, and this notice — at most 300 characters — is what the hook re-sends alone when it changes.
 *
 * @param {{ build?: string | null } | null | undefined} state - `siteContext(…).state`.
 * @returns {{ text: string, summary: string } | null}
 */
export function siteStateNotice(state) {
  const build = text(state?.build)
  if (build === null) return null
  const open = '<system-reminder>\n- Build: '
  const close = '\n</system-reminder>'
  const room = SITE_STATE_CHARS - open.length - close.length
  const line = build.length > room ? `${build.slice(0, room - 1)}…` : build
  const summary = `build ${build}`
  return {
    text: `${open}${line}${close}`,
    summary: summary.length > 120 ? `${summary.slice(0, 119)}…` : summary
  }
}

/** The producer a today notice names; also how the last one sent is found in the session log. */
export const TODAY_PLUGIN = 'tracy-site-tools:today'

/**
 * Today's date, as one small notice of its own (fix A of perf/round7, 30/09/2026).
 *
 * 🔒 THE ONE FACT A DATE REQUEST NEEDS AND NO SITE FILE HOLDS. "Post it, dated 15 Sep" makes the model ask
 * whether that day is past or coming — publish, or schedule — and nothing it was sent said what day it
 * is. 5 of the 12 add-a-post runs of the round-7 bench went looking: Designer and Developer with a
 * `bash date` step (3 runs), Writer and SEO/GEO, which have no shell, with file-tool globs over `.webroot`
 * logs and caches to read a timestamp off (4 globs, 3 of them timing out at 30 s apiece: 90 s of one
 * 238 s turn). The answer was on the host's clock all along.
 *
 * 🔒 A NOTICE OF ITS OWN, AFTER THE CUSTOMER'S MESSAGE — NEVER IN THE CONTEXT BLOCK, NEVER IN THE BUILD'S.
 * The context is the cached prefix and stays byte-stable per (site, mode): a date in it would change that
 * prefix once a day, for every site. The site-state notice is re-sent on every change, and a change there
 * also drops this conversation's read snapshots (`memory.invalidateSite`): a date must not do that at
 * midnight. So it has its own producer, goes out once per conversation, and again only when the day has
 * changed under one that spans midnight (the pre-step hook compares with `lastToday`).
 *
 * The clock is the host's and the day is UTC, said as such: the site's own time zone is not known to the
 * host (WordPress and Joomla keep one in their settings, EmDash has none), and "UTC" lets the model reason
 * about a customer's evening where an unlabelled date would be quietly wrong for half the world. The
 * weekday comes off the same clock, for "this Friday".
 *
 * @param {Date} now - the host's clock.
 * @returns {{ text: string, summary: string } | null} null for a clock that answers no date.
 */
export function todayNotice(now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null
  const day = now.toISOString().slice(0, 10)
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  return {
    text: `<system-reminder>\n- Today: ${weekday} ${day} (UTC).\n</system-reminder>`,
    summary: `today ${day}`
  }
}

/** The producer a Files-tab notice names; also how the last one sent is found in the session log. */
export const FILES_PLUGIN = 'tracy-site-tools:files'

/**
 * The notice of a design check run after a look edit made outside `tracy_site` (ADR 0023, "Addendum
 * 30/09", `design-drift.mjs` `driftNotice`). A producer of its own, like the date's and the files'.
 */
export const DESIGN_DRIFT_PLUGIN = 'tracy-site-tools:design-drift'

/**
 * The site's notes (`site-notes.mjs`): what people asked this site to keep, as a notice of its own,
 * sent when the notes changed and again if the earlier one was compacted out of sight.
 */
export const NOTES_PLUGIN = 'tracy-site-tools:notes'

/**
 * The one-line notice on a message whose lasting wish the host is keeping (`site-notes.mjs` `WISH_KEPT`): a
 * producer of its own, so it never reads as the notes themselves (`lastNotes`).
 */
export const WISH_PLUGIN = 'tracy-site-tools:wish'

/**
 * The pictures in the customer's Files tab, as one small notice of their own (fix E of perf/round7,
 * 30/09/2026).
 *
 * 🔒 THE ONE FACT A "USE THE PICTURE I UPLOADED" REQUEST NEEDS, AND NOTHING THE MODEL WAS SENT SAYS. A
 * file in the Files tab is in the site folder, not in the site's media library; it gets there with one
 * `media.upload {file}`, whose answer names the path or id to write. Told nowhere, models hunted for it
 * first — `media.scan` (twice, for a limit), `media_list` (three pages), glob and `find` over the
 * webroot (a 30 s timeout), `grep` over a spill file — and only then tried the upload, which worked in
 * one call: 5 of the 12 round-7 runs that used an uploaded picture, about 20 calls, a Writer's first write at step 7 of 9. The tool
 * description already names `media.upload {file}` (and the Writer read it): a fact beside the customer's
 * message is what changes what a model does first. The names come from the folder itself
 * (`filesTabPictures`, upload.mjs): nothing tells the host the customer just dropped a file, but the
 * folder says which pictures are there.
 *
 * 🔒 A NOTICE OF ITS OWN, AFTER THE CUSTOMER'S MESSAGE — NEVER IN THE CONTEXT BLOCK. The context is the
 * cached prefix and stays byte-stable per (site, mode); this changes when the customer adds a file.
 * It goes out once per conversation, and again only when the list changes (the pre-step hook compares
 * with `lastFiles`). It states what is there and what the door is; it does not say the customer wants
 * any of them on the site — a folder of old pictures and a request about a heading stay unrelated.
 * @param {readonly string[]} names - `filesTabPictures(…)`.
 * @returns {{ text: string, summary: string } | null} null when the folder holds no picture.
 */
export function filesNotice(names) {
  if (!Array.isArray(names) || names.length === 0) return null
  const list = names.join(', ')
  const summary = `Files tab: ${list}`
  return {
    text:
      '<system-reminder>\n- Pictures in the Files tab (the site folder, not the media library): ' +
      `${list}. To use one: media.upload {file:"<name>"} first, then the path or id it answers. ` +
      'Do not media.scan, glob or ls for it.\n</system-reminder>',
    summary: summary.length > 120 ? `${summary.slice(0, 119)}…` : summary
  }
}

/**
 * The order the build questions are asked in — the Joomla and WordPress question sets'
 * (`packages/site/tracy-site-build-{joomla,wordpress}/questions.json`: name, about, pages, languages,
 * tone; EmDash asks the first two). A test holds this against those files, so the customer's answers
 * read in the order they were asked, on every host, every time.
 */
export const ANSWER_ORDER = Object.freeze(['name', 'about', 'pages', 'languages', 'tone'])

/** How much of ONE answer is worth re-sending on every step. */
const ANSWER_CHARS = 220
/** And the whole line, so a questionnaire with thirty answers cannot become the context. */
const ANSWERS_CHARS = 900

/**
 * What the customer ANSWERED when this site was built, as one line.
 *
 * 🔒 THE ANSWERS WERE ON DISK ALL ALONG AND THE AGENT NEVER SAW THEM. `readJob` returns the build
 * job, `job.answers` is the questionnaire the customer filled in — their company name, their
 * sector, who they sell to, what the site is for — and `siteContext` rendered only `buildLine`,
 * which is a STATUS. So the one place the customer had already said what their business is was
 * read into memory and thrown away on every single turn.
 *
 * That is the context the "never invent facts" rule most needs. Without it an agent asked to write
 * a headline has nothing but the template's placeholder text, and inventing a plausible one is
 * exactly the failure that rule exists to stop — the customer's own words were sitting in the same
 * file as the build status.
 *
 * 🔒 VALUES ARE CAPPED, AND KEPT AS THE CUSTOMER WROTE THEM. One free-text answer can be a page,
 * and this line is re-sent on every step (the whole conversation is), so an uncapped answer is
 * paid for once per step for the rest of the session. Capped per value and again overall; a
 * truncation says so with `…`, because an answer silently cut in half reads as the whole answer.
 * Nothing is reworded: these are the customer's sentences, and the agent is about to quote them.
 *
 * 🔒 IN ONE ORDER, WHOEVER WROTE THE FILE LAST. This walked `Object.entries`, i.e. the order the JSON
 * held — and the build merges answers by spreading (`{ ...job.answers, ...answers }`,
 * `tracy-site-build-core/src/host/build.mjs:408` and `:477`), so the same answers came back in
 * another order depending on which writer ran last. The context is re-sent whole whenever a byte
 * differs: in 78 historical sessions the whole block went out again 10 times, the key flip was part
 * of 7 of those and the ONLY change in 4 (plan v2 V2 §4). Now the questions come in the order the
 * question sets ask them (`ANSWER_ORDER`), then any other answer by name.
 *
 * @param {{answers?: unknown} | null} job - the build job, as `readJob` returns it.
 * @returns {string | null} the line, or null when nothing was answered.
 */
export function answersLine(job) {
  const answers = job?.answers
  if (answers === null || typeof answers !== 'object' || Array.isArray(answers)) return null
  const record = /** @type {Record<string, unknown>} */ (answers)
  const keys = Object.keys(record)
  const asked = ANSWER_ORDER.filter((key) => keys.includes(key))
  // Code-unit order: the same on every host, whatever its locale.
  const rest = keys.filter((key) => !ANSWER_ORDER.includes(key)).sort()
  const parts = []
  let spent = 0
  for (const key of [...asked, ...rest]) {
    const value = record[key]
    const written = Array.isArray(value) ? value.filter((one) => typeof one === 'string').join(', ') : value
    if (typeof written !== 'string' && typeof written !== 'number' && typeof written !== 'boolean') continue
    const one = String(written).replace(/\s+/g, ' ').trim()
    if (one === '') continue
    const capped = one.length > ANSWER_CHARS ? `${one.slice(0, ANSWER_CHARS - 1)}…` : one
    if (spent + capped.length > ANSWERS_CHARS) {
      parts.push('…')
      break
    }
    spent += capped.length
    parts.push(`${key}: ${capped}`)
  }
  return parts.length === 0 ? null : parts.join(' · ')
}

/**
 * Names shown per group before the line points at the record instead. A catalogue system has 56
 * tokens and fits; an EmDash template declares its own (Tracy Business: 77, 55 of them colours),
 * and the whole line has to stay under ~0.9 KB because it is re-read on every step.
 */
const NAMES_PER_GROUP = 20

/** The CSS custom-property names of a design record, grouped the way an agent reaches for them. */
const TOKEN_GROUPS = /** @type {const} */ ([
  ['colour', /^--(color-|bg|surface|fg|muted|meta|border|accent|success|warn|danger)/],
  ['type', /^--(font|text|leading|tracking)/],
  ['space', /^--(space|radius|container|section|elev|focus|motion|ease)/]
])

/**
 * How the record's tokens are spelled on this CMS's pages, so the agent writes the name that
 * exists there rather than the vendor's.
 * @param {string} platform
 */
function tokenSpellingOn(platform) {
  if (platform === 'wordpress')
    return 'On WordPress they read `--wp--preset--color--<name>` / `--wp--preset--font-family--<slug>` (theme.json presets)'
  if (platform === 'emdash')
    return "On EmDash they are the template's @theme tokens in src/styles/tokens.css: write the Tailwind class (`bg-<name>`, `text-<name>`) or var(--color-<name>)"
  return "On Joomla they are compiled into the template's CSS; write the template's own `--<name>` variables"
}

/** The CMSes a design-system slot reaches (`ds-slot-worn.mjs` `slotReadArgv`). */
const SLOT_PLATFORMS = new Set(['emdash', 'wordpress', 'joomla'])

/** How many characters of a worn slot's variable names the line shows before it counts the rest. */
const SLOT_NAMES_CHARS = 330

/**
 * The families a slot's variables are listed by, in the order an element edit reaches for them: corners
 * and button padding, colours, fonts, then the system's sizes and weights. One family is written once,
 * `--ds-c-{bg,fg,accent}`, which halves the line on every CMS (10/10/2026: the plain list cost ~400 of
 * the line's 1.4 KB and cut the fonts off).
 */
const SLOT_FAMILIES = Object.freeze([
  '--ds-btn-',
  '--ds-card-',
  '--radius-',
  '--ds-c-',
  '--wp--preset--font-family--',
  '--ds-font-',
  '--font-',
  '--ds-size-',
  '--ds-weight-',
  '--ds-'
])

/**
 * A slot's variable names, family by family (`--ds-c-{bg,fg}`), cut at a family boundary.
 * @param {string[]} vars
 * @returns {string} the names shown, with `+N more` when some were cut; '' when there are none.
 */
function slotNames(vars) {
  /** @type {Map<string, string[]>} */
  const groups = new Map(SLOT_FAMILIES.map((prefix) => [prefix, []]))
  for (const name of vars) {
    // font weights and sizes are the system's type scale, listed with `--ds-`, not as a font
    if (/^--(?:ds-)?font-(?:weight|size)/.test(name)) continue
    const prefix = SLOT_FAMILIES.find((one) => name.startsWith(one) && name.length > one.length)
    if (prefix !== undefined) groups.get(prefix)?.push(name.slice(prefix.length))
  }
  const parts = [...groups]
    .filter(([, rest]) => rest.length > 0)
    .map(([prefix, rest]) => ({
      text: rest.length === 1 ? `${prefix}${rest[0]}` : `${prefix}{${rest.join(',')}}`,
      count: rest.length
    }))
  let shown = ''
  let more = 0
  for (const part of parts)
    if (more === 0 && shown.length + part.text.length + 1 <= SLOT_NAMES_CHARS)
      shown = shown === '' ? part.text : `${shown} ${part.text}`
    else more += part.count
  return shown === '' ? '' : `${shown}${more > 0 ? ` +${more} more` : ''}`
}

/** The examples' mark for a template value the read did not give (`UNKNOWN_TEMPLATE_VALUE`, shortened). */
const UNKNOWN_MARK = '<T>'

/** The longest template value an example spells out; a longer one is the mark, looked up by the agent. */
const TEMPLATE_VALUE_SAID = 16

/**
 * The line for a site wearing a design system through Tracy's design-system slot (`ds-slot-worn.mjs`,
 * read from the site itself). The slot's names, never its values, as the record's line; the only value
 * said is the template's own, as the fallback an example carries.
 *
 * 🔒 RELATIVE TO THE SLOT, NEVER A COPY OF IT (measured 09–10/10/2026 on the stand dskeepem/wp/jo).
 * Nothing told the agent the site wore a system, so on EmDash "make the hero button bigger and rounder"
 * became `!rounded-full !px-[34px] !py-[17px]` on a button the system had already made a pill, and the
 * next system (2px corners) never reached it: the system's values were typed back as literals and
 * pinned. Written relative to the slot's own variables, an edit keeps following whichever system the
 * site wears; a request the page already meets is answered, not re-written.
 *
 * 🔒 EVERY EXAMPLE CARRIES THE TEMPLATE'S OWN VALUE AS ITS FALLBACK (review of #1513, 21/10/2026). The
 * examples read `var(--ds-c-accent)` with none, then the line said "keep the template's fallback" without
 * giving it: copied as taught, the element painted nothing once the system was taken off, and a fallback
 * copied off the page was the worn system's value, which stayed. The value is the template's (`template`,
 * the same read's `templateRolesOf`); not known, the example says so instead of inventing one.
 * @param {{ id: string, name: string | null, where: string, vars: string[], platform?: string }} slot
 * @param {{ tokens?: Record<string, string>, values?: Record<string, string> } | null} [template] - the
 *   roles the site's template reads and its own value for each.
 * @returns {string}
 */
function slotLine(slot, template = null) {
  const vars = Array.isArray(slot.vars) ? slot.vars : []
  const shown = slotNames(vars)
  const pick = (/** @type {string[]} */ candidates) => candidates.find((name) => vars.includes(name))
  const colour = pick(['--ds-c-accent', '--accent', '--color-signal'])
  const radius = pick(['--ds-btn-radius', '--radius-pill', '--radius-md'])
  const size = pick(['--ds-btn-pad-y', '--ds-btn-radius', '--radius-pill', '--radius-md'])
  let unknown = false
  // the template's own value for a role, in the syntax of the CMS (a Tailwind class spells a space `_`);
  // not known (or too long for the line: a face's stack, a clamp()), a short mark the sentence after the
  // examples names, so the line keeps its budget
  const own = (/** @type {string} */ name, /** @type {boolean} */ tailwind) => {
    const known = roleValueOf(template, name)
    const value = known !== null && known.length <= TEMPLATE_VALUE_SAID ? known : null
    if (value === null) unknown = true
    return value === null ? UNKNOWN_MARK : tailwind ? value.replaceAll(' ', '_') : value
  }
  // In the syntax the agent writes on this CMS: an EmDash look is Tailwind classes in `.astro` views,
  // elsewhere CSS.
  const examples = (
    slot.platform === 'emdash'
      ? [
          colour ? `\`bg-[var(${colour},${own(colour, true)})]\`` : null,
          radius ? `\`!rounded-[var(${radius},${own(radius, true)})]\`` : null,
          vars.includes('--ds-btn-pad-y')
            ? `\`!py-[calc(var(--ds-btn-pad-y,${own('--ds-btn-pad-y', true)})+4px)]\``
            : null
        ]
      : [
          colour ? `\`var(${colour}, ${own(colour, false)})\`` : null,
          radius ? `\`border-radius: var(${radius}, ${own(radius, false)})\`` : null,
          size ? `\`calc(var(${size}, ${own(size, false)}) + 4px)\`` : null
        ]
  )
    .filter((one) => one !== null)
    .join(', ')
  const name = slot.name ? `${slot.name} (\`${slot.id}\`)` : `\`${slot.id}\``
  // 🔒 THE ELEMENT'S LEFTOVER LITERALS GO TOO (stand, 10/10/2026, em-I5 on Moxie): asked for a bigger hero
  // button, the agent made its padding relative to the slot but kept the `!rounded-full` an earlier turn had
  // pinned and added `!text-[17px]`; a 2px-corner system then left the hero a pill while the band button
  // followed. So the line says to swap every literal the element carries for something the slot sets, and
  // that `!` stands only before a slot value — a literal behind `!` is what no later system can reach.
  return (
    `- Design system: ${name}, worn through Tracy's design-system slot — ${slot.where}. ` +
    'The slot owns what its variables set: colours, fonts, corner radius, button padding' +
    `${shown === '' ? '' : ` — ${shown}`}. ` +
    `Editing an element, write each of those values relative to them${examples === '' ? '' : ` (${examples})`}, and replace every literal the element already carries for one (\`rounded-full\`, \`px-[34px]\`, a hex, a font size the slot sets) the same way, asked or not: it looks the same now and follows the next system. ` +
    `${unknown ? `${UNKNOWN_MARK} is the template's own value (grep "var(--ds-")` : "The fallback is the template's own value"}, never this system's: removing it brings the template back. ` +
    '`!` (important) only before such a `var()` or `calc(var())` value, never before a literal. ' +
    'If the element already shows what is asked, change nothing and say so. ' +
    `${NEW_ELEMENT_RULE} ` +
    'A whole new look is choosing another design system, not editing CSS: say so to the customer. A colour the customer asks for is still changed where they mean it, never refused. tracy_design_check measures against the slot.'
  )
}

/**
 * 🔒 A NEW ELEMENT IS THE TEMPLATE'S OWN KIND, NEVER A STYLE OF THE AGENT'S (Akemi, 20/10/2026: "a new
 * button still follows the customer's template when no design system is worn, and the new system's rules
 * when one is"). Every rule above was about an element that already exists; a button the agent adds was
 * free to carry the hex it saw on the page, so it matched the template today and kept the template's
 * colour under every system applied later. Reusing the template's own class for that kind is what makes
 * it follow: those classes already read the design-system roles.
 */
const NEW_ELEMENT_RULE =
  "A NEW element (button, card, section) copies the classes of the template's own element of that kind, never a style of its own."

/** The status and state colour roles, named as one family on the line (`--ds-c-danger-text`, …). */
const STATE_ROLE = /^--ds-c-(?:success|warn|danger|info|disabled|focus)/

/**
 * The standard role variables every template reads (`role-variables.mjs`), for the line of a site that
 * wears no design system: names only, as every design line, grouped as an element edit reaches for them
 * (grounds, text, accent and lines; corners; faces), the status colours as one family — every name in
 * full would cost ~330 characters on every step.
 */
const ROLE_NAMES = (() => {
  const tail = (/** @type {RegExp} */ re, /** @type {string} */ cut) =>
    ROLE_VARIABLES.map((role) => role.name)
      .filter((name) => re.test(name))
      .map((name) => name.slice(cut.length))
  const colours = tail(/^--ds-c-/, '--ds-c-').filter((name) => !STATE_ROLE.test(`--ds-c-${name}`))
  const radii = tail(/^--ds-[a-z]+-radius$/, '--ds-').map((name) => name.replace(/-radius$/, ''))
  const fonts = tail(/^--ds-font-/, '--ds-font-')
  return (
    `\`--ds-c-{${colours.join(',')}}\` \`--ds-{${radii.join(',')}}-radius\` \`--ds-font-{${fonts.join(',')}}\`` +
    ' and the status colours `--ds-c-{success,warn,danger,info}{,-bg,-text}`'
  )
})()

/**
 * The line for a site that wears NO design system (the slot read answered "none", `ds-slot-worn.mjs`) and
 * was built from a Tracy template, whose stylesheets read the standard role variables with the template's
 * own value as the fallback (`var(--ds-c-accent, #A3E635)`; every template since the design-system
 * readiness round, VARS-1). They are unset until a system is worn, so a value written the same way looks
 * exactly like the template today, follows the system the customer applies later, and returns to the
 * template when it is taken off.
 *
 * 🔒 WHY THE ROLES ARE NAMED ON A SITE WEARING NOTHING (20/10/2026). Before, only a worn slot named
 * them; with nothing worn the line said "keep to the theme's own variables" or nothing at all, so an
 * element the agent added carried the template's literal hex, and the first system the customer
 * applied left it in the template's colours. The template's own value stays the fallback: never the
 * value of a system worn before, or taking it off would leave that system behind.
 * @param {string} platform
 * @param {string | null} recorded - the design record's line, when the build recorded the template's look.
 * @returns {string}
 */
function rolesLine(platform, recorded) {
  const example =
    platform === 'emdash'
      ? "`bg-[var(--ds-c-accent,<the template's value>)]`"
      : "`background: var(--ds-c-accent, <the template's value>)`"
  const head =
    recorded !== null
      ? `${recorded} `
      : "- Design system: none worn — the site shows its template's own look. "
  return (
    head +
    "The template's stylesheets read Tracy's design-system role variables with the template's own value as the fallback " +
    `(${ROLE_NAMES}); they are set only when the customer applies a design system. ` +
    "Any colour, corner radius or font an edit writes goes through them: the template's own class or variable for it, " +
    `else the role with the template's value as the fallback (${example}, as the template's stylesheet writes it for that kind of element: grep "var(--ds-"), ` +
    'never a bare hex, font name or radius, asked or not: it looks like the template now and follows a design system applied later. ' +
    `${NEW_ELEMENT_RULE} ` +
    'A value the customer names exactly is kept as they named it: say it will not follow a design system.'
  )
}

/**
 * The one line about the design system this site wears (`docs/agents/design.json`, written by the
 * build's `check` stage — ADR 0023), or null with no record. Names, never values: this file's rule.
 *
 * A slot the site wears (`slot`, read from the site itself by `ds-slot-worn.mjs`) wins over the record:
 * it is what every page prints now, whatever the build recorded (a slot is written by no door that
 * records it yet).
 *
 * `unworn` names the platform of a site built from a Tracy template that the slot read found wearing NO
 * system: when the read found its template reading the role variables (`roles`), its line names them
 * (`rolesLine`), after the record's line when the build bound one; a template from before the readiness
 * round reads none, so its line says only what holds there — the template's own classes and variables,
 * and the new-element rule.
 * @param {Record<string, unknown> | null} record
 * @param {{ id: string, name: string | null, where: string, vars: string[], platform?: string } | null} [slot]
 * @param {{ platform: string, roles?: boolean } | null} [unworn]
 * @param {{ tokens?: Record<string, string>, values?: Record<string, string> } | null} [template] - the roles
 *   the site's template reads and its own value for each (`templateRolesOf`): the fallback a worn slot's
 *   examples carry.
 * @returns {string | null}
 */
export function designLine(record, slot = null, unworn = null, template = null) {
  if (slot && typeof slot.id === 'string') return slotLine(slot, template)
  if (unworn) {
    const bound = record?.schemaVersion === 'tracy-site-design/v1' && record.bound === true
    if (unworn.roles !== false) return rolesLine(unworn.platform, bound ? recordLine(record) : null)
    // 🔒 NEVER CLAIM ROLES A TEMPLATE DOES NOT READ (measured 20/10/2026: Tracy Business EmDash 1.7.4 on the
    // stand, `/app/src/styles` holds no `var(--ds-`). Its own classes and tokens are what a slot reaches there.
    return `${bound ? recordLine(record) : "- Design system: none worn — the site shows its template's own look; keep to the template's own classes and variables, never a bare hex, font name or radius."} ${NEW_ELEMENT_RULE}`
  }
  return recordLine(record)
}

/**
 * The line for a site built from a Tracy template whose slot read has not answered yet (`undefined`: slow,
 * or failed): whether it wears a system is not known, so the line claims neither, and gives what holds
 * either way — every colour, corner radius and font through the template's own class or a role it reads
 * with the template's value as the fallback, and the new-element rule.
 *
 * 🔒 WHY A LINE AT ALL (review of #1513, 21/10/2026). A read that did not answer used to leave the context
 * with no design line and no new-element rule: a conversation whose read was slow or failed got none of
 * the rules every other line gives, and nothing kept a new element off a hex of the agent's own.
 * @param {Record<string, unknown> | null} record
 * @param {string} platform
 * @returns {string}
 */
export function unreadDesignLine(record, platform) {
  const bound = record?.schemaVersion === 'tracy-site-design/v1' && record.bound === true
  const example =
    platform === 'emdash'
      ? `\`bg-[var(--ds-c-accent,${UNKNOWN_TEMPLATE_VALUE})]\``
      : `\`background: var(--ds-c-accent, ${UNKNOWN_TEMPLATE_VALUE})\``
  return (
    `${bound ? `${recordLine(record)} ` : '- Design system: whether this site wears one could not be read yet. '}` +
    "Any colour, corner radius or font an edit writes goes through the template's own class or variable for it, " +
    `else the design-system role it reads with the template's own value as the fallback (${example}, as its stylesheet writes it: grep "var(--ds-"), ` +
    'never a bare hex, font name or radius, nor a value copied off the page as the fallback. ' +
    NEW_ELEMENT_RULE
  )
}

/**
 * The design record's own line (ADR 0023), or null with no record.
 * @param {Record<string, unknown> | null} record
 * @returns {string | null}
 */
function recordLine(record) {
  if (!record || record.schemaVersion !== 'tracy-site-design/v1') return null
  if (record.bound !== true || typeof record.id !== 'string')
    return "- Design system: none bound (docs/agents/design.json) — keep to the theme's own variables; tracy_design_check answers NO_DESIGN_BOUND."
  const tokens = record.tokens && typeof record.tokens === 'object' ? Object.keys(record.tokens) : []
  const groups = TOKEN_GROUPS.map(
    ([label, re]) => /** @type {[string, string[]]} */ ([label, tokens.filter((t) => re.test(t))])
  ).filter(([, names]) => names.length > 0)
  const named =
    groups.length > 0
      ? ` — ${groups
          .map(([label, names]) => {
            const shown = names.slice(0, NAMES_PER_GROUP).join(' ')
            const more = names.length - NAMES_PER_GROUP
            return `${label}: ${shown}${more > 0 ? ` +${more} more` : ''}`
          })
          .join(' · ')}`
      : ''
  const name = typeof record.name === 'string' && record.name !== '' ? record.name : record.id
  return (
    `- Design system: ${name} (\`${record.id}\`, ${record.source}; docs/agents/design.json). This site is BOUND to it: ` +
    `every colour, font, size and space is one of its tokens${named}. ` +
    `${tokenSpellingOn(String(record.platform ?? ''))}. Never write a hex, a font name or a px the tokens hold — write var(--…). ` +
    // ADR 0023, "Addendum 30/09": the check is no longer a step the agent may skip — a tracy_site
    // look write answers with its drift (`design-drift.mjs` `withDesignDrift`), and a look edited
    // outside it gets a notice before the next step (`lookEdit`, `driftNotice`).
    'Every look change is measured for you — a tracy_site write in its answer; a stylesheet edited with bash or a file tool, site.rebuild in a notice before your next step: fix what drifted unless the customer named that value. ' +
    'Run tracy_design_check only when that measure was skipped, or for another page.'
  )
}

/**
 * The context message's text and one-line summary for a site folder, or null when the folder holds
 * no site this plugin can name.
 *
 * 🔒 THE TEXT IS BYTE-STABLE WHILE THE SITE STANDS STILL. It is sent again whenever a byte differs,
 * and every re-send is the whole block, re-read on every later step. So everything in it is either a
 * fact that holds for the life of the site or a rule; what moves during a conversation (the build)
 * comes back as `state`, for `siteStateNotice`, never inside `text`.
 *
 * @param {string} folder - the site folder (`<sitesRoot>/<label>`).
 * @param {string} label - the folder's site label, the fallback name.
 * @param {(root: string) => Promise<string>} detectPlatform - read the CMS off a webroot.
 * @param {string | null} [presetId] - the mode the session runs (`designer-wordpress`), when known.
 * @param {{ wordpressReadBack?: boolean, buildInBlock?: boolean, tools?: Iterable<string> | null,
 *   slot?: { id: string, name: string | null, where: string, vars: string[], platform?: string } | null | undefined,
 *   roles?: { vars: string[], tokens?: Record<string, string>, values?: Record<string, string> } | null,
 *   chatDesign?: { chat: boolean, button: boolean } | null }} [options] - `chatDesign`: whether the
 *   operator lets the chat apply a design system (`chat-design-route.mjs`), read by the caller at
 *   Tracy; off, the block says so on the line after the design system's (`chatRouteLine`). `slot`:
 *   the design-system slot the site wears, read from the site by the caller (`ds-slot-worn.mjs`: a
 *   container read, and this function reads only the folder; `null` is a read that found none, `undefined` one
 *   that did not answer: then the design line claims neither, `unreadDesignLine`). `roles`: the role
 *   variables the same read found the template reading and its own value for each (`templateRolesOf`),
 *   null when it reads none — the fallback a worn slot's examples carry. `wordpressReadBack`:
 *   the WordPress fallback of plan v2 D6′ (c), for a build whose `tracy_site` does NOT check a post
 *   or templatePart body after writing it — then ONE JOB tells the agent to read that record once.
 *   Off by default: the door checks the body itself and answers `verified`. `buildInBlock`: for a
 *   build that does NOT send `siteStateNotice` (plan v2.1 IX1 drop (ii)) — then the build's state
 *   goes back into the block as its last site line, `- Build: …`, and into the summary, as develop
 *   had them. Off by default: the notice carries it and the block stays byte-stable. `tools`: the
 *   names of the tools this session's agent is sent (`toolReach`); a rule names a shell or a plan
 *   only where the agent has one. None: every rule as before.
 * @returns {Promise<{ text: string, summary: string, state: { build: string | null } } | null>}
 */
export async function siteContext(folder, label, detectPlatform, presetId, options = {}) {
  const { shell, todo } = toolReach(options?.tools)
  const record = await readJsonObject(path.join(folder, '.tracy', 'site.json'))
  const siteKey = text(record?.siteKey) ?? label
  const webroot = path.join(folder, '.webroot')
  const installed = await isDirectory(webroot)
  const platform = await sitePlatform(folder, detectPlatform)
  const start = await readJsonObject(path.join(folder, 'docs', 'agents', 'start-from.json'))
  /** @type {string[]} */
  let brands = []
  try {
    brands = (await fs.readdir(path.join(folder, 'Brand'), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch {
    brands = []
  }
  const job = await buildJobOf(folder, siteKey)
  const build = buildLine(job)
  /**
   * The site this workspace's build actually dressed, when it is not this workspace's own.
   *
   * 🔒 A BUILD MAY DRESS A SITE THIS LANE DOES NOT OWN, AND EVERY TOOL HERE DEFAULTS TO THE LANE.
   * `startBuild` carries `targetSiteKey` precisely so a build can run from one workspace onto
   * another site, and nothing in this context ever said so — while the first line of it tells the
   * agent this conversation works on this workspace's site and no other. Both halves are true and
   * together they are a trap.
   *
   * Measured 20/09/2026: a customer asked, in workspace `site-4x82yk`, for the site to be put into
   * Vietnamese. The build in that workspace had dressed `ban-xe-noi-that`, which is the site the
   * customer had open in the browser. The agent read 24 entries, translated them, published them —
   * correctly, and into `site-4x82yk`'s own database, which nothing serves. It reported success; the
   * page the customer was looking at had not changed a word. Two containers, two databases, one
   * site in the customer's mind.
   */
  const dressed = text(job?.targetSiteKey)
  const elsewhere = dressed !== null && dressed !== siteKey ? dressed : null
  // The same file the path fence reads to lock a quickstart down (`tracy-subprocess-docker`'s
  // content contract): beside the site folders, never inside one a seat can write.
  //
  // 🔒 READ IT, DO NOT JUST COUNT IT. This was an `isFile` until 17/09, so the marker's contents —
  // `{contract, design, requested}`, written by `platform/joomla.sh` — were thrown away and the
  // agent was told "this quickstart only accepts mapped content" without ever being told WHICH
  // quickstart. Every template carries its own content map (`tracy-joomla-quickstart/contracts/
  // <template>/<platform>/<version>/content-map.json`: entities, slots, pages), and which one
  // applies is the first thing you need before any of it means anything.
  //
  // WHETHER the site is sealed is the fence's own answer (`sealed`); the contents only name it.
  const contracted = sealed(folder, label)
  const contract = contracted
    ? await readJsonObject(path.join(path.dirname(folder), '.content-contracts', `${label}.json`))
    : null
  const mode = typeof presetId === 'string' ? (PRESET_PLATFORM.exec(presetId)?.[1] ?? null) : null

  const lines = [
    '<system-reminder>',
    // 🔒 THE FENCE HAS NO DOOR. One conversation, one site — held by machine on both roads
    // (`SITE_OUTSIDE_CONVERSATION`: the Apply door for Joomla/WordPress, `emdashSiteOf` for EmDash).
    // For one day (20/09/2026) this line carried an exception — "work on those two" — for the site
    // this workspace's build had dressed, and the note below told the agent to pass that site's
    // key. Both were wrong twice over: the fence refuses such a call, so the advice was a dead end;
    // and the case itself is a leftover — a build dressing another site came from a form that made
    // a second site, which stopped the same day. The leftover is handled below by sending the
    // CUSTOMER to the right workspace, never by opening this one.
    `This workspace is the site ${siteKey}. This conversation works on that site only; every other site the customer holds is its own workspace — do not look for it or act on it.`,
    `- Site: ${siteKey} (${platform})`,
    `- Folder: ${folder}`,
    !installed
      ? '- Webroot: not there yet — the site is not installed, so there is nothing live to read or edit.'
      : text(record?.origin) === 'imported'
        ? // 🔒 THE COPY'S OFFLINE PAGE, AND THE WAY TO THE REAL SITE (beta week 16–23/10/2026). A copy that
          // kept its source's maintenance mode answered every turn "I cannot check it on screen" (mfrasch,
          // six turns); asked to put changes on the real site, the agent said it could not and sent the
          // customer to support (totot, Elad). Provision now brings a Joomla copy online; a WordPress
          // maintenance plugin is the agent's to switch off, on the copy only.
          "- Webroot: `.webroot/` is Tracy's copy of an imported site; the customer's own server still serves the live site. Never change or check against the live address. If the copy shows a maintenance, offline or coming-soon page instead of the site, that is the source's setting carried over: turn it off on the copy (Joomla: `offline` in configuration.php; WordPress: the maintenance plugin's own setting), tell the customer in one line, and go on — their live site is not touched. Asked how the changes reach their real website: tracy_guide (imported to live) — never that it cannot be done."
        : // 🔒 "AN EDIT THERE IS LIVE" IS AN INVITATION, AND ON EMDASH NO FILE TOOL MAY ACCEPT IT: its
          // `.webroot/` is the raw database and the uploads. Measured 24/09 on the ja-business suite, on
          // EmDash a `grep -ao` into `.webroot/data/data.db` (C04) — a step.
          //
          // 🔒 A QUICKSTART'S `.webroot/` IS AS OPEN AS ANY SITE'S SINCE ADR 0022 (Lee, 26/09/2026).
          // This line told a sealed site "never with a file tool" from 24/09, when the seal fenced
          // `.webroot/` off (46 refused file-tool calls in 18 Joomla turns, 48 in 19 WordPress). The
          // seal now refuses one thing, a direct database write from the shell
          // (`tracy-subprocess-docker` `content-contract.mjs`); template files, overrides and a child
          // theme are file edits again, and the contract line below says the slots come first and the
          // design is kept. Telling the agent otherwise sent it to refuse work no fence refuses
          // (28/09/2026; the round-4 "Locked on this sealed quickstart" failure, in the context).
          platform === 'emdash'
          ? '- Webroot: `.webroot/` is the live site; change it only through the doors below, never with a file tool.'
          : '- Webroot: `.webroot/` is the live site; an edit there is live the moment it is saved.'
  ]
  // 🔒 A SEALED WORDPRESS SITE HAD NO CONTRACT DOOR UNTIL #337, AND ONE PROVISION DID NOT BIND STILL
  // HAS NONE. Provision writes the marker for WordPress quickstarts too (it is what closes the shell and
  // the files), but the WordPress component had no `content.contract` action — measured 24/09 on
  // `wp-dmlj6g`: step 1 of EVERY turn in the suite was that call, answered `bad_action`. Since #337 a
  // release that pins a Claude Cowork plugin is BOUND at provision (Claude Cowork plugin 0.12+, `LEGACY_STRUCTURE_CODE` on every record
  // write), and the marker names that Claude Cowork plugin: `contractDoorOf` reads it, for this context, the tool
  // surface and the normaliser alike. So a bound WordPress site gets the contract line below, as sealed
  // Joomla does, and one its release pinned no Claude Cowork plugin for keeps the record line.
  //
  // 🔒 AND NEITHER LINE NAMES AN ACTION THIS SITE'S `tracy_site` DOES NOT LIST (25/09). Since the tool
  // is fitted to each site when its agent is made, an unbound sealed WordPress site's action list has
  // no `content.contract` and a contract site's has no `content.update`. "Do not call X" was then
  // the one place the agent read X at all — the r2 habit this line was written against came from the
  // old description naming it, which is gone — so the lines say what is closed without naming it.
  // (#337's own line named `content.update` and `content.delete` as refused, and a build request for a
  // new language that WordPress's build tool does not have: neither is said here.)
  //
  // `contractDoor` is the other half of the same split: a sealed site whose ONLY write is
  // `content.contract` (Joomla, a bound WordPress site; also a site whose platform could not be read,
  // as before). It decides the address line and which working rules below apply, because on such a
  // site every door the general rules name refuses. EmDash is never one: it has no component to bind.
  // The sealed ROWS need more than that — a platform read as `joomla` or `wordpress` — because they
  // name that platform's slots; on a sealed site of unknown platform the contract line alone is all
  // that is known to be true. A WordPress marker that cannot be read (`null`) takes the record line:
  // its tool keeps the full description, where the Claude Cowork plugin's own `LEGACY_STRUCTURE_CODE` answer names the contract.
  const contractDoor = contractDoorOf(path.dirname(folder), label, platform, contracted) === true
  // 🔒 AN IMPORTED COPY WITH A DERIVED CONTRACT ADDS NO LINE HERE (02/10/2026). The road is said once per
  // step already: by `tracy_site`'s description (`DERIVED_CONTRACT_BLOCK`, chosen by `derivedContractOf`)
  // and by the copy's own AGENTS.md paragraph; a third statement here cost ~100 prompt tokens in every
  // step of every conversation and moved no measured case. Its context is the open site's, byte for byte.
  if (contracted && platform === 'wordpress' && !contractDoor) {
    lines.push(
      `- Quickstart site: words and structure change through \`tracy_site\`, record by record, as on any WordPress site; never SQL. ${QUICKSTART_DESIGN_RULE}`
    )
  } else if (contractDoor) {
    const named = [text(contract?.contract), text(contract?.design)]
      .filter((one, at, all) => one !== null && all.indexOf(one) === at)
      .join(', ')
    // 🔒 THE SEAL FIRST, THE ROAD IN THE PLATFORM ROW. This line used to carry the map sentence and
    // "call it first"; the road now lives in `SEALED_JOOMLA_WHERE` (`SEALED_WORDPRESS_CONTRACT_WHERE`
    // on a bound WordPress site), where the layer rule sends the agent, and this line says only what
    // the seal means — because what it forbids is what the measured turns kept trying
    // (`content.update` → `LEGACY_STRUCTURE_CODE`, reads of `.webroot/AGENTS.md`). A WordPress contract maps
    // words, links and (Claude Cowork plugin 0.14.0-rc.4+) pictures.
    const wordpress = platform === 'wordpress'
    lines.push(
      `- Content contract${named === '' ? '' : ` (${named})`}: this quickstart maps its ${wordpress ? 'words, links and pictures' : 'words and pictures'} to named slots — change those through \`tracy_site\` \`content.contract\`, which keeps the design. Anything else (${wordpress ? 'plugins, themes' : 'extensions'}, the template, layout) changes as on any site — \`tracy_site\`'s other actions first, then files — never SQL. ${QUICKSTART_DESIGN_RULE}`
    )
  }
  if (mode !== null && platform !== 'unknown' && mode !== platform)
    lines.push(
      `- Your mode was written for ${mode}; this site runs ${platform}. Follow this site's platform.`
    )
  if (installed)
    lines.push(
      "- The other folders here (AgentSetting, SiteContent, TracyProposal, TracyWork, docs) are the team's notes, not the website.",
      TAKE_AWAY_LINE
    )
  const from = text(start?.url)
  if (from) {
    const design = text(start?.id)
    // 🔒 A SITE STARTED FROM ANOTHER ONE TAKES ITS LOOK, NEVER ITS WORDS. The instruction lived in a
    // paragraph of the folder's AGENTS.md that every site carried, started-from or not — measured on
    // r2: 3 reads of a `docs/agents/start-from.json` that did not exist. So it rides on the one line
    // that exists only when there is a start, and the brief loses the paragraph (plan v2 D30).
    lines.push(
      `- Started from: ${from}${design ? ` (design ${design})` : ''} — rebuild that look with the customer's own words and pictures; never copy its sentences or logo`
    )
  }
  if (brands.length > 0) lines.push(`- Brand extracted: ${brands.map((host) => `Brand/${host}`).join(', ')}`)
  // ADR 0023: the design system the site WEARS, as the build recorded it. One line, names only —
  // the values are the check's ruler, not the agent's reading — and a site wearing none is told
  // so, because "nothing" reads as "anything goes". A design-system slot read from the site itself
  // (`options.slot`) takes the same place, so the prefix keeps its order.
  // A site the slot read found wearing nothing (`slot: null`, not unknown) names the role variables its
  // template reads — unless it was imported: only a site built from a Tracy template reads them.
  const fromTemplate = installed && text(record?.origin) !== 'imported' && SLOT_PLATFORMS.has(platform)
  const unworn = options?.slot === null && fromTemplate ? { platform, roles: Boolean(options?.roles) } : null
  const designRecord = await readJsonObject(path.join(folder, 'docs', 'agents', 'design.json'))
  // A caller that asked for the slot and got no answer (`slot: undefined`, the read slow or failed) is told
  // neither "worn" nor "none worn" — what holds either way (`unreadDesignLine`). A caller that never asked
  // (no `slot` key) gets the record's line, as before.
  const unread =
    fromTemplate &&
    options !== undefined &&
    options !== null &&
    Object.hasOwn(options, 'slot') &&
    options.slot === undefined
  const worn = unread
    ? unreadDesignLine(designRecord, platform)
    : designLine(designRecord, options?.slot ?? null, unworn, options?.roles ?? null)
  if (worn) lines.push(worn)
  // The chat route to a whole design system, closed by the operator (`chat-design-system`, 11/10/2026):
  // asked for a new look, a named system or a pasted DESIGN.md, the agent points at the button instead.
  const route = chatRouteLine(options?.chatDesign ?? null)
  if (route) lines.push(route)
  // The design-system library itself, closed by the operator (#259): said before the first step.
  const library = libraryLine(options?.chatDesign ?? null)
  if (library) lines.push(library)
  // The build's state is NOT here: it changes while the conversation runs, so it travels as its own
  // notice (`siteStateNotice`) and the rules below are not re-sent each time a stage moves — unless
  // the build sends no such notice (`buildInBlock`, the last site line below).
  // The customer's own words about their business, from the questionnaire they filled in when this
  // site was built. Before the rule that forbids inventing facts, because this is what it needs.
  const answered = answersLine(job)
  if (answered)
    lines.push(
      `- The customer answered, when this site was built: ${answered}. These are THEIR words about THEIR business — quote and build on them, and do not invent a fact this list could have told you.`
    )
  if (elsewhere !== null)
    lines.push(
      `- ⚠ THE BUILD IN THIS WORKSPACE DRESSED ANOTHER SITE: ${elsewhere}. That is what the customer sees in their browser, and it is NOT this site. ${elsewhere} is its own workspace and cannot be reached from here — a call naming it answers SITE_OUTSIDE_CONVERSATION, and there is no other way in. So when the customer asks for a change to what they are looking at: say plainly that it lives at ${elsewhere}, tell them to open that workspace and ask there, and do NOT make the change here — a write to ${siteKey} succeeds, changes nothing they can see, and reads to them as the change being lost.`
    )
  if (installed)
    lines.push(
      // 🔒 NAME ONLY DOORS THAT EXIST. This line offered `browser_read` until 17/09 and no plugin
      // here or in dsh registers that name — it is in no session's tool list. Measured across four
      // sessions: about fifteen bash calls went on `curl` piped into a tag-stripper the agent wrote
      // itself, twice in one turn. An instruction that names a missing tool does not cost one wasted
      // call, it costs the habit the agent falls back on for the rest of the session.
      //
      // 🔒 NO CONTAINER ADDRESS. The line said both tools "run the site's own browser at
      // `http://<label>-web-1/<path>`" until 24/09, and the address read as an invitation to `curl` by
      // hand. Measured 24/09: `page.text` and `page.look` answered `SITE_UNREACHABLE` 46 times in 31
      // WordPress turns and 24 times in 19 Joomla turns, because those images carry no browser.
      //
      // 🔒 ONLY WHAT IS ABOUT THIS DEPLOYMENT (25/09, plan v2 T2′). How to call `page.text` — `match`,
      // `outline`, `paths`, the size of its answer — is the `page.text` description's to say, once, next
      // to the call; a second copy here was a second wording of the same rules on every step. What only
      // this line can say is which door reads a page at all, and that `web_fetch` cannot. `page.look`
      // is offered by what it does, the same on every platform: where the site has no browser its own
      // answer (`NO_BROWSER`) says so and names the read that works.
      "- Seeing a page: `tracy_site page.text` reads a page as this site serves it now; `page.look` only for how a page LOOKS. `web_fetch` cannot open this site's public address, which is private to signed-in seats."
    )
  // This site's own addresses FIRST, then the prose that explains what they are. The prose stays:
  // two other rules below point at it by name ("the platform line above gives each layer its door"),
  // and deleting a line other lines reference is the `browser_read` failure in another costume.
  //
  // 🔒 NOT WHERE THE CONTRACT IS THE ONLY DOOR. Every id this line names sits behind a door the seal
  // refuses, and its brand clause is false for a Tracy template. Measured 24/09 on `j-1ibzqi`: it
  // said the brand "lives in" template style `120`'s params — `tracy_business` keeps it in a
  // hash-locked file — and C05 (the logo tagline) spent 7 of 22 steps on `templateStyle` and
  // `extensionParams` before a refusal. Its 44 "installed" languages also read as reachable, where
  // the contract governs two.
  const measured = contractDoor
    ? null
    : await readJsonObject(path.join(path.dirname(folder), '.site-facts', `${label}.json`))
  const inner = measured === null ? null : measured.facts
  const addresses = addressLine(
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? /** @type {Record<string, unknown>} */ (inner)
      : null,
    platform
  )
  if (addresses) lines.push(addresses)
  /**
   * 🔒 THE SITE DOCUMENTS ITSELF, AND NOTHING EVER SAID SO. A Tracy quickstart ships its own agent
   * documentation inside the webroot, written by the people who built that template, and the
   * context below is written for the platform in general. Where the two differ the general one is
   * WRONG, and it is the only one the agent had.
   *
   * Measured 21/09/2026 on `site-kutise` (`tracy-business/j6`, JoomlArt T4). The webroot holds
   * `AGENTS.md` pointing at `templates/tracy_business/AGENTS.md` — thirteen rules — plus nine
   * documents under that template's `docs/`: the site map, the extension inventory, the ACM block
   * catalogue, the positions, the design system, the recipes, the content rules, the checks and the
   * content door's own API. They say, among much else, that styling is edited in `scss/` and never
   * in the compiled `css/template.css`, that every designed section is a `mod_ja_acm` block and
   * never a `mod_custom`, and that every article exists once per language with an association
   * between the pair. The general platform line below says none of that, and its brand sentence
   * describes CASSIOPEIA — a template this site does not use.
   *
   * So: named here, ahead of the general line, and said to outrank it. Generic on purpose — the
   * test is that the file EXISTS, not which template wrote it, because a rule that only fires for
   * one template is a rule the next template ships without. For the same reason the general line
   * below now names no particular template either: it said "on Cassiopeia the word CASSIOPEIA",
   * which is true of a template no Tracy site runs, and an example that names the wrong thing is
   * read as the thing.
   *
   * BOTH DOORS, BECAUSE A SITE USES BOTH. `AGENTS.md` is the one addressed to an agent; `README.md`
   * is the one addressed to a person, and on `tracy-business/j6` it is the entry point that sends
   * the reader on to `templates/tracy_business/README.md`. Whichever exist are named, in that
   * order, and nothing is claimed about a file that is not there.
   */
  // 🔒 NOT ON A SEALED SITE: THE FENCE REFUSES THE READ THIS LINE ASKS FOR. On a contracted
  // quickstart the file tools reach `docs/agents` only (`tracy-subprocess-docker`'s content
  // contract), so "read them before your first change" was an order with one possible outcome —
  // measured 24/09 on `j-1ibzqi`: `read .webroot/AGENTS.md` refused in 4 of the first 5 cases, a
  // step each, and in C00 twice more with `README.md` and a `glob`. There the contract IS the
  // template's documentation in machine form, and the line above already sends the agent to it.
  const selfDocs = contracted
    ? []
    : (
        await Promise.all(
          ['AGENTS.md', 'README.md'].map(async (name) =>
            installed && (await isFile(path.join(webroot, name))) ? `\`.webroot/${name}\`` : null
          )
        )
      ).filter((one) => one !== null)
  if (selfDocs.length > 0)
    lines.push(
      `- THIS SITE DOCUMENTS ITSELF: ${selfDocs.join(' and ')} ${selfDocs.length > 1 ? 'were' : 'was'} written by the people who built this site, and what ${selfDocs.length > 1 ? 'they say' : 'it says'} about this site OUTRANKS the general platform advice below wherever the two differ. Read ${selfDocs.length > 1 ? 'them' : 'it'} before your first change, and follow the documents ${selfDocs.length > 1 ? 'they point' : 'it points'} to — they name the file, the field and the command each kind of change here goes through: how a change is made here, never how far it reaches. The line below is what is true of the platform in general, with no template assumed; ${selfDocs.length > 1 ? 'those files are' : 'that file is'} what is true of THIS site.`
    )
  // The replace road goes ahead of the WORDS row it shortens; a sealed site gets its own row. `hasOwn`,
  // because the platform comes off a file www-data writes, and `WHERE_TEXT_LIVES.constructor` is not a row.
  const replace = REPLACE_PLATFORMS.has(replaceKey(platform, contractDoor))
  const where = contractDoor
    ? platform === 'joomla'
      ? SEALED_JOOMLA_WHERE
      : platform === 'wordpress'
        ? SEALED_WORDPRESS_CONTRACT_WHERE
        : null
    : Object.hasOwn(WHERE_TEXT_LIVES, platform)
      ? WHERE_TEXT_LIVES[platform](shell ? 'shell' : 'none')
      : null
  // The quickstart's where-map, when its release has one (`WHERE_MAP_RELEASES`): the row's last sentence, and
  // the `where.seo` sentences below.
  const whereMap =
    installed &&
    hasWhereMap(
      platform,
      quickstartReleaseOf(
        platform,
        contract,
        platform === 'emdash' ? await readJsonObject(path.join(folder, 'template', 'artifact.json')) : null
      )
    )
  if (where)
    lines.push(
      `- Where visible text lives: ${replace ? `${REPLACE_ROAD}${where.charAt(0).toUpperCase()}${where.slice(1)}` : where}${whereMap ? ` ${WHERE_MAP_POINTER}` : ''}`
    )
  // 🔒 THE CREATE RECIPE, FOR EVERY MODE (`ADD_RECORD`): one row per platform, sealed or open, the same
  // bytes for every mode of a site. Nothing live, nothing to add to.
  if (installed && Object.hasOwn(ADD_RECORD, platform)) lines.push(ADD_RECORD[platform])
  // 🔒 THE SEARCH ROW IS FOR THE SEO/GEO MODE ONLY, AND FOR THE SITE'S OWN PLATFORM (`SEO_EXTRA`): a mode
  // written for another platform still reads this site's head. Keyed on the mode, so the block stays
  // byte-stable per (site, mode) and no other mode pays for the head read and the platform notes.
  //
  // 🔒 THE POINTER TO `where.seo` IS FOR EVERY MODE (flow D of the Apply audit, 05/10/2026). Asked "change the
  // Google title of the Contact page", a Joomla agent in the default Writer mode read Joomla's source for 22
  // steps — 374 s, 1.1M prompt tokens — before it found the menu item's `page_title`, the field the
  // quickstart's describe names in `where.seo`. A page's title or description is asked of every mode, so
  // every other mode gets the pointer alone, one line, the same bytes for each. A session with no Tracy
  // mode gets neither — every session on a Tracy surface runs one of the twelve (dsh's own presets stand
  // down in the bundle), and the mode-free block is what the size budgets measure.
  const role = typeof presetId === 'string' ? (PRESET_ROLE.exec(presetId)?.[1] ?? null) : null
  // Without a where-map the SEO/GEO row keeps its head read and platform notes, and every other mode's
  // pointer line has nothing to point at.
  if (role !== null && installed && Object.hasOwn(SEO_EXTRA, platform)) {
    if (role === 'seo-geo')
      lines.push(
        `- Search (SEO/GEO): \`tracy_site page.text {path, head:true}\` reads a page's head as served — title, description, JSON-LD, hreflang.${whereMap ? " Where this site keeps each, and the call that changes it: `content.read {describe:true}`, its `where.seo`, read off the quickstart's own release — a place it does not list is not a field to invent." : ''}${SEO_EXTRA[platform]}`
      )
    else if (whereMap)
      lines.push(
        "- A page's head (its title in search results and the browser tab, its meta description): `content.read {describe:true}`, its `where.seo`."
      )
  }
  // 🔒 FOR THE WRITER ONLY (v6 L3-01, 29/09/2026). The first file read under a customer's webroot
  // injects that webroot's AGENTS.md — the site BUILDER's rules ("every section is a module", "two
  // languages together"). Joomla's FAQ page (3 headings, 3 paragraphs) took 279 s and 36 steps: an
  // ACM module and an edit of a template manifest, where one article and a menu item were enough.
  // The line points at the smallest change through the content doors and at `page.create`; it bans
  // nothing — whether a Writer may ever edit a template file is a product decision still open.
  //
  // 🔒 AND NOT HOW FAR A CHANGE REACHES, IN EVERY MODE THAT WRITES (20/10/2026). Staff editing real
  // customer sites: "when Tracy fixes one place it often breaks another place". The builder's notes
  // point at the shared layers a template is built from — EmDash's `styles/tokens.css` and `.h-*`/`.btn-*`
  // classes, a Joomla module, a WordPress template part — and the self-docs line above lets them outrank
  // the platform advice, so a Designer asked for one button changed the token every button wears. The
  // Writer had the counterweight; the Designer and the Developer write those layers, so they get it too.
  if (role === 'writer' && installed)
    lines.push(
      '- Writer: a webroot AGENTS.md or CLAUDE.md tells how the site was BUILT, not what you were asked or how far it may reach. Do the smallest change through the content doors; a new page with its menu link: `page.create`.'
    )
  if ((role === 'designer' || role === 'developer') && installed)
    lines.push(
      `- ${role === 'designer' ? 'Designer' : 'Developer'}: a webroot AGENTS.md or CLAUDE.md tells how the site was BUILT, not what you were asked or how far it may reach: a token, shared class, template or shared block it names changes every place that uses it.`
    )
  // The look road, for the site's own platform and this mode (`lookLine`): byte-stable per (site, mode).
  const look = installed ? lookLine(platform, role, shell) : null
  if (look !== null) lines.push(look)
  // Undo, as each platform keeps it: the Apply door's receipt, or the value EmDash already answered.
  const undo =
    platform === 'emdash'
      ? "the old value you read, or the write's receipt, is the undo"
      : '`apply.revert {apply_id}` puts the old bytes back'
  // 🔒 NO READ AFTER A WRITE, SAID ONCE FOR EVERY DOOR (plan v2 D6′). The write's own answer is the
  // check: on r2 the step right after a write was a read-back of it, alone, in 17 of 18 Joomla and 17
  // of 27 WordPress writing turns, and 55 of the 63 `apply.list` calls were such read-backs. Each read
  // re-sends the whole conversation to hear what the write had just said.
  //
  // ⚠ ON WORDPRESS THIS IS TRUE ONLY BECAUSE THE DOOR CHECKS THE BODY ITSELF. An accepted post write
  // answers `{ok, kind, id, key, created}` and REPLACES the whole `post_content`; in 6 of 33 r2 cases
  // the first write cut a live page (home post 42, ≈ 26.9k characters, overwritten with 252 in C02).
  // `tracy_site` refuses a body write shorter than 80 % of the body it last read and re-reads the
  // record after an accepted one, answering `verified`. A build whose door does not do that sets
  // `wordpressReadBack`, and the agent is told to read the record once instead.
  // A contract site writes no body (its apply is a receipt of slots), so the fallback is not said there.
  const readBack =
    platform === 'wordpress' && !contractDoor && options?.wordpressReadBack === true
      ? ' — except after a post or templatePart write: `content.get` that record once to check the body is whole'
      : ''
  // 🔒 "UNLESS THE CUSTOMER ASKS": the rule stops reads nobody asked for, it does not overrule one.
  // Measured 25/09/2026 on the local stand (722c32bc1): asked "change the eyebrow, then read it back
  // with content.read to confirm", the agent refused the read on both sites, in both turns, quoting
  // this sentence back ("a read after a write is the check this site tells me not to run").
  // 🔒 THE BUILD'S STATE MUST REACH THE AGENT SOMEWHERE. It left the block for `siteStateNotice`, and
  // the pre-step hook that sends that notice is wiring the build may drop (plan v2.1 IX1, drop (ii));
  // without this switch a build that drops it would tell the agent nothing about a running, paused,
  // failed or waiting build — develop always did. So the switch puts the line back, as the LAST site
  // line: everything above it keeps its bytes, and a stage change re-sends the block as develop did.
  const buildInBlock = options?.buildInBlock === true && build !== null
  if (buildInBlock) lines.push(`- Build: ${build}`)
  lines.push(
    // 🔒 SIZE, THEN SHAPE. Everything below this line used to be one rule for every request, and it
    // was written for a small one — "look at the page, make the smallest change, look again". A big
    // request reads it and works the same way: no plan, no place to stop, and a customer watching a
    // list of tool calls with no idea how many are left. The two lanes are not two styles of the
    // same work; they differ in what the FIRST call is, and that is decided before any of them.
    //
    // 🔒 A QUESTION IS NOT A JOB, AND A MISSING FACT IS NOT A SEARCH. Measured 24/09 on the
    // ja-business suite (33 cases × 3 platforms). Asked what the site SHOWS — the headline, the
    // hotline, the footer e-mail — WordPress took 5–8 steps and 36 calls once (27 refused: `content.get`
    // on id after id), Joomla 3–4 with a contract inspect of 12–20 s, and C00 failed on WordPress for
    // an answer that quoted the heading with markdown italics the page does not have. EmDash, where
    // the agent read the page, took 2. Asked to "change the phone number" with no number (C31), the
    // agent read for 3 (Joomla), 6 (EmDash) and 11 (WordPress) steps before asking the one thing
    // only the customer knows.
    //
    // 🔒 A FACT, NOT WORDS TO WRITE. The first wording ("a FACT the customer did not give") covered a
    // vague rewrite too: PR1 bench C30 on EmDash ("make the headline more attractive") asked for a
    // direction with five options, its reasoning citing "the rule about asking for facts" (FAIL; it
    // rewrote and published before). Words the customer asks Tracy to write are Tracy's to write.
    //
    // 🔒 ON A CONTRACT DOOR THE UNIT IS THE APPLY, NOT THE SLOT. One apply carries every change of a
    // request, so "three or more writes" counted in slots sizes one apply as SEVERAL JOBS — r2 j C04,
    // C10 and C29 are one apply each, however many slots they touch.
    //
    // 🔒 S6 (26/09/2026): A SENTENCE BEFORE THE FIRST CALL, SO THE CUSTOMER SEES SOMETHING AT ONCE. On
    // the 25/09 EmDash bench the first words reached the customer after a median 15.2 s: step 1 was
    // a tool call with no text, and the text waited for its answer. One short sentence in step 1
    // shows in ~3–5 s, for ~30 output tokens a case. Said once here, for every platform and both
    // sizes; SEVERAL JOBS' `todo_write` still comes first among the CALLS.
    //
    // 🔒 "AS I TOLD YOU BEFORE" IS THE SAME MISSING FACT (09/10/2026, bench hb negative control: "change the
    // footer to the colour I gave you the other day", nothing kept). Told nothing about where an earlier
    // conversation's words live, the agent searched the site folder, the theme's CSS, `.tracy/`, `apply.list`
    // and the webroot's mtimes for it: 4–15 calls on every CMS (227k prompt tokens once) before asking. What
    // the host keeps between conversations is the site notes notice (`site-notes.mjs`); nothing else is.
    `SPLIT THE MESSAGE INTO REQUESTS, SIZE EACH ON ITS OWN, before the first tool call, and say plainly what you will do. Two unrelated asks are two requests: finish the first, say what changed, then start the second — never one plan over both. A QUESTION about what the site shows is ONE \`page.text\` read, then the answer, quoting the words as they read, no bold or italics added. A change that needs a FACT only the customer knows (their new number, name, address) is a question to THEM: ask before any call. So is one they say they gave before, unless a Site notes notice holds it: ask, it is in no file. Words you are asked to write or improve are yours to write: write them. A new item like its siblings fills every line they show, in that line's role. A vague ask over several pages ("the titles are bad"): read the values, propose in the reply, ask which; write nothing yet. For each change: from its own words, can you name every write — which record, which field? Yes, and one or two of them: ONE JOB. No, or three or more: SEVERAL JOBS.${contractDoor ? ' Count door calls, not slots: one contract apply is one write, however many slots.' : ''}${replace ? ' Words everywhere, only when asked ("the hotline everywhere"): ONE `content.replace` with `all:true`.' : ''}`,
    // 🔒 SCOPE, SAID FOR EVERY REQUEST (20/10/2026). Staff editing real customer sites: "when Tracy fixes
    // one place it often breaks another place". The rules said how SMALL a change is ("the smallest
    // change"), never how FAR it reaches, and three of them pushed wide: `all:true` for "the same words in
    // many places", the Designer's "the platform's own theming system first" (a token is every page) and
    // a builder's AGENTS.md outranking the platform advice. Only the LOOK lead and a comment turn said
    // "this element only". This line is the general rule, before both sizes; the doors back it up — a
    // shared record asks first (`consequence.mjs`), a look scope that reaches every page says so before
    // it writes (`look-set.mjs`), a fact over many places counts toward the many-places confirm.
    'SCOPE: change only what was asked, where it was asked. Before a write that also shows elsewhere (header, footer, menu, a shared block, module or pattern, a token or shared class, a site setting), say where else; unless the customer asked for every place, change this place only (look scope element or page, a copy for this page) or ask.',
    // 🔒 THE WRITE'S OWN ANSWER IS THE RECEIPT FOR ONE JOB. Until 24/09 this sent every one-record
    // change on to `apply.list` — one more step, re-sending the whole conversation, to read back what
    // the write had just answered. Measured 24/09 on the ja-business suite (r2): the step right after
    // the write was that read-back, alone, in 17 of 18 Joomla and 17 of 27 WordPress turns that
    // wrote; on EmDash, where `tracy_site` refuses, it came back `EMDASH_SITE`.
    //
    // 🔒 AND NO BACKUP FILE BEFORE A WRITE. Measured 24/09 on `wp-dmlj6g`: the agent saved the record
    // it was about to change into a file first — `hero-heading-update.json` (C01, 3 steps and 56 s
    // with a refused path), `db-changes/restore-home-page.txt` (C02), five `email-change/*.txt`
    // writes and edits (C10) — because the rule asked it to say how to undo, and nothing said the
    // door already keeps the before-image.
    //
    // 🔒 THREE QUESTIONS NOBODY NEEDED TO ANSWER (v5, 28/09/2026: 17 questions, about 6 avoidable,
    // 222 s of the customer's time). "Also the footer hours" asked after turn 1 had already changed
    // them (a shared field); "in which language?" on a two-language Joomla site the customer never
    // named a language on (three cases); "which line is the title?" after a pick of a section with a
    // label line above its heading. Each is a fact the site or the conversation already holds. The
    // words half of the language sentence is said by EmDash's own LANGUAGES rule, so EmDash gets the
    // structure half only: one rule, one wording.
    //
    // 🔒 "ALREADY TRUE" IS JUDGED BY A READ OF THIS TURN (V7S-1, acceptance v7, 30/09). The sentence
    // read "a request already true — often your own earlier change — is said", and a conversation whose
    // heading another conversation had changed back answered "already in place" from memory, with no
    // tool call. The per-turn half is `prompter.mjs` `siteChangedNotice`; this half holds without it
    // (12 characters more than the old sentence, inside the headroom `size-j` had).
    //
    // 🔒 NO REPLY-LANGUAGE SENTENCE HERE (bug 30/09). "Reply in the customer's language" stood at the
    // end of this rule; on a Russian company's site read in English by a Vietnamese team member it
    // named no language, and two English turns were answered in Chinese. The reply's language is a
    // fact of each turn, so the turn says it, by name (`prompter.mjs` `replyLanguageRule`).
    `ONE JOB: make the smallest change that does it, then say what changed, plainly. The preview beside the chat reloads by itself when the turn ends: do not ask the customer to reload the page to see it. Say it from the write's own answer — the door's receipt. Do not read a page, a record or a receipt after a write unless the customer asks: the write's answer is the check${readBack}. Code, settings, head and translation-link changes, and a block hidden or removed, are the exception — the answer is not the effect (a receipt shows no head, nor the gap a block leaves): check each once per page and language it must reach (\`page.text {path, match}\`, or \`{path, head:true}\` for the head; a look or a gap: \`page.look\`), never a crawl; close a gap the block left, or say it is there. Never save a copy before writing: ${undo}. Ask only when the request still means two different things after you look. A clear request is the go-ahead; so is the reading a visitor sees first, or the one you would recommend: take it and say in one line which. A request already true is said, not asked — after a read of this turn, never from memory. Which language is not a question: ${platform === 'emdash' ? '' : "words change on the page meant, in the site's default language when nothing points at another; "}hiding, showing, moving or deleting a section changes only the languages named, else the page's; a whole post or page is deleted in every language unless one is named; say which. A section's title is its heading, not the small label line above it.`,
    // 🔒 THE WRITES' OWN ANSWERS ARE THE RECEIPTS FOR SEVERAL JOBS TOO. This ended "read every one of
    // those ids back with `apply.list`" on Joomla and WordPress until 25/09 — the same read-back ONE
    // JOB had dropped, and the `apply.list` description now says "never after a write": one rule said
    // two ways in one prompt. The overview against the plan is what catches a missing or unasked
    // write, and it is built from the answers the writes already gave. EmDash had it this way from the
    // start: `tracy_site`'s `apply.*` refuse there (r2: `apply.list` → `EMDASH_SITE` every time).
    //
    // 🔒 A CONTRACT TAKES ONE APPLY FOR THE WHOLE PLAN. On a contract door every item's slots go into
    // ONE apply (one revision; the id is Tracy's), so "give each item its own `apply_id`" asked for
    // what the door refuses: a second apply on the same request must first re-read the revision the
    // first one made.
    //
    // 🔒 AND ON WORDPRESS THE ID IS TRACY'S (WP-27). Tracy makes a `wp-…` apply_id for each write (one per
    // customer request until 26/10/2026), and the WordPress tool text calls it optional; this line told the
    // same agent to give each item its own — one fact said two ways in one prefix (review, 25/09). Only open
    // Joomla, whose component requires an id on every write, still asks the agent for one per item.
    //
    // 🔒 A MODE WITHOUT `todo_write` (Writer, SEO/GEO) WRITES THE PLAN IN ITS REPLY (`toolReach`): the
    // plan's whole value is that the customer reads it before the work and can stop it between items,
    // and a reply is read the same way — only the drawn list above the composer is missing.
    (todo
      ? 'SEVERAL JOBS: call `todo_write` FIRST, one item per change, in the order you will make them'
      : 'SEVERAL JOBS: write the plan FIRST, in your reply, one line per change, in the order you will make them') +
      ' — and the order is not preference. An item that needs something an earlier one produces must follow it: a record has to EXIST before anything can point at it, a language has to be INSTALLED before anything can be written in it, and a delete goes LAST among items touching the same record. Items with no such tie are in no particular order — ' +
      (todo
        ? "that list is drawn above the customer's composer, so it is how they see what is coming and stop you between items. "
        : 'that list is how the customer sees what is coming and stops you between items. ') +
      (contractDoor
        ? "Every item goes into ONE apply (one revision, one apply_id Tracy makes): the plan lists the slots, and that apply's answer is the receipt — put it in one plain overview against your list: "
        : platform === 'emdash' || platform === 'wordpress'
          ? 'Carry one item at a time and say one line as each finishes. At the end put the answers of your writes in one plain overview against your list: '
          : 'Carry one item at a time, give each its own `apply_id` so `apply.revert` undoes that item and nothing else, and say one line as each finishes. At the end put the answers of your writes in one plain overview against your list: ') +
      'an item with no writes was not done, and a write under no item was not asked for. Needing a write you never planned means the plan was wrong: write it again rather than carrying on without one. A question about one item holds no other: make every item it does not touch, then ask.',
    // 🔒 NAME ONLY THE DOORS THIS SITE'S `tracy_site` HAS. The rule named `db.rollback`, `core.upgrade`
    // and `db.snapshot` on every platform; the WordPress component dispatches none of them (claude-cowork
    // `wordpress/cowork/lib/Engine.php`, its action switch), and a sealed WordPress site cannot install
    // or activate anything. A rule that names a missing door is followed into a
    // refusal. On a sealed Joomla site every door it names refuses (`LEGACY_STRUCTURE_CODE`), so there it is a
    // rule about nothing; on EmDash a delete goes through `tracy_emdash`, which refuses it until the
    // customer has answered (`CONFIRM_FIRST`, said in that tool's own description).
    //
    // 🔒 THE DOOR ASKS, SO THE AGENT DOES NOT ASK FIRST (28/09/2026). This said "confirm with
    // `ask_user_question` unless the customer asked for exactly that" — written when the rule was
    // prose. Since V2-5 it is a door (`tiers.mjs`): a destructive call answers CONFIRM_FIRST with its
    // own question, and only an answer to THAT question, given after the refusal, lets the same call
    // through (`call-memory.mjs` `confirmed`). A question the agent asked before the call opens
    // nothing, so "ask, then call" always asked the customer twice (v5: EmDash V5-chat-08 and
    // V5-chat-03). "When the target is clear" keeps the one question that is not a confirmation:
    // which records a vague delete means.
    ...(contractDoor || platform === 'emdash'
      ? []
      : [
          (platform === 'wordpress'
            ? contracted
              ? '`content.delete` and `media.delete` answer'
              : '`content.delete`, `media.delete`, and installing or activating a plugin or theme, answer'
            : '`content.delete`, `media.delete`, `db.rollback`, `core.upgrade`, and installing or activating an extension, plugin or theme, answer') +
            ' CONFIRM_FIRST with the question to ask: when the target is clear, make the call, then ask exactly that question — never one of your own before it, or the customer answers twice.' +
            (platform === 'wordpress' ? '' : ' Snapshot first with `db.snapshot` for installs and upgrades.')
        ]),
    // Council 20/10/2026 (live run, Voice): "…khỏi trang web giúp mình" with its verb misheard was read
    // as a delete. Hide and delete are different calls; which one the person meant is theirs to say.
    'Hide (off the pages, kept) or delete: when the request does not say which, ask which before either; never read "off the site" as a delete.',
    'A REFUSAL IS AN ANSWER, NOT AN OBSTACLE. Do what its `next` says. One with no `next` — this component has no such action, this version no such field — is still an answer: tell the customer, do not find another way to the same change. `NOT_SIGNED_IN` and `NO_VIEWER` are this session, not this site: ask them to reload the page, then call again.',
    // 🔒 ONLY WHERE THERE IS A DATABASE THE AGENT COULD REACH AROUND THE DOOR. On a sealed quickstart
    // the shell is closed, so the case this rule is for cannot arise — and measured 24/09 on
    // `wp-dmlj6g` the agent wrote the note anyway before an ordinary door write (C02). On EmDash it
    // contradicts the platform row ("never edit the database by hand"). And not for a mode without a
    // shell (`toolReach`): it has no road to the database at all, so the rule is about nothing there.
    ...(contracted || platform === 'emdash' || !shell
      ? []
      : [
          "When this site's content door is not connected and the change can only be made in the database, write the note before the change: a file under `docs/agents/db-changes/` in this folder naming the table and the row, the value before, the value after, and how to put the old value back. Then make the change, and tell the customer you kept a note."
        ]),
    // Not on EmDash, where `content.list`/`content.get` are `tracy_site`'s and refuse and the platform
    // row already says where the words are read ("find the words in content, never in `/app`" — r2:
    // ~60 bash/grep/read calls went into `/app` across 33 turns); not on a sealed Joomla site, where
    // the folder is fenced and the contract row names the one read.
    ...(contractDoor || platform === 'emdash'
      ? []
      : [
          "ASK THE DOOR, NOT THE FOLDER. `info`, `content.list`, `content.get` answer what this site holds; the platform's own code under `.webroot/` is identical on every site and cannot tell you. (Writing code AGAINST the platform is different — then its API is the thing you need.) Never open the same file or page twice."
        ]),
    // 🔒 ONE RULE, BECAUSE IT WAS ONE FAILURE. Measured 17/09 on demojoomla, from a request nobody
    // would call unclear — "Change all content to Vietnamese". The agent read it as "install a
    // Vietnamese language pack", spent sixteen calls across `web_search`, `web_fetch` and
    // `downloads.joomla.org` proving no such pack ships for Joomla 6 — after the FIRST catalogue had
    // already said so — then asked the customer to pick among the consequences, then offered to
    // WRITE a Vietnamese site from scratch. Fifty calls in one turn.
    //
    // Three separate sentences were tried here first and they read as three separate cautions. They
    // are not: widening the job, inventing content to fill it, and shopping for a dependency are the
    // same move. So they are one rule, and it costs half the words.
    // 🔒 FIVE LAYERS, ONE DOOR EACH — the shape under every wander measured this week, and the reason
    // this is a rule rather than another sentence about another case. Each of them was the agent
    // working in the wrong layer: the Cassiopeia brand hunted in FILES when it is a template style
    // PARAMETER; the breadcrumb's "Home" read from `mod_breadcrumbs` SOURCE when it is a module
    // parameter the door had already returned; "all content to Vietnamese" went shopping for an
    // EXTENSION when the answer is records plus shipped-phrase overrides; the site language was
    // chased through core to `#__languages` when it is a component parameter.
    //
    // Written per case, that is four paragraphs and the next case is a fifth. Written as layers it
    // is one rule, and a new case is a row in the platform line below — which is where a mechanism
    // belongs, because the mechanism is the only part that differs between Joomla, WordPress and
    // EmDash. The rule it replaces had grown to 180 words by accretion.
    'DECIDE THE LAYER BEFORE THE FIRST CALL. Everything a visitor sees sits in one of five, each with exactly one door: the WORDS somebody wrote · the SETTINGS deciding how a thing behaves or looks · the PHRASES the platform ships · the PRESENTATION, layout and styling · WHAT IS INSTALLED. Wandering is a change tried in the wrong one: reading platform source for a setting, installing an extension to replace words, renaming a template to change wording. A request may SPAN layers and is not done until every layer it spans is: "put the site in <language>" spans WORDS (rewrite each record) and PHRASES. Decide which layers a request spans before you start; name none to the customer. The platform line above gives each layer its door; a layer with none here is an answer, not a detour. Then ASK THEM ALL IN ONE STEP: every read you already know you need goes in the SAME message — the whole conversation is re-sent on every step.',
    // 🔒 A TRANSLATION THAT EXISTS IS NOT A TRANSLATION TO WRITE, and the agent was told the
    // opposite. The layer rule used to say a language request is "an override apiece" for the
    // PHRASES layer and "touches neither SETTINGS nor WHAT IS INSTALLED" — true of a site with
    // no pack available, and wrong wherever one is. Measured 21/09 on `site-kutise`
    // (`tracy-business/j6`): the site's own docs carry a catalogue of SIXTY Joomla packs with a
    // pinned URL and a sha256 apiece, `vi-VN` among them, and four are installed already.
    //
    // The 16/09 run this replaces went wrong at the other end and is the reason the rule is
    // worded around ONE list rather than around "look for a pack": asked to put a site into
    // Vietnamese, the agent spent sixteen calls across `web_search`, `web_fetch` and
    // `downloads.joomla.org` proving no Vietnamese pack shipped — then offered to write the site
    // from scratch. Both failures are the same shape: the answer was a list the site was
    // holding, and the agent neither read it nor believed it.
    //
    // 🔒 ONLY WHERE THE PLATFORM ROW NAMES A PHRASES DOOR, because this rule sends the agent there
    // ("the platform line above says through which door"): open Joomla (`content.list` kind
    // `language`, `extension.install`) and WordPress, open or sealed (`language.install`, which the
    // seal leaves open). Not on a sealed Joomla site, which refuses `extension.install`
    // (`LEGACY_STRUCTURE_CODE`); not on EmDash, whose phrases are the template's (`INSTALLED — not
    // reachable`); not on a platform with no row, where the pointer led nowhere. On a sealed
    // WordPress site an override is a file the fence refuses, so what the pack does not cover is
    // said, not written — the same answer the row gives, in the same words.
    ...(!contractDoor && (platform === 'joomla' || platform === 'wordpress')
      ? [
          `A TRANSLATION YOU CAN INSTALL BEATS ONE YOU WRITE. The PHRASES a platform ships are already translated — that is what a language pack is — so there the job is to find the right one and install it, then write an override only for what it does not cover. Only the WORDS somebody wrote have no pack, and they are the part you translate. Which packs exist is a fact THIS SITE holds — the platform line above says through which door, and a site that documents itself may pin a catalogue with a URL and a checksum apiece — and that list is the authoritative one: a language missing from it is an answer, not a reason to search the web.`
        ]
      : []),
    GUIDE_RULE,
    'STAY INSIDE WHAT WAS ASKED. Never offer to write pages, fill empty sections, or unpublish what you did not put there. If the site holds little, that IS the answer — say what you changed and what there was. And when something truly is not available, ONE authoritative list settles it: say so and stop, rather than trying a second host, a third URL shape, or a search engine.',
    '</system-reminder>'
  )
  // The build is not in the summary either: the summary rides on the context message, which is not
  // re-sent when only the build moves, so a build named there would go stale beside a fresh notice.
  // With `buildInBlock` it is: the block then changes with the build, so the summary cannot go stale.
  const summary = [
    siteKey,
    platform,
    installed ? null : 'not installed',
    buildInBlock ? `build ${build}` : null
  ]
    .filter(Boolean)
    .join(' · ')
  return {
    text: lines.join('\n'),
    summary: summary.length > 120 ? `${summary.slice(0, 119)}…` : summary,
    state: { build }
  }
}

/**
 * The text of the latest notice from `plugin` still visible in a session's log, or null.
 * @param {{ session?: { seq?: number, eventAt?: (seq: number) => any, surface?: { nodes?: Iterable<number> } } } | undefined} agent
 * @param {string} plugin
 * @returns {string | null}
 */
function lastNotice(agent, plugin) {
  const session = agent?.session
  if (!session || typeof session.seq !== 'number' || typeof session.eventAt !== 'function') return null
  const visible = new Set(session.surface?.nodes ?? [])
  for (let seq = session.seq - 1; seq >= 0; seq -= 1) {
    const event = session.eventAt(seq)
    if (event?.type !== 'user/message' || !isNoticeFrom(event.data?.source, plugin)) continue
    // A notice compacted out of sight is as good as never sent: say it again.
    if (!visible.has(event.seq ?? seq)) return null
    const block = event.data.content?.[0]
    return typeof block?.text === 'string' ? block.text : null
  }
  return null
}

/**
 * The text of the latest site context still visible in a session's log, or null.
 * @param {{ session?: { seq?: number, eventAt?: (seq: number) => any, surface?: { nodes?: Iterable<number> } } } | undefined} agent
 * @returns {string | null}
 */
export function lastSiteContext(agent) {
  return lastNotice(agent, SITE_CONTEXT_PLUGIN)
}

/**
 * The text of the latest site-state notice still visible in a session's log, or null — what the
 * pre-step hook compares `siteStateNotice(…).text` with, so a notice goes out only when it changed.
 * @param {{ session?: { seq?: number, eventAt?: (seq: number) => any, surface?: { nodes?: Iterable<number> } } } | undefined} agent
 * @returns {string | null}
 */
export function lastSiteState(agent) {
  return lastNotice(agent, SITE_STATE_PLUGIN)
}

/**
 * The text of the latest today notice still visible in a session's log, or null — what the pre-step
 * hook compares `todayNotice(…).text` with: one goes out per conversation, and another only when the day
 * has changed under it (or the earlier one was compacted out of sight).
 * @param {{ session?: { seq?: number, eventAt?: (seq: number) => any, surface?: { nodes?: Iterable<number> } } } | undefined} agent
 * @returns {string | null}
 */
export function lastToday(agent) {
  return lastNotice(agent, TODAY_PLUGIN)
}

/**
 * The text of the latest Files-tab notice still visible in a session's log, or null — what the pre-step
 * hook compares `filesNotice(…).text` with: one goes out per conversation, and another only when the
 * list of pictures has changed (or the earlier one was compacted out of sight).
 * @param {{ session?: { seq?: number, eventAt?: (seq: number) => any, surface?: { nodes?: Iterable<number> } } } | undefined} agent
 * @returns {string | null}
 */
export function lastFiles(agent) {
  return lastNotice(agent, FILES_PLUGIN)
}

/**
 * The text of the latest site-notes notice still visible in a session's log, or null.
 * @param {{ session?: { seq?: number, eventAt?: (seq: number) => any, surface?: { nodes?: Iterable<number> } } } | undefined} agent
 * @returns {string | null}
 */
export function lastNotes(agent) {
  return lastNotice(agent, NOTES_PLUGIN)
}

/**
 * The mode (dsh agent preset) a session runs: the last `agent-preset/selected` in its log, else the
 * one its header was created with. dsh records a switch only while a session is blank and refuses
 * one once a turn has started (`agent-preset/locked`), so the scan stops at the first turn.
 * @param {{ session?: { seq?: number, eventAt?: (seq: number) => any, header?: { agentPreset?: string } } } | undefined} agent
 * @returns {string | null}
 */
export function sessionPreset(agent) {
  const session = agent?.session
  let preset = text(session?.header?.agentPreset)
  if (!session || typeof session.seq !== 'number' || typeof session.eventAt !== 'function') return preset
  for (let seq = 0; seq < session.seq; seq += 1) {
    const event = session.eventAt(seq)
    if (event?.type === 'turn/start') break
    if (event?.type === 'agent-preset/selected') preset = text(event.data?.agentPreset) ?? preset
  }
  return preset
}

/** The producer a step budget notice names; also how one already sent this turn is found. */
export const STEP_BUDGET_PLUGIN = 'tracy-site-tools:step-budget'

/** Steps a run of pure looking may take before the agent is told to stop exploring. */
const STEP_BUDGET = 10

/**
 * Seconds of tool time a run of pure looking may take before the same notice is due (E4.3).
 *
 * 🔒 STEP COUNTS MISS WIDE STEPS. Measured r2: Joomla C04 spent 537 s of tool time in 10 steps without
 * a write (44 inspects, cut by the bench's 10-minute cap — neither brake fired before it), C10 209 s,
 * C05 142 s. All three were inspect-driven and fall under 120 s once the per-turn inspect memo
 * (E3.1) lands, so this is the backstop for a step that fans out, not a second step count.
 */
const TOOL_SECONDS = 120
/**
 * How many times both loop bars a planned build has (`loopNotices` `build`). Measured 23/10/2026 on a
 * WordPress restaurant: the step budget fired at steps 10 and 31 (reading research and records) and the turn
 * length at 40; the turn reached its first check at step ~65 with the repairs still ahead and ended at 72,
 * "well over budget". Five times leaves the repairs room.
 */
const BUILD_SCALE = 5
/** The most room a build is given however big its template: twelve times both bars (120 looking steps, 480 in all). */
const MAX_BUILD_SCALE = 12
/** Inventory records that add one more of each bar: about one `structure.read` page to read. */
const RECORDS_PER_SCALE = 200
/** Plan rows that add one more of each bar: a turn length's worth of writes. */
const ROWS_PER_SCALE = 40

/**
 * The size a `tracy_demo` answer names for `buildScale`: a `structure.read` page's `total` and `plan.read`'s
 * `recordsTotal` (inventory records), the saved plan's rows (`plan.read` `plan.rows`, `plan.save` `rows`). Null when
 * it names neither, as a research page does.
 * @param {unknown} answer
 * @returns {{ records?: number, rows?: number } | null}
 */
export function buildSizeOf(answer) {
  if (!answer || typeof answer !== 'object') return null
  const a = /** @type {Record<string, any>} */ (answer)
  const whole = (/** @type {unknown} */ n) =>
    typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : undefined
  const records =
    typeof a.structureHash === 'string' && Array.isArray(a.items)
      ? whole(a.total)
      : whole(a.structure?.inventory?.recordsTotal)
  const rows =
    typeof a.planHash === 'string' && a.ok === true
      ? whole(a.rows)
      : Array.isArray(a.plan?.rows)
        ? a.plan.rows.length
        : undefined
  const size = {
    ...(records === undefined ? {} : { records }),
    ...(rows === undefined ? {} : { rows })
  }
  return Object.keys(size).length ? size : null
}

/**
 * How many times both loop bars a build has, from what its template makes it read and write (`loopNotices` `build`).
 * Measured 24/10/2026, ja-fresco on WordPress (7 pages): ~40 steps went on reading the structure and the build ran out
 * before the repairs its final check asked for. `true` is a build of unknown size; `{records, rows}` the size its
 * `tracy_demo` answers named (`structure.read` total, the saved plan's rows).
 * @param {boolean | { records?: number, rows?: number } | undefined} build
 */
export function buildScale(build) {
  if (!build) return 1
  if (build === true) return BUILD_SCALE
  const count = (/** @type {number | undefined} */ n) => (typeof n === 'number' && n > 0 ? n : 0)
  return Math.min(
    MAX_BUILD_SCALE,
    BUILD_SCALE +
      Math.floor(count(build.records) / RECORDS_PER_SCALE) +
      Math.floor(count(build.rows) / ROWS_PER_SCALE)
  )
}

/**
 * How each `tracy_site` action counts against the budget. Every action in `RELAY_ACTIONS` plus the
 * two local ones has exactly one class here, and `test/site-context.test.mjs` proves it — a third
 * hand-kept list that drifts from the door is how the old `LOOKING_ACTIONS` came to omit four
 * read-only actions, one of which (`content.contract` inspect) the working rules themselves order
 * an agent to call FIRST on a quickstart. On those sites the brake died at call one.
 *
 * `prepare` is the distinction that did not exist before, and it is not a nicety: the working rules
 * ORDER a `db.snapshot` before an install (`siteContext`, the confirmation sentence). Counting the
 * obedience as the change resets the counter at exactly the moment the agent is about to do the
 * longest, least reversible thing in the turn. Measured 16/09: the snapshot at the head of the
 * language-pack dig bought forty unbraked calls.
 * @type {Record<string, 'read' | 'prepare' | 'write'>}
 */
const ACTION_CLASS = Object.freeze({
  // Reads — calling one is still looking.
  info: 'read',
  'content.list': 'read',
  'content.get': 'read',
  'content.read': 'read',
  'content.locate': 'read',
  'extension.list': 'read',
  'plugin.list': 'read',
  'theme.list': 'read',
  'db.tables': 'read',
  'core.manifest': 'read',
  'db.dump': 'read',
  'apply.list': 'read',
  'media.scan': 'read',
  'page.look': 'read',
  'page.text': 'read',
  'content.find': 'read',
  // Preparation the rules themselves ask for, or that changes nothing a visitor sees.
  'db.snapshot': 'prepare',
  // 🔒 NEVER PARALLEL, THE INSPECT INCLUDED. The Joomla component runs every contract call — a
  // read-only inspect too — under `GET_LOCK(…, 0)` (claude-cowork `Engine.php:135-142`,
  // `JoomlaSiteWriter.php:287-292`), so two overlapping inspects of one site answer one of them
  // `writer_busy`. Repeated inspects are removed by the per-turn inspect memo instead (plan v2 E3.1:
  // 88 of 123 r2 inspects answerable from it), which makes overlapping them worth nothing. Its write
  // (`operation:"apply"`) is judged by `changesSite`.
  'content.contract': 'prepare',
  // Writes — the thing the customer asked for.
  'content.batch': 'write',
  'content.update': 'write',
  'content.delete': 'write',
  'content.language': 'write',
  'media.upload': 'write',
  'media.delete': 'write',
  // Draws a picture and uploads it through media.upload: the site's media library changes.
  'media.draw': 'write',
  // Finds visible words where they are stored and rewrites them there (F3): the customer's change
  // itself, so it resets the budget and never runs beside a sibling. Classed before the door lists
  // it, which costs nothing — the test walks the door's lists, not this table.
  'content.replace': 'write',
  // Replacement rules for words a theme prints at render time; its inspect and status are judged
  // by `changesSite`, as the contract's are.
  'content.renderedWords': 'write',
  // Makes a new page and its menu entry (`page-create.mjs`): the customer's change itself.
  'page.create': 'write',
  'apply.revert': 'write',
  // Puts a look write's files back (`look-undo.mjs`): a visitor sees the page change.
  'look.revert': 'write',
  // Writes a look in the theme's or template's files (`look-set.mjs`): the customer's change itself.
  'look.set': 'write',
  'extension.install': 'write',
  'extension.enable': 'write',
  'theme.install': 'write',
  'theme.activate': 'write',
  'theme.style': 'write',
  'language.install': 'write',
  // Sets a Joomla template's logo, name or favicon (its read is classed with it: rare, and never worth a sibling).
  'template.siteSettings': 'write',
  // Sets Joomla's site name or description (its read is classed with it, as `template.siteSettings`'s is).
  'site.identity': 'write',
  'plugin.install': 'write',
  'plugin.activate': 'write',
  'core.upgrade': 'write',
  'db.rollback': 'write'
})

/** The classes, for the test that pins every action to exactly one of them. */
export const ACTION_CLASSES = ACTION_CLASS

/**
 * Reads that must still run ALONE, because reading the site is not the only thing they do.
 *
 * 🔒 `read` IS ABOUT THE SITE, `parallel` IS ABOUT THIS CONTAINER. The class above answers "does a
 * visitor see a difference" — which is what the refresh and the write lease need. Overlapping two
 * calls asks a different question: do they contend for something HERE. Three do.
 *
 * `page.text`'s normal read is a static GET (`curl` inside the site's container), which on its own
 * would be safe to overlap. It stays exclusive for the two things around that GET: a thin or
 * script-drawn page falls back to the image's browser, and two browsers in one site container
 * contend; and `paths:[…]` already fans out up to 4 reads of its own, so two such calls at once are
 * 8 execs against one container. `page.look` always drives that browser and writes a screenshot
 * file. `db.dump` writes an artifact and reads the whole database. None of them is worth the risk for
 * a step saved (r2: page reads were 75 s of the 802 s lost to serial calls), and a wrong `true` here
 * does not fail loudly — it produces a flake that lands on whichever call lost the race.
 */
const NOT_CONCURRENT = new Set(['page.text', 'page.look', 'db.dump'])

/**
 * Whether one `tracy_site` call may overlap with its siblings in the same assistant step.
 *
 * 🔒 THE HARNESS HAS RUN TOOL CALLS IN PARALLEL ALL ALONG, AND NO TRACY TOOL EVER OPTED IN.
 * `executeToolCalls` in dsh schedules a step's calls through a bounded rolling pool, with
 * `exclusive` calls forming barriers — but `ToolRegistry.executionMode` is fail-closed: only an
 * exact `true` from a tool's own `isConcurrencySafe` is parallel, and "unknown, hidden, undeclared,
 * invalid, or throwing classifiers are exclusive". Measured 21/09: `isConcurrencySafe` appears
 * ZERO times across `packages/`, so every Tracy call has been a barrier since the first one.
 *
 * That is the gap between what the site rules ask for and what the runtime could do. The rules
 * already tell the agent to name the layers a request spans before its first call; a survey that
 * names four of them still cost four sequential steps. And steps are the whole bill: measured
 * 19/09 on a WordPress lane, context went 6.528 → 81.792 tokens across 18 steps while the tool
 * RESULTS of all 21 turns came to ~39.883 — cacheRead is the integral of context, so it grows with
 * the SQUARE of the step count. Collapsing four reads into one step is not a 4× saving on those
 * four calls; it removes three whole context re-reads.
 *
 * Derived from `ACTION_CLASS`, never a second list: an action added to the door and missed here
 * would be read as undeclared, which is `exclusive` — the safe direction, and the reason this can
 * be derived at all.
 *
 * 🔒 THE CONTRACT ASKS ONE MORE THING, AND IT WAS CHECKED RATHER THAN ASSUMED: an opted-in
 * execution "must not mutate parent-owned state", and races are allowed "only when they commute or
 * fail closed". `tracy_site`'s handler keeps three things outside a call — `latest`, `bySession`
 * and `siteKey` — and none of them is written by a call. The first two are the viewer, written
 * ONLY by the `/hello` route when a browser says it is watching; a tool call reads them. The third
 * is a lazy memo of `MCP_TRACY_SITE_KEY`, a pure read of the env or the lane's env file, so two
 * calls racing to fill it compute the same string and either may win. Anything added here later
 * has to be re-argued against those three — a read that caches into a call-owned variable is the
 * shape that breaks this, and it breaks as a flake on whichever call lost.
 *
 * 🔒 THE CALL AS THE RELAY WILL SEND IT (`canonicalCall`), so an alias — `contract.inspect`,
 * `content_contract` — is judged as the action it becomes, not as an unknown name.
 *
 * @param {unknown} args - the call's parsed arguments.
 * @returns {boolean} true only for a read with no local contention.
 */
export function actionRunsInParallel(args) {
  const { action } = canonicalCall(args)
  return classOf(action) === 'read' && !NOT_CONCURRENT.has(action)
}

/**
 * The class of one action, or null for a name nobody classified. `hasOwn`, because the name is the
 * model's: `ACTION_CLASS.constructor` is Object's own function, not a class.
 * @param {string} action
 * @returns {'read' | 'prepare' | 'write' | null}
 */
function classOf(action) {
  return Object.hasOwn(ACTION_CLASS, action) ? ACTION_CLASS[action] : null
}

/**
 * Whether a `content.contract` operation changes the site, as the Joomla component reads it.
 *
 * 🔒 NO OPERATION IS AN INSPECT, AND `.plan` / `.verify` ARE READS. The component reads
 * `$p['operation'] ?? 'inspect'`, so `{changes}` with no `operation` changes nothing. It also runs
 * read-only operations under the same action: `multilingual.plan`, `multilingual.verify`,
 * `demoTrim.plan`, `siteLanguage.plan`, `sourceLanguage.plan` ("`plan` reads … `verify` re-reads",
 * claude-cowork `joomla/cowork/lib/Engine.php` `contentContract` and the four helpers it dispatches
 * to, origin/main 2aa7840). Until 25/09 each of them counted here as a settled write and reset the
 * looking window. Everything else — `apply`, `bind`, `*.apply`, `*.package`, `*.set`, `*.revert` —
 * writes.
 *
 * Trimmed, as the preview's `siteCallWrote` (tracy-site-tabs `turn.mjs`) trims it, so the two readers
 * of one call agree. The component does not trim: `"inspect "` is refused there as an unknown
 * operation, as is an operation that is not a string, so neither moves anything whichever way it is
 * classed. Exported so that reader can take this one instead of keeping its own.
 * @param {unknown} operation - `params.operation` of a canonical call.
 * @returns {boolean}
 */
export function contractOperationWrites(operation) {
  const op = typeof operation === 'string' ? operation.trim() : ''
  if (op === '' || op === 'inspect') return false
  return !/\.(plan|verify)$/.test(op)
}

// The set-only doors (`site.identity`, `template.siteSettings`, `template.languageOverrides`) live in
// their own module so `tiers.mjs` can read them without this file's imports; re-exported for
// tracy-site-tabs `turn.mjs`, which reads the door's tables from here.
export { SET_ONLY_WRITE_ACTIONS, setOnlyDoorWrites } from './set-only-doors.mjs'

/**
 * A `tracy_demo` provision call: a demo or own-site build waiting while Tracy installs its site. Measured
 * 24/10/2026 on EmDash: seventeen minutes of `provision.wait`, read by `stepBudget` as 653 s of looking, and the
 * agent was told to stop before the site existed.
 * @param {{ name?: unknown, arguments?: unknown } | undefined} call
 */
export function waitsOnProvision(call) {
  if (call?.name !== 'tracy_demo') return false
  let args = call.arguments
  if (typeof args === 'string')
    try {
      args = JSON.parse(args)
    } catch {
      return false
    }
  const operation = /** @type {{ operation?: unknown } | null} */ (args)?.operation
  return typeof operation === 'string' && operation.startsWith('provision.')
}

/**
 * A `tracy_demo` call that does a build's work: a plan saved, a photo imported, a check run. Measured 24/10/2026 on a
 * WordPress bakery: thirty photo imports in a row read as fifty steps of looking, and the agent, told to "make the
 * smallest change", ran one more check and ended the build with five allowed.
 * @param {{ name?: unknown, arguments?: unknown } | undefined} call
 */
export function buildsSite(call) {
  if (call?.name !== 'tracy_demo') return false
  let args = call.arguments
  if (typeof args === 'string')
    try {
      args = JSON.parse(args)
    } catch {
      return false
    }
  const operation = /** @type {{ operation?: unknown } | null} */ (args)?.operation
  return (
    operation === 'plan.save' ||
    operation === 'plan.add' ||
    operation === 'copy.write' ||
    operation === 'copy.apply' ||
    operation === 'media.import' ||
    operation === 'check' ||
    operation === 'check.start'
  )
}

/** How many `tracy_demo check` runs a build has: `DEMO_CHECKS` of tracy-web `client-demo.js`, kept in step by hand. */
export const BUILD_CHECKS = 8

/** One key of an answer's head and its value, when the value is a string, number, boolean or null. */
const HEAD_KEY = /"([\w$]+)":("(?:[^"\\]|\\.)*"|-?\d[\d.eE+-]*|true|false|null)([,}])/y

/**
 * One tool result's answer, or null. 🔒 A CUT ANSWER IS READ BY ITS HEAD (The Willow Nook local, build 13, then round
 * 10, 25/10/2026): an answer past dsh's inline bound (spill-policy `maxInlineTokens` 12500, about 50 KB) is kept as
 * its head and tail around a gap, which no JSON parse reads: three checks counted as none and the build that ended on
 * the third was never steered on; a long refusal lost its code and next, a long write that refused after writing some
 * places read as one that wrote nothing, and a long accepted answer read as refused by an `"ok":false` nested in it.
 * A cut answer is its own keys before its first nested value (`checkAnswerForAgent` puts `next`, `ok`, `checkId` and
 * `pass` first; a site answer leads with its `ok` and `code`), marked `cut`; a key inside a nested value is never
 * taken for the answer's.
 * @param {string} text
 * @returns {Record<string, any> | null}
 */
function answerOf(text) {
  try {
    return JSON.parse(text)
  } catch {
    if (!text.startsWith('{')) return null
    /** @type {Record<string, any>} */
    const head = {}
    HEAD_KEY.lastIndex = 1
    for (let m = HEAD_KEY.exec(text); m !== null; m = HEAD_KEY.exec(text)) {
      try {
        head[m[1]] = JSON.parse(m[2])
      } catch {
        break
      }
      if (m[3] === '}') break
    }
    return Object.keys(head).length > 0 ? { ...head, cut: true } : null
  }
}

/**
 * The checks a build's conversation has run, read off its log: how many answered a verdict, whether the latest passed,
 * and whether the server said none remain. A check still running (`DEMO_CHECK_RUNNING`) or refused is no verdict.
 * @param {readonly { type?: string, data?: any }[]} events - the session's events, oldest first.
 * @returns {{ checks: number, lastPass: boolean | null, exhausted: boolean }}
 */
/**
 * Only the latest turn spends the current build's check budget and contributes returning findings.
 * @param {readonly { type?: string, data?: any }[]} events
 */
export function latestTurn(events) {
  let start = 0
  for (let i = (events?.length ?? 0) - 1; i >= 0; i--)
    if (events[i]?.type === 'turn/start') {
      start = i
      break
    }
  return (events ?? []).slice(start)
}

/** @param {readonly { type?: string, data?: any }[]} events */
export function buildChecks(events) {
  events = latestTurn(events)
  const calls = new Set()
  let checks = 0
  let lastPass = null
  let exhausted = false
  for (const event of latestTurn(events)) {
    if (event?.type === 'tool/call' && event.data?.name === 'tracy_demo') {
      let args = event.data.arguments
      if (typeof args === 'string')
        try {
          args = JSON.parse(args)
        } catch {
          continue
        }
      if (args?.operation === 'check' || args?.operation === 'check.start') calls.add(event.data.callId)
    } else if (event?.type === 'tool/result' && calls.has(event.data?.message?.source?.callId)) {
      for (const text of resultTexts(event.data.message.content ?? [])) {
        const answer = answerOf(text)
        if (typeof answer?.pass === 'boolean') {
          checks += 1
          lastPass = answer.pass
        } else if (answer?.code === 'DEMO_CHECK_BUDGET_EXHAUSTED') exhausted = true
      }
    }
  }
  return { checks, lastPass, exhausted }
}

/**
 * Every check verdict a build got, oldest first: the `tracy_demo` answers that carry `pass` (the same reading as
 * `buildChecks`).
 * @param {readonly { type?: string, data?: any }[]} events
 * @returns {{ pass: boolean, checks?: { id?: string, pass?: boolean, detail?: unknown[] }[] }[]}
 */
export function checkVerdicts(events) {
  const calls = new Set()
  const out = []
  for (const event of latestTurn(events)) {
    if (event?.type === 'tool/call' && event.data?.name === 'tracy_demo') {
      let args = event.data.arguments
      if (typeof args === 'string')
        try {
          args = JSON.parse(args)
        } catch {
          continue
        }
      if (args?.operation === 'check' || args?.operation === 'check.start') calls.add(event.data.callId)
    } else if (event?.type === 'tool/result' && calls.has(event.data?.message?.source?.callId))
      for (const text of resultTexts(event.data.message.content ?? [])) {
        try {
          const answer = JSON.parse(text)
          if (typeof answer?.pass === 'boolean') out.push(answer)
        } catch {
          // not a verdict
        }
      }
  }
  return out
}

/**
 * What names a finding, never how much of it there is: a page, a record and its path, a selector, a file, a style.
 * `looks-finished` is left out — a vision model words the same fault differently each time, so its findings have no
 * identity to come back with.
 */
const FINDING_NAMES = [
  'page',
  'record',
  'path',
  'part',
  'selector',
  'file',
  'style',
  'declaration',
  'viewport',
  'src',
  'text'
]
/** @param {string} check @param {unknown} detail */
function findingKey(check, detail) {
  if (check === 'looks-finished' || detail === null || typeof detail !== 'object') return null
  const named = FINDING_NAMES.filter((k) => /** @type {Record<string, unknown>} */ (detail)[k] !== undefined)
  if (named.length === 0) return null
  return `${check}|${JSON.stringify(named.map((k) => [k, /** @type {Record<string, unknown>} */ (detail)[k]]))}`
}
/** @param {{ checks?: { id?: string, pass?: boolean, detail?: unknown[] }[] }} verdict */
function findingsOf(verdict) {
  /** @type {Map<string, { check: string, detail: Record<string, unknown> }>} */
  const out = new Map()
  for (const c of verdict?.checks ?? []) {
    if (c?.pass !== false || typeof c.id !== 'string') continue
    for (const d of c.detail ?? []) {
      const key = findingKey(c.id, d)
      if (key !== null) out.set(key, { check: c.id, detail: /** @type {Record<string, unknown>} */ (d) })
    }
  }
  return out
}

/**
 * The findings of a new verdict that an earlier check had and the check right before it no longer had: repaired,
 * then undone. Local round 31 (25/10/2026, WordPress): native-structure went 9 → 3 → 9 → 9 → 3 findings across five
 * checks while each repair of `looks-finished` (a darkened picture written into the block, an overlay colour in
 * global styles) broke what the repair before had put back, and no answer said so; the build spent its eight checks.
 * @param {readonly { type?: string, data?: any }[]} events - the log BEFORE the new verdict.
 * @param {{ checks?: { id?: string, pass?: boolean, detail?: unknown[] }[] }} verdict - the new one.
 * @returns {{ fixedAt: number, back: { check: string, detail: Record<string, unknown> }[] } | null} `fixedAt`: the
 *   1-based number of the check that no longer had them.
 */
export function findingsCameBack(events, verdict) {
  const before = checkVerdicts(events)
  if (before.length < 2) return null
  const now = findingsOf(verdict)
  const last = findingsOf(before[before.length - 1])
  const earlier = new Map()
  for (const v of before.slice(0, -1)) for (const [k, f] of findingsOf(v)) earlier.set(k, f)
  const back = [...now].filter(([k]) => !last.has(k) && earlier.has(k)).map(([, f]) => f)
  return back.length === 0 ? null : { fixedAt: before.length, back }
}

/** The checks that guard the template as installed: a repair that breaks one is undone by putting the template back. */
const GUARD_CHECKS = new Set(['native-structure', 'look-kept', 'css-intact'])

/**
 * What a verdict with findings that came back says first (`findingsCameBack`).
 * @param {{ fixedAt: number, back: { check: string, detail: Record<string, unknown> }[] }} came
 */
export function cameBackNext(came) {
  const shown = came.back
    .slice(0, 6)
    .map((f) => {
      const where = [f.detail.page, f.detail.record, f.detail.path ?? f.detail.selector ?? f.detail.file]
        .filter((x) => typeof x === 'string' && x !== '')
        .join(' ')
      return `${f.check}${where === '' ? '' : ` (${where})`}`
    })
    .join('; ')
  const guards = came.back.some((f) => GUARD_CHECKS.has(f.check))
  return `These came back after check ${came.fixedAt} had them repaired: ${shown}${came.back.length > 6 ? ` and ${came.back.length - 6} more` : ''}. A change made since check ${came.fixedAt} undid them — put that change back as it was before you repair anything else.${guards ? " native-structure, look-kept and css-intact keep the template as installed: never repair another failure by changing a block's markup, adding a colour or editing a stylesheet the template loads; words over a photo get a calmer photo or another crop of it." : ''}`
}

/**
 * Whether the build changed the site since its latest check verdict — a settled write (`changesSite`) or a photo
 * imported. True when no check has answered yet. Measured 24/10/2026 on a local stand: told to check again, a
 * WordPress build ran three checks in a row with nothing written between them, spending the checks it had left.
 * @param {readonly { type?: string, data?: any }[]} events - the session's events, oldest first.
 */
export function changedSinceCheck(events) {
  const list = latestTurn(events)
  const settled = new Map()
  for (const event of list)
    if (event?.type === 'tool/result')
      settled.set(event.data?.message?.source?.callId, resultWentThrough(event.data))
  const checks = new Set()
  let lastVerdict = -1
  list.forEach((event) => {
    if (event?.type !== 'tool/call' || event.data?.name !== 'tracy_demo') return
    let args = event.data.arguments
    if (typeof args === 'string')
      try {
        args = JSON.parse(args)
      } catch {
        return
      }
    if (args?.operation === 'check' || args?.operation === 'check.start') checks.add(event.data.callId)
  })
  list.forEach((event, i) => {
    if (event?.type !== 'tool/result' || !checks.has(event.data?.message?.source?.callId)) return
    for (const text of resultTexts(event.data.message.content ?? []))
      if (typeof answerOf(text)?.pass === 'boolean') lastVerdict = i
  })
  if (lastVerdict < 0) return true
  return list.some(
    (event, i) =>
      i > lastVerdict &&
      event?.type === 'tool/call' &&
      (changesSite(event.data) ||
        servesAgain(event.data) ||
        shellWrites(event.data) ||
        (buildsSite(event.data) && !checks.has(event.data?.callId))) &&
      settled.get(event.data?.callId) === true
  )
}

/**
 * An EmDash site served again after its code changed: `site.rebuild` or `site.restart`, and a shell or file write
 * before it (local round 35, 26/10/2026: an EmDash build edited three views under /app, restarted, and its check was
 * answered "nothing changed" twice).
 * @param {{ name?: unknown, arguments?: unknown } | undefined} call
 */
function servesAgain(call) {
  if (call?.name !== 'tracy_site_build_emdash') return false
  let args = call.arguments
  if (typeof args === 'string')
    try {
      args = JSON.parse(args)
    } catch {
      return false
    }
  const op = /** @type {{ operation?: unknown } | null} */ (args)?.operation
  return op === 'site.rebuild' || op === 'site.restart'
}

/**
 * A shell command that writes a file (`callWriteTargets`), wherever: a site's files changed under the check.
 * @param {{ name?: unknown, arguments?: unknown } | undefined} call
 */
function shellWrites(call) {
  if (call?.name !== 'bash' && call?.name !== 'shell') return false
  let args = call.arguments
  if (typeof args === 'string')
    try {
      args = JSON.parse(args)
    } catch {
      return false
    }
  const targets = callWriteTargets({ name: String(call.name), args, cwd: '/', siteRoot: '/' })
  return Array.isArray(targets) && targets.length > 0
}

/** What a check asked with nothing changed since the last one answers instead of running (`changedSinceCheck`). */
export const CHECK_UNCHANGED = Object.freeze({
  ok: false,
  code: 'DEMO_CHECK_NOTHING_CHANGED',
  next: 'Nothing on the site changed since the last check, so it would fail the same way and spend a check. Make the repairs the last check named first — each field, picture, link and passage, on the page it names — then check again. No check was spent.'
})

/**
 * What a failed `tracy_demo check` answers besides its findings while checks remain (`index.ts`, the `next` of the
 * answer), or null when none remains. Measured 24/10/2026 on a local stand: a Joomla bar and a WordPress bakery each
 * ended their build after two failed checks of five ("I'm running long; one more check and then finish"), the sentence
 * in the brief notwithstanding.
 * Local round 25 (25/10/2026): a WordPress build ended after its first check, counting a token budget it does not have
 * ("~200k used; maybe 40–60k left") in a conversation of a million tokens, so the answer says the site fits.
 * @param {{ checks: number }} state - the checks run, this one included.
 * @param {number} [limit]
 * @param {{ used: number, window: number } | null} [room] - how full the conversation is (`contextRoom`).
 * @returns {string | null}
 */
export function checkAgainNext(state, limit = BUILD_CHECKS, room = null) {
  const left = limit - state.checks
  if (left <= 0) return null
  return `This check failed and ${left} of ${limit} checks remain, so this build is not finished. Do not reply to the customer yet: repair every failure above — each field, picture, link and passage it lists, on the page it names — then call tracy_demo {operation:"check"} again. A whole site takes a long turn: its length is no reason to stop, and no time, token or step budget applies to it: it fits this conversation, so never stop, skip or shorten a repair to save tokens.${roomSaid(room)} End the turn only when a check passes or no check remains.`
}

/**
 * How full the conversation is: the last step's prompt (fresh, read from cache and written to it) against the window
 * `request/context` names, or null when the log holds either not. Local round 30 (25/10/2026): a WordPress build
 * ended with six checks left, "at the edge of my context", at 464K of 1,000K — a sentence saying the site fits did
 * not move it; the number may.
 * @param {readonly {type?: string, data?: any}[]} events
 * @returns {{used: number, window: number} | null}
 */
export function contextRoom(events) {
  let used = 0
  let window = 0
  for (const e of events ?? []) {
    if (e?.type === 'request/context' && Number.isFinite(e.data?.contextWindow)) window = e.data.contextWindow
    const u = e?.type === 'assistant/message' ? e.data?.usage : null
    if (u && typeof u === 'object') {
      const n = (u.inputTokens ?? 0) + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0)
      if (n > 0) used = n
    }
  }
  return used > 0 && window > 0 ? { used, window } : null
}

/** @param {{ used: number, window: number } | null | undefined} room */
const roomSaid = (room) =>
  room
    ? ` This conversation holds ${Math.round(room.used / 1000)}K of its ${Math.round(room.window / 1000)}K tokens: room for every repair.`
    : ''

/**
 * What a build about to end before any check is told (`checkAgainStep`). Measured 25/10/2026 (local round 18): a
 * WordPress build whose photo plan was refused replied to the customer with no check at all, so nothing listed what
 * was left and the build failed unchecked. The Willow Nook local (build 15 turn 1, 25/10/2026): every write was refused
 * while the site was held, the agent ended the turn with no check, and the build failed `AGENT_DEMO_ENDED_UNCHECKED`.
 * @param {number} [limit]
 * @param {{ used: number, window: number } | null} [room] - how full the conversation is (`contextRoom`).
 */
export function checkFirstNext(limit = BUILD_CHECKS, room = null) {
  return `No check has run, so this build is not finished. Do not reply to the customer yet: follow the way on of every refused call above (wait for the site when it says it is not ready, then save the plan and write the site), then call tracy_demo {operation:"check"} — it lists every picture, word and link still left, page by page — then repair what it names. ${limit} checks remain. A whole site takes a long turn: its length is no reason to stop, and it fits this conversation — no token budget is spent by repairing.${roomSaid(room)}`
}

/** The producer of the step a build is steered with when it would end on a failed check (`checkAgainStep`). */
export const CHECK_AGAIN_PLUGIN = 'tracy-site-tools:check-again'

/**
 * The step a build about to end its turn is steered with, or null: when no check has run (`checkFirstNext`), or when
 * its latest check failed, checks remain and the server did not say none remain (`buildChecks`). Measured 24/10/2026 on a local stand: with the same words in the
 * check's own answer (`checkAgainNext`), a WordPress build still replied to the customer after one check of five.
 * 🔒 SAFE ONLY BECAUSE A CLOSED TURN OPENS AGAIN (tracy-site-tabs `reopen`, tracy-web `openTurn`): a steer at
 * turn-stopping comes after the host closed the turn, and before that every write of the steered step was refused.
 * @param {readonly { type?: string, data?: any }[]} events
 * @returns {string | null}
 */
export function checkAgainStep(events) {
  const state = buildChecks(events)
  if (state.exhausted) return null
  const room = contextRoom(events)
  if (state.checks === 0)
    return ['<system-reminder>', checkFirstNext(BUILD_CHECKS, room), '</system-reminder>'].join('\n')
  if (state.lastPass !== false) return null
  const next = checkAgainNext(state, BUILD_CHECKS, room)
  return next === null ? null : ['<system-reminder>', next, '</system-reminder>'].join('\n')
}

/**
 * What a refused `plan.save` of a changed plan answers (`AGENT_DEMO_PLAN_FROZEN`), which the door sends with no way on.
 * Measured 24/10/2026 on a local stand: a WordPress build rewrote saved rows three times, then gave up.
 */
export const PLAN_FROZEN_NEXT =
  'A saved plan only grows, and only by its new part: tracy_demo {operation:"plan.add", rows:[<new rows, appended after the saved ones>], images:{"<rowIndex>":<image>}, tones:{"<rowIndex>":"dark"|"light"}} — never the saved rows again.'

/** How many entries of one list a failed check shows the agent; the rest are counted (`checkAnswerForAgent`). */
const CHECK_LIST_SHOWN = 12

/**
 * 🔒 A FAILED CHECK LEADS WITH ITS WAY ON AND STAYS READABLE (The Willow Nook local, build 11, 25/10/2026): a check
 * over every route answered 163 KB, the tool cut it at 50 KB with its `next` last, and the agent ended the turn
 * "extremely deep into this turn" with four checks left. What the agent is shown of a failed check: `next` first,
 * and each list of a check (`detail`, `unresolved`, `unpictured`…) at most {@link CHECK_LIST_SHOWN} long with the
 * rest counted in `<list>Left`; the next check lists what is still left. Any other answer is returned as it is.
 * @param {any} answer
 * @returns {any}
 */
export function checkAnswerForAgent(answer) {
  if (!answer || answer.pass !== false || !Array.isArray(answer.checks)) return answer
  const checks = answer.checks.map((/** @type {any} */ check) => {
    if (!check || typeof check !== 'object') return check
    /** @type {Record<string, unknown>} */
    const out = { ...check }
    for (const [key, value] of Object.entries(check))
      if (Array.isArray(value) && value.length > CHECK_LIST_SHOWN) {
        out[key] = value.slice(0, CHECK_LIST_SHOWN)
        out[`${key}Left`] = value.length - CHECK_LIST_SHOWN
      }
    return out
  })
  const { next, ...rest } = answer
  return { ...(typeof next === 'string' ? { next } : {}), ...rest, checks }
}

/**
 * 🔒 A REFUSED DRAFT IS FIXED AND SAVED AGAIN, NEVER ASKED ABOUT (The Willow Nook local, build 10, 25/10/2026): refused
 * once with 8 issues of its review posts, the agent stopped to ask the customer whether to carry on; nobody answers in
 * a demo build, so it failed `AGENT_DEMO_ENDED_UNCHECKED`. What a `plan.save` refused with the draft's own issues
 * answers, when the door sent no way on; null for any other answer.
 * @param {any} answer
 * @returns {string | null}
 */
export function planIssuesNext(answer) {
  if (!answer || answer.ok !== false || typeof answer.next === 'string') return null
  if (answer.code !== 'AGENT_DEMO_PLAN_INVALID' && answer.code !== 'AGENT_DEMO_TARGET_UNRESOLVED') return null
  const issues = answer.detail?.issues
  if (!Array.isArray(issues) || issues.length === 0) return null
  const n = issues.length
  return `${n} issue${n === 1 ? '' : 's'} of this draft, each at its row: fix exactly those and send plan.save again now, every other row as it was. Do not reply to the customer before the plan is saved: nobody answers a question in this chat, and a turn that ends here ends the build with nothing written.`
}

/**
 * Whether one logged tool call ASKED to change the site. Asking is not doing — see `settled`.
 *
 * 🔒 THE TWO WRITES THE COUNTER COULD NOT SEE. On a sealed Joomla site the only write is
 * `content.contract` with `operation:"apply"` — classed `prepare` because its inspect is what a
 * write is built on — and on EmDash every write is a `tracy_emdash` call, which this used to skip.
 * So a turn that had changed the site kept counting "steps without changing the site" straight
 * through the change. Measured 24/09 on the ja-business suite: 13 step-budget notices went out on
 * EmDash and Joomla, and 10 of them came AFTER a write that had gone through (EmDash C04, C09, C11,
 * C15, C16, C19, C23, C29, C33; Joomla C01, where the agent then inspected the contract again) —
 * each telling an agent that had just done the job that it had changed nothing. Replayed on the r2
 * logs (25/09): of the 16 notices sent in all, this reading drops exactly those 10 and keeps 6.
 *
 * 🔒 THE CALL AS THE RELAY SENDS IT, NOT AS THE MODEL SPELLED IT (`canonicalCall`). `contract.apply`,
 * `content_contract` with `operation` beside `action`, `dryRun` at the top level — each is the same
 * call once the relay has read it, so each is judged the same here. A contract call is judged by its
 * operation (`contractOperationWrites`).
 *
 * 🔒 AND A `tracy_emdash` CALL AS THE DOOR RUNS IT, NOT AS THE MODEL SPELLED IT (`normalizeEmdashShape`
 * — the reading `tracy_emdash`'s own `execute` and the preview's `callChangedSite` take). Until 25/09
 * this read the raw `tool`, so the brake and the door disagreed on one call: `{arguments:{tool:
 * "content_update", arguments:{…}}}` wrote while this saw no tool and no write; `{tool:"content.get"}`
 * read while this counted an unknown name as a settled write and reset the window; `{tool:"page.text"}`
 * (r2, once) is answered as `tracy_site`'s page read. `{list: true}`, a routed page read and a call the
 * door refuses before EmDash reach no EmDash tool, so none of them is a write.
 * @param {{ name?: unknown, arguments?: unknown } | undefined} call - a `tool/call` event's data.
 * @returns {boolean}
 */
export function changesSite(call) {
  if (call?.name === 'edit' || call?.name === 'write') return true
  if (call?.name === 'tracy_emdash') {
    const shape = normalizeEmdashShape(call.arguments)
    if (!shape.ok || shape.list === true || shape.route !== undefined) return false
    return !EMDASH_READ_TOOLS.has(shape.tool)
  }
  if (call?.name !== 'tracy_site') return false
  const { action, params } = canonicalCall(call.arguments)
  if (action === '') return false
  if (action === 'content.contract') return contractOperationWrites(params.operation)
  // A dry run reports the plan and writes nothing.
  if (action === 'content.replace') return params.dryRun !== true
  if (action === 'content.renderedWords') return params.operation === 'apply'
  // An action nobody classified is treated as a write: a new verb reaching the door is far more
  // likely to write than to read, and guessing "read" would silently nag an agent doing real work.
  return (classOf(action) ?? 'write') === 'write'
}

/**
 * Whether a call's own result says it went through. A refusal is not a change.
 *
 * 🔒 THE COUNTER MUST READ THE OUTCOME, NOT THE INTENT. `tracy_site` answers a refusal as an
 * ordinary result carrying `{"ok":false,…}` — the tool call succeeded, the site did not move.
 * Measured 16/09: three refusals in one turn (`content.language`, `extension.install`,
 * `content.contract`), each carrying a writing verb, each resetting the budget at the exact moment
 * the agent had just been told no and was about to invent a way around it.
 *
 * Unreadable results count as settled, deliberately: the fallback is today's behaviour, and a brake
 * that guesses wrong in the other direction nags an agent that really is working.
 * @param {Map<string, boolean>} settledById - callId → whether the result says it went through.
 * @param {{ callId?: unknown } | undefined} call
 * @returns {boolean}
 */
function settled(settledById, call) {
  const id = call?.callId
  if (typeof id !== 'string') return true
  return settledById.get(id) ?? true
}

/**
 * The text parts of a tool result, however deep dsh nested them.
 * @param {unknown} parts
 * @param {number} [depth]
 * @returns {string[]}
 */
function resultTexts(parts, depth = 0) {
  if (!Array.isArray(parts) || depth > 3) return []
  return parts.flatMap((part) =>
    typeof part?.text === 'string' ? [part.text] : resultTexts(part?.content, depth + 1)
  )
}

/**
 * Whether one answer text says the door refused: a JSON object whose own `ok` is false. A text that
 * is not JSON (a spilled head, a plain error line) is read the old way, by its `"ok":false`.
 * @param {string} text
 * @returns {boolean}
 */
function refusedText(text) {
  const answer = answerOf(text)
  if (
    answer !== null &&
    typeof answer === 'object' &&
    !Array.isArray(answer) &&
    (!answer.cut || 'ok' in answer)
  )
    return answer.ok === false
  return /"ok"\s*:\s*false/.test(text)
}

/**
 * Read one `tool/result` event: false when the tool errored or answered `ok:false`.
 *
 * 🔒 THE SHAPE IS SESSION FORMAT V4 (dsh 0.1.7): a first-class tool-role message,
 * `message: {role:'tool', source:{kind:'tool', callId}, toolCallId, content:[{type:'text', text}],
 * isError?}` — the error flag on the MESSAGE, the answer's blocks directly in `content`
 * (`session-format-v3-to-v4` `src/tool-role.ts:60-69`, README "Tool-result representation"). The
 * V3 wrapper this used to read (`content:[{type:'tool-result', content:[…], isError}]`, all 1,381
 * results of r2's 99 sessions) never reaches a plugin any more: a V3 log is migrated before a
 * Session exposes it (`session-persistence-jsonl` README :82), and native V4 refuses that wrapper
 * outright (`src/tool-role.ts:103-105`). So no V3 reading is kept here.
 *
 * 🔒 THE REFUSAL IS IN THE TEXT, NOT IN THE FLAG. `isError` did not save the first version of this
 * read: DeepSeek's endpoint ignores the flag, so Tracy answers a refusal with `isError:false` and a
 * `next`. A refused write reset the looking window exactly as an accepted one did — the failure
 * this function was written to stop (16/09). Replayed on r2 (25/09): 55 refused write calls counted
 * as changes, and three WordPress turns (C18, C23, C24) reached ten looking steps with no notice. So
 * the text is parsed, and a JSON answer's own top-level `ok` decides, never an `"ok":false` inside
 * the site's content; the text is still looked for below the top level, where a block nests one.
 *
 * 🔒 EXPORTED, BECAUSE "DID THE CALL GO THROUGH" HAS A SECOND READER. The preview reload
 * (tracy-site-tabs `turn.mjs` `refusedCalls`) takes this same reading. One function for both is the
 * only form of that promise that cannot drift.
 *
 * @param {{ message?: { content?: unknown, isError?: unknown }, error?: unknown } | undefined} data -
 *   a `tool/result` event's data.
 * @returns {boolean}
 */
export function resultWentThrough(data) {
  if (data?.message?.isError === true) return false
  const content = data?.message?.content
  if (Array.isArray(content) && resultTexts(content).some(refusedText)) return false
  return data?.error === undefined
}

/** Codes after which the site may hold something the replace job wrote: its caches are stale. */
export const MAY_HAVE_WRITTEN = Object.freeze(new Set(['PARTIAL', 'OUTCOME_UNKNOWN', 'STORE_CHANGED']))

/**
 * Whether a `content.replace` answer says something was written — whatever its code: an EmDash
 * `TOOL_FAILED` after some ops landed, a WordPress lease refusal with `written:n` and `partial:true`.
 * ONE reading for the preview, the step counter and the replace road's cache drop (review, 25/09).
 * @param {unknown} answer
 */
export function replaceWroteSome(answer) {
  if (!answer || typeof answer !== 'object') return false
  const a = /** @type {Record<string, unknown>} */ (answer)
  if (a.ok === true) return false
  if (MAY_HAVE_WRITTEN.has(String(a.code ?? '')) || a.partial === true) return true
  return Array.isArray(a.written) ? a.written.length > 0 : Number(a.written) > 0
}

/**
 * Whether one `tool/result` event is a refusal that leaves open whether the call ran
 * (`outcomeUnknown`, `site.mjs`: the relay's timeout, the component unreachable, a `writer_busy`
 * that is not the lock miss, EmDash's `SITE_UNREACHABLE`, a 502/503/504).
 *
 * 🔒 "REFUSED" IS NOT ALWAYS "WROTE NOTHING". The preview reload skips a door call whose result
 * refused it — right for `CONFIRM_FIRST`, wrong for these: after the 180 s relay timeout the write may
 * well have landed, and the customer's preview then showed the old page (review, 25/09). Read the
 * same way as `resultWentThrough`: the answer's text in the V4 tool-role message.
 * @param {{ message?: { content?: unknown }, error?: unknown } | undefined} data - a `tool/result`
 *   event's data.
 * @returns {boolean}
 */
export function resultOutcomeUnknown(data) {
  const content = data?.message?.content
  if (!Array.isArray(content)) return false
  return resultTexts(content).some((text) => {
    const answer = answerOf(text)
    // A replace answer that says some places were written (PARTIAL, STORE_CHANGED with `written`,
    // a lease refusal after the first record) changed the site, whatever its `ok` (review, 25/09).
    return outcomeUnknown(answer) || replaceWroteSome(answer)
  })
}

/**
 * How many steps of UNBROKEN LOOKING the turn has just taken, and how many notices already went out
 * in that run; null when it is not time to say anything.
 *
 * 🔒 THE OLD VERSION ANSWERED THE WRONG QUESTION, and the whole wander fits in the gap. It asked
 * "has this turn changed anything AT ALL" — one `return null` on the first site-changing call — so
 * a turn shaped `write → look forty times → write` was invisible to it by construction. Measured
 * 16/09 on "CHange Home to NewHOme" + "Change all content to Vietnamese": the first write landed at
 * call 6 of 75 and the only runtime brake in the system fired ZERO times across the remaining 69.
 *
 * So the reset point is now the LATEST of `turn/start` and the last settled change, and the notice
 * count is read inside that same window instead of cancelling the turn. Request 1 of the same
 * session — seven calls — is untouched: a run of looking that short never reaches STEP_BUDGET.
 * 🔒 E4.3 — TIME IS THE SECOND TRIGGER OF THE SAME NOTICE. It is also due once the run's tool time
 * reaches 120 s, however few steps that took (`TOOL_SECONDS`), and then the answer carries `seconds`
 * for the notice to name. A run with no timed events (tests, an old log) is judged by steps alone.
 * 🔒 A BUILD WITH A SAVED PLAN HAS `scale` TIMES THE ROOM (pilot 23/10/2026): a whole site built in one turn
 * pages through its research and every native record before it writes, and waits 30 s at a time on its
 * provision — work a single change never does, and that a ten-step bar called wandering.
 * @param {{ session?: { seq?: number, eventAt?: (seq: number) => any } } | undefined} agent
 * @param {number} [scale] - how many times the bar a turn has (`loopNotices` `build`).
 * @returns {{ steps: number, sent: number, seconds?: number } | null}
 */
export function stepBudget(agent, scale = 1) {
  const bar = STEP_BUDGET * scale
  const barSeconds = TOOL_SECONDS * scale
  const session = agent?.session
  if (!session || typeof session.seq !== 'number' || typeof session.eventAt !== 'function') return null
  // One forward pass first, so a call's result is known before the backward pass reads the call.
  const settledById = new Map()
  for (let seq = 0; seq < session.seq; seq += 1) {
    const event = session.eventAt(seq)
    if (event?.type !== 'tool/result') continue
    const id = event.data?.message?.source?.callId
    if (typeof id === 'string') settledById.set(id, resultWentThrough(event.data))
  }
  let steps = 0
  let sent = 0
  let latestCalledTool = false
  /**
   * E4.3 — tool seconds of the run, step by step: from a step's first `tool/call` to its last
   * `tool/result` (dsh logs a call when it starts and a result when it is committed, both with their
   * epoch `time`). 🔒 THE STEP'S SPAN, NOT A SUM OF CALLS: reads now run beside each other (E1.2), and
   * four overlapping five-second reads are five seconds of waiting, not twenty.
   */
  let ms = 0
  let firstCall = Number.POSITIVE_INFINITY
  let lastResult = Number.NEGATIVE_INFINITY
  // With the step being read: a notice sits inside a step, before that step's calls, so the calls
  // already read backward are AFTER it and count against the raised bar.
  const seconds = () => Math.round((ms + (lastResult >= firstCall ? lastResult - firstCall : 0)) / 1000)
  const due = () => {
    const timed = seconds() >= barSeconds
    if (!latestCalledTool || (steps < bar && !timed)) return null
    return timed ? { steps, sent, seconds: seconds() } : { steps, sent }
  }
  for (let seq = session.seq - 1; seq >= 0; seq -= 1) {
    const event = session.eventAt(seq)
    if (event?.type === 'turn/start') return due()
    if (event?.type === 'step/start') {
      steps += 1
      if (lastResult >= firstCall) ms += lastResult - firstCall
      firstCall = Number.POSITIVE_INFINITY
      lastResult = Number.NEGATIVE_INFINITY
    } else if (event?.type === 'tool/result') {
      if (typeof event.time === 'number') lastResult = Math.max(lastResult, event.time)
    } else if (event?.type === 'tool/call') {
      // A settled change is the other reset point: everything before it belongs to earlier work. So is a
      // demo build waiting on its provision: the site is being made, nothing is being looked at.
      if (
        ((changesSite(event.data) || buildsSite(event.data)) && settled(settledById, event.data)) ||
        waitsOnProvision(event.data)
      )
        return due()
      if (typeof event.time === 'number') firstCall = Math.min(firstCall, event.time)
      // Read newest first, so a call seen before any `step/start` belongs to the latest step.
      if (steps === 0) latestCalledTool = true
    } else if (event?.type === 'user/message' && isNoticeFrom(event.data?.source, STEP_BUDGET_PLUGIN)) {
      // A notice already sent IN THIS RUN no longer cancels the turn — it raises the bar. Silence
      // after one ignored nudge is what let a 75-call turn get exactly one reminder. The time bar
      // rises the same way: 240 s after one notice, 360 s after two.
      sent += 1
      if (steps < bar * (sent + 1) && seconds() < barSeconds * (sent + 1)) return null
    }
  }
  return due()
}

/** The producer a turn-length notice names; also how one already sent this turn is found. */
export const TURN_LENGTH_PLUGIN = 'tracy-site-tools:turn-length'

/** Steps a WHOLE turn may take before the agent is told to stop and report, whatever it spent them on. */
const TURN_LENGTH = 40

/**
 * How many steps this TURN has taken in total — the brake `stepBudget` cannot be.
 *
 * 🔒 `stepBudget` MEASURES UNBROKEN LOOKING, SO A WRITE EVERY FEW STEPS MAKES A TURN INVISIBLE TO IT.
 * Its backward pass stops at the last settled site-changing call, which is right for the shape it was
 * built for (`write → look forty times → write`) and blind to the opposite one: `look → write → look
 * → write`, where each write resets the window before it can reach ten.
 *
 * Measured 19/09/2026 on `demowpnam`, one request — "Change all content to Vietnamese":
 * **125 steps, 145 tool calls, 7 minutes 4 seconds, 8.2M cached prompt reads — and ONE notice, at
 * step 11.** The agent wrote a `vi-phrases.php` mu-plugin, then spent most of the turn repairing its
 * own PHP escaping: 60 `bash` calls, 15 `edit` and 6 `write` to that one file, `sed -i` on quoting,
 * `od -c` on bytes, `php -l` bisecting with `head -n`, and four throwaway scripts in `/tmp`. Every
 * one of those edits was a settled change, so the looking window never reached ten again and the
 * only brake in the system stayed silent for 114 steps.
 *
 * 🔒 IT IS A SECOND TRIGGER, NOT A REPLACEMENT. The two ask different questions — "have you stopped
 * exploring?" and "is this turn ever going to end?" — and a turn can fail either way. Counting only
 * total steps would let forty steps of pure archaeology pass unremarked, which is the defect
 * `stepBudget` exists for.
 *
 * ⚠ AND IT COUNTS STEPS, NOT CALLS. A step may carry several tool calls (the measured turn: 145
 * calls in 125 steps), and steps are what cost context: every step re-reads the whole prompt, so
 * cached reads grow with the SQUARE of the step count. 8.2M of them came from 125 steps.
 *
 * A build with a saved plan has `scale` times the room, as in `stepBudget`.
 * @param {{ session?: { seq?: number, eventAt?: (seq: number) => any } } | undefined} agent
 * @param {number} [scale]
 * @returns {{ steps: number, sent: number } | null} null when it is not time to say anything.
 */
export function turnLength(agent, scale = 1) {
  const session = agent?.session
  if (!session || typeof session.seq !== 'number' || typeof session.eventAt !== 'function') return null
  let steps = 0
  let sent = 0
  for (let seq = session.seq - 1; seq >= 0; seq -= 1) {
    const event = session.eventAt(seq)
    if (event?.type === 'turn/start') break
    if (event?.type === 'step/start') steps += 1
    else if (event?.type === 'user/message' && isNoticeFrom(event.data?.source, TURN_LENGTH_PLUGIN)) sent += 1
  }
  // Escalate the bar with each notice already sent, exactly as `stepBudget` does: one ignored nudge
  // must not buy silence for the rest of the turn, and one nudge per step would be noise.
  if (steps < TURN_LENGTH * scale * (sent + 1)) return null
  return { steps, sent }
}

/**
 * What a long turn is told, escalating with how many notices already went out in it.
 *
 * 🔒 IT MUST NOT READ AS "STOP EXPLORING". `stepBudgetNotice` opens "You have taken N steps without
 * changing the site" — and in the measured turn the agent HAD changed the site, over and over, which
 * is precisely why it never heard from that brake. A turn this long is a different failure: the work
 * stopped converging. So this names the shape it is actually in — repairing its own last attempt —
 * and asks for the one thing that ends it, which is a report to the customer rather than one more fix.
 *
 * @param {number} steps @param {number} [sent] @param {boolean} [build] - a build with a saved plan. @returns {string}
 */
export function turnLengthNotice(steps, sent = 0, build = false) {
  const opening = `This turn has taken ${steps} steps.`
  const body = build
    ? `${opening} A whole site takes many steps; spend each next one on a write your saved plan or the last check names, never on reading again what you already read, and run the next check once the last one's repairs are made.`
    : sent === 0
      ? `${opening} If the last several were spent fixing something you yourself wrote — re-running a linter, patching quoting, bisecting a file — stop and reconsider the approach rather than the error: a change the customer asked for should not need this. Finish the smallest version that works, or say what is blocking it.`
      : sent === 1
        ? `${opening} You were already asked to reconsider and carried on. Do not start another attempt. Say in plain words what is now true on the site, what is still wrong, and what you need — a half-finished change the customer knows about is worth more than one more repair they cannot see.`
        : `${opening} Stop now and report. Do not open, edit or run anything else.`
  return ['<system-reminder>', body, '</system-reminder>'].join('\n')
}

/** The producer a refusal-streak notice names; its `summary` ends with the verb it is about (E4.2). */
export const REFUSAL_STREAK_PLUGIN = 'tracy-site-tools:refusal-streak'

/** Refused calls of one verb in a row that make the notice due, and at most how many go out per verb. */
const STREAK = 3
const STREAK_NOTICES = 2
/** How much of the last refusal's next a streak notice quotes: T10's length of one next. */
const STREAK_NEXT_CHARS = 200

/**
 * The verb of one logged call, as the door runs it: `tracy_site <action>` (`canonicalCall`),
 * `tracy_emdash <tool>` (`normalizeEmdashShape`), or the tool's own name. Two calls of one verb with
 * different arguments are the probing E4.2 counts.
 * @param {{ name?: unknown, arguments?: unknown } | undefined} call - a `tool/call` event's data.
 * @returns {string}
 */
export function callVerb(call) {
  const name = typeof call?.name === 'string' ? call.name : ''
  if (name === 'tracy_site') {
    const { action } = canonicalCall(call?.arguments)
    return action === '' ? name : `${name} ${action.slice(0, 40)}`
  }
  if (name === 'tracy_emdash') {
    const shape = normalizeEmdashShape(call?.arguments)
    if (!shape.ok) return name
    if (shape.list === true) return `${name} list`
    if (shape.route !== undefined) return `tracy_site ${shape.route.action}`
    return typeof shape.tool === 'string' ? `${name} ${shape.tool.slice(0, 40)}` : name
  }
  return name.slice(0, 60)
}

/**
 * The code and next of one refused `tool/result`: the JSON answer's own `code` (or the component's
 * code on `error`) and `next`; a dsh tool's error code, with no next.
 * @param {any} data - a `tool/result` event's data.
 * @returns {{ code: string, next: string | null, message: string }}
 */
function refusalOf(data) {
  for (const text of resultTexts(data?.message?.content)) {
    const a = answerOf(text)
    if (a === null || typeof a !== 'object' || Array.isArray(a) || a.ok !== false) continue
    const code =
      typeof a.code === 'string' && a.code !== ''
        ? a.code
        : typeof a.error === 'string' && /^[a-z_]+$/.test(a.error)
          ? a.error
          : 'refused'
    const message = [a.message, a.error].find((m) => typeof m === 'string' && m !== code) ?? ''
    return { code, next: typeof a.next === 'string' ? a.next : null, message }
  }
  const code = typeof data?.error?.code === 'string' && data.error.code !== '' ? data.error.code : 'error'
  return { code, next: null, message: '' }
}

/**
 * The issues a refused `tool/result` lists about the call's own arguments (`detail.issues`, each its field and
 * code), as one key; null when it lists none.
 * @param {any} data - a `tool/result` event's data.
 * @returns {string | null}
 */
function issuesOf(data) {
  for (const text of resultTexts(data?.message?.content)) {
    try {
      const listed = JSON.parse(text)?.detail?.issues
      if (!Array.isArray(listed) || listed.length === 0) continue
      return JSON.stringify(
        listed.map((issue) => `${issue?.code ?? ''}\u0000${issue?.path ?? issue?.field ?? ''}`).sort()
      )
    } catch {
      // Not JSON: no issues.
    }
  }
  return null
}

/**
 * The listing call that answers a `content.get` not_found streak, by the kind the model asked for,
 * with the platform whose component takes it. A WordPress page is a post (WP-10 turns `page` into
 * `post` before the relay, but the logged call keeps the model's word), listed with its `post_type`;
 * a Joomla kind is listed by itself. Any other kind (a template part, an option) has no listing of
 * its ids here.
 *
 * A kind BOTH platforms read under one name gets a call only when the session names its platform:
 * no kind at all is a post on WordPress and an article on Joomla (each component's default,
 * `Engine.php` `contentGet`), and WordPress reads a category as a term (WP-11), which has no listing
 * (`NOT_LISTABLE`). Every other kind exists on one platform only, so it names that platform itself.
 * @type {ReadonlyMap<string, Readonly<{ wordpress?: string, joomla?: string }>>}
 */
const STREAK_LISTS = new Map([
  ['', { wordpress: '{kind:"post"}', joomla: '{kind:"article"}' }],
  ['post', { wordpress: '{kind:"post"}' }],
  ['posts', { wordpress: '{kind:"post"}' }],
  ['page', { wordpress: '{kind:"post", post_type:"page"}' }],
  ['pages', { wordpress: '{kind:"post", post_type:"page"}' }],
  ['article', { joomla: '{kind:"article"}' }],
  ['module', { joomla: '{kind:"module"}' }],
  ['menuItem', { joomla: '{kind:"menuItem"}' }],
  ['category', { joomla: '{kind:"category"}', wordpress: '' }]
])

/**
 * The platform a session's mode was made for — the preset is `<role>-<platform>` (`mode-matrix.json`)
 * — or null when it names none.
 * @param {Parameters<typeof sessionPreset>[0]} agent
 * @returns {'wordpress' | 'joomla' | 'emdash' | null}
 */
function presetPlatform(agent) {
  const found = /-(wordpress|joomla|emdash)$/.exec(sessionPreset(agent) ?? '')?.[1]
  return found === 'wordpress' || found === 'joomla' || found === 'emdash' ? found : null
}

/**
 * The one call that ends a streak, for the three shapes measured (V5 E4.2), or null — the refusal's
 * own next is said anyway. Each names only what the refused verb's door takes.
 *
 * 🔒 NEVER THE MODEL'S KIND COPIED INTO A CALL. It was: a WordPress streak of `content.get
 * {kind:"page"}` not_found (real — WP-10 maps the kind only on the way to the relay) was told
 * `content.list {kind:"page"} lists the ids that exist`, which WordPress refuses ("content.list
 * serves kind \"post\" only"); a template part or an option streak got the same unusable call
 * (review, 25/09). `STREAK_LISTS` holds the only kinds a listing answers, each on its platform.
 * @param {string} verb
 * @param {{ code: string, message: string }} refusal
 * @param {{ arguments?: unknown } | undefined} call - the latest refused call.
 * @param {'wordpress' | 'joomla' | 'emdash' | null} platform - the session's (`presetPlatform`).
 * @returns {string | null}
 */
function streakCall(verb, refusal, call, platform) {
  if (verb === 'tracy_site content.get' && refusal.code === 'not_found') {
    const raw = canonicalCall(call?.arguments).params.kind
    const kind = typeof raw === 'string' ? raw.trim() : raw === undefined ? '' : '?'
    const entry = STREAK_LISTS.get(kind)
    if (entry === undefined) return null
    // A platform the entry does not name, or none known where two are possible: no call. An empty
    // string is a platform that reads the kind and lists nothing (a WordPress category).
    const lists = Object.entries(entry)
    const list =
      platform === 'wordpress' || platform === 'joomla'
        ? entry[platform]
        : platform === null && lists.length === 1
          ? lists[0][1]
          : undefined
    return list ? `content.list ${list} lists the ids that exist.` : null
  }
  if (verb === 'tracy_site content.list' && refusal.code === 'bad_params') {
    const kinds = /kind must be one of:?\s*([A-Za-z_, ]{1,200})/.exec(refusal.message)?.[1]?.trim()
    return kinds ? `content.list takes kind one of: ${kinds}.` : null
  }
  if (verb === 'tracy_site content.contract' && refusal.code === 'contract_failed')
    return 'One content.contract {operation:"inspect", match:"<the words>"} shows the slot keys and their limits.'
  return null
}

/**
 * The refusal streak the turn ends on, when a notice about it is due (E4.2); null otherwise.
 *
 * 🔒 A REFUSAL IS NEVER PROGRESS, SO THIS CANNOT FIRE ON WORK THAT IS GOING WELL. It counts the
 * turn's latest calls, newest first, while each was refused and each is the SAME verb; any call that
 * went through, one of another verb, or a refusal listing other issues of its draft than the next, ends the run. Measured r2: WordPress C13 probed post ids 1…24
 * with `content.get` — 19 `not_found` in a row — and 7 more turns had streaks of 3 or more; a notice
 * at the third turns each into one listing call. dsh's `repeat-tool-reminder` does not see these:
 * the arguments differ on every call. Counted in calls, not steps (a step may carry several).
 *
 * Once per (turn, verb) at 3, once more at 6, then silent: the second notice is the last word, as
 * `stepBudget`'s third is.
 * @param {{ session?: { seq?: number, eventAt?: (seq: number) => any } } | undefined} agent
 * @returns {{ verb: string, count: number, sent: number, code: string, next: string | null, call: string | null } | null}
 */
export function refusalStreak(agent) {
  const session = agent?.session
  if (!session || typeof session.seq !== 'number' || typeof session.eventAt !== 'function') return null
  let start = 0
  for (let seq = session.seq - 1; seq >= 0; seq -= 1)
    if (session.eventAt(seq)?.type === 'turn/start') {
      start = seq
      break
    }
  const results = new Map()
  /** @type {any[]} */
  const calls = []
  /** @type {string[]} */
  const summaries = []
  for (let seq = start; seq < session.seq; seq += 1) {
    const event = session.eventAt(seq)
    if (event?.type === 'tool/result') {
      const id = event.data?.message?.source?.callId
      if (typeof id === 'string') results.set(id, event.data)
    } else if (event?.type === 'tool/call') calls.push(event.data)
    else if (event?.type === 'user/message' && isNoticeFrom(event.data?.source, REFUSAL_STREAK_PLUGIN))
      summaries.push(String(event.data?.source?.summary ?? ''))
  }
  let verb = ''
  let count = 0
  /** @type {any} */
  let latest
  /** @type {any} */
  let latestCall
  /** @type {string | null} */
  let issues = null
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const result = results.get(calls[i]?.callId)
    if (result === undefined || resultWentThrough(result)) break
    const v = callVerb(calls[i])
    const listed = issuesOf(result)
    if (count === 0) {
      verb = v
      latest = result
      latestCall = calls[i]
    } else if (v !== verb) break
    // 🔒 A DRAFT CORRECTED IS NOT A PROBE (The Willow Nook local, build 9, 25/10/2026): a validator that answers
    // with the draft's own issues (`plan.save`, 5, 6, 4, 3, 1, then 51 issues) is being worked down; the notices at
    // 3 and 6 told the agent to stop and it ended the build with nothing saved. A refusal listing other issues
    // than the call after it ends the run; the same list again is still probing.
    else if (listed !== null && issues !== null && listed !== issues) break
    issues = listed
    count += 1
  }
  if (count < STREAK) return null
  const sent = summaries.filter((summary) => summary.endsWith(`: ${verb}`)).length
  if (sent >= STREAK_NOTICES || count < STREAK * (sent + 1)) return null
  const refusal = refusalOf(latest)
  return {
    verb,
    count,
    sent,
    code: refusal.code,
    next: refusal.next,
    call: streakCall(verb, refusal, latestCall, presetPlatform(agent))
  }
}

/**
 * The notice's one-line `summary` — which `refusalStreak` reads back to know a verb was already told.
 * @param {{ verb: string, sent: number }} streak
 */
export function refusalStreakSummary(streak) {
  return `refusal streak ${streak.sent + 1}: ${streak.verb}`
}

/**
 * What a refusal streak is told: how many calls of the verb were refused, the last refusal's code and
 * next, the one call that ends it, and to stop probing. Appended after everything else a step
 * carries (CS3); it says nothing a later step would need again.
 * @param {{ verb: string, count: number, sent: number, code: string, next: string | null, call: string | null }} streak
 * @returns {string}
 */
export function refusalStreakNotice(streak) {
  /**
   * 🔒 THE QUOTED NEXT IS CUT TO T10'S 200 CHARACTERS, AND THE CODE ENDS ITS OWN SENTENCE. The whole
   * next rode along — `LEGACY_STRUCTURE_CODE`'s is about 600 characters — and with none, the code ran straight
   * into the call: "not_found content.list…" (review, 25/09).
   */
  const quoted = streak.next ? streak.next.trim() : ''
  const next = quoted.length > STREAK_NEXT_CHARS ? `${quoted.slice(0, STREAK_NEXT_CHARS - 1)}…` : quoted
  const last = `the last one: ${streak.code}${next !== '' ? ` — ${next}` : ''}`
  const head = `${streak.count} calls of ${streak.verb} in a row were refused; ${/[.!?…]$/.test(last) ? last : `${last}.`}`
  const call = streak.call ? ` ${streak.call}` : ''
  const body =
    streak.sent === 0
      ? `${head}${call} Do not probe further: make that call or tell the customer what is missing.`
      : `${head} You were told three refusals ago and kept probing.${call} Stop calling ${streak.verb}: make that call, or tell the customer what is missing.`
  return ['<system-reminder>', body, '</system-reminder>'].join('\n')
}

/**
 * Whether this session is carrying a plan the customer can see: the latest `todo/write` left at
 * least one of its items unfinished.
 *
 * WHY THE WHOLE LOG AND NOT JUST THIS TURN. The list belongs to the session, not to a turn — the
 * fork's tool-todo keeps a plan with an item still `in_progress` across `turn/start`, which is the
 * rule `tracy-site-build-core`'s `todos.mjs` leans on to draw a build's stages there. An agent
 * halfway down a plan of its own has already done the thing the budget exists to ask for, so the
 * notice must say something else to it.
 *
 * @param {{ session?: { seq?: number, eventAt?: (seq: number) => any } } | undefined} agent
 * @returns {boolean}
 */
export function hasPlan(agent) {
  const session = agent?.session
  if (!session || typeof session.seq !== 'number' || typeof session.eventAt !== 'function') return false
  for (let seq = session.seq - 1; seq >= 0; seq -= 1) {
    const event = session.eventAt(seq)
    if (event?.type !== 'todo/write') continue
    // Only the latest one is the plan: an earlier list was replaced, not added to.
    const todos = event.data?.todos
    return Array.isArray(todos) && todos.some((item) => item?.status !== 'completed')
  }
  return false
}

/**
 * The step budget notice's text, escalating with how many already went out in this run of looking.
 *
 * 🔒 THE PLANNED BRANCH USED TO ENDORSE THE WANDER. It said "carry out the item that is in
 * progress" — and in the measured turn the in-progress item was "Recon: inventory menus, articles,
 * modules, categories, language settings". An anti-exploration notice that points at an exploration
 * item is permission. So the planned branch now asks what the item's WRITE is, and says that an
 * item which names no record and no field is not an item.
 *
 * 🔒 LEVEL 0 NO LONGER ORDERS A CHANGE WHEN NONE IS DUE. A question, or a change missing the one
 * fact only the customer has, is finished by answering or asking — and the notice said "make the
 * smallest change". Measured 24/09: WordPress C31 ("change the phone number", no number) got it at
 * step 11, after ten steps of reading for a number that was never on the site.
 *
 * 🔒 LEVEL 1 CARRIES THE ONE FACT THAT ENDS THE ARCHAEOLOGY. The measured turn spent eight calls
 * re-deriving from `mod_breadcrumbs` source a parameter `content.get` had already returned, and
 * eleven more tracing `detectLanguage` through Joomla core to reach a change the door could make all
 * along. A sentence in the per-turn rules is 30-70 calls back in the window by then; this is the
 * only place it arrives while the rule is being broken. It names each platform's read, because
 * `tracy_site` `content.get` refuses on EmDash and says nothing useful on a sealed Joomla
 * quickstart — and the contract read is named for the sealed sites that have one: Joomla's, and since
 * #337 a WordPress site provision bound; a sealed WordPress site with no binding has no contract door
 * (r2: `content.contract` → `bad_action` at step 1 of 32 of 33 WordPress turns).
 *
 * 🔒 E4.3: when time made it due (`stepBudget` answered `seconds`), the opening names the seconds —
 * "4 steps" alone would read as no reason to stop. Without `seconds` every text is byte-for-byte what
 * it was.
 *
 * 🔒 A MODE WITHOUT `todo_write` IS NOT TOLD TO CALL IT (`toolReach`): its plan goes in the reply, as
 * the site context's SEVERAL JOBS line says for that mode. The planned branch needs no such care —
 * `hasPlan` reads `todo/write` events, which such a mode never writes.
 *
 * @param {number} steps - how many steps of unbroken looking the turn has just taken.
 * @param {boolean} [planned] - whether a plan of this session's own is still open (`hasPlan`).
 * @param {number} [sent] - how many notices already went out in this run of looking.
 * @param {number} [seconds] - the run's tool seconds, when they made the notice due.
 * @param {{ todo?: boolean }} [reach] - whether the agent has `todo_write` (`toolReach`); default yes.
 * @param {boolean} [build] - a demo or own-site build with a saved plan (`loopNotices` `build`): told to write its plan.
 * @returns {string}
 */
export function stepBudgetNotice(steps, planned = false, sent = 0, seconds, reach = {}, build = false) {
  const plan =
    reach.todo === false
      ? 'write the plan in your reply, one line per change, and start its first item.'
      : 'call `todo_write` with the plan, one item per change, and start its first item.'
  const opening =
    typeof seconds === 'number'
      ? `You have taken ${steps} step${steps === 1 ? '' : 's'} and ${seconds} s of tool time without changing the site.`
      : `You have taken ${steps} steps without changing the site.`
  // A whole site built from a saved plan is not one change: it is told to write its plan, never to make the smallest
  // change or to stop and report while checks remain (`buildsSite`).
  const body = build
    ? `${opening} Make the next write now: the field or picture the next row of your saved plan names, or a repair the last check named. Do not read again a record you already read. Keep going until a check passes or the fifth has run.`
    : sent === 0
      ? planned
        ? `${opening} Your plan is still open: name the write the item in progress needs — which record, which field — and make it. An item that names no record is not an item; rewrite the plan so every item is a change.`
        : `${opening} Stop exploring now. If the customer asked a question, answer it with what you have; if the change needs a fact only they know, ask for it. Otherwise make the smallest change that does what the customer asked, or — if what you found means this is several changes rather than one — ${plan}`
      : sent === 1
        ? `${opening} You were already asked to stop exploring and did not. This site's own records answer through its content door — \`tracy_site\` \`content.get\`, \`content.contract\` inspect on a Joomla or WordPress quickstart with a contract, \`tracy_emdash\` \`content_get\` on EmDash; the platform's own source code does not, and reading it cannot change anything. Make the next write now, or tell the customer what you found and what you need from them.`
        : `${opening} Stop. Do not open another file, page or address. Say in plain words what you have changed so far, what is left, and the one thing you need from the customer to finish it.`
  return ['<system-reminder>', body, '</system-reminder>'].join('\n')
}

/**
 * Every loop notice one `agent/pre-step` appends, in the order they go out: the step budget (E4.1,
 * and E4.3's seconds when time made it due), the turn length, then the refusal streak (E4.2) — last,
 * as it says nothing a later step needs again (CS3). Each `{plugin, text, summary}` is one `notice`
 * in `index.ts`; the summaries are the ones each reader looks for.
 *
 * 🔒 ONE READING, ONE TEXT: NO FIELD OF A BUDGET CAN FALL BETWEEN THEM. `index.ts` built the step
 * budget's text from `budget.steps` and `budget.sent` by hand, so when `stepBudget` became due on
 * time alone (two or three wide steps, E4.3) the model was told "You have taken 2 steps without
 * changing the site" and nothing about the 162 s that made it due (review, 25/09). Here the whole
 * budget reaches the notice; `test/site-context.test.mjs` drives a time-only budget through it.
 * @param {Parameters<typeof stepBudget>[0]} agent
 * @param {{ tools?: Iterable<string> | null, build?: boolean | { records?: number, rows?: number } }} [options] - `tools`:
 *   the names of the tools the agent is sent (`toolReach`), so the step budget names `todo_write` only to an agent that
 *   has it. `build`: a demo or own-site build (`index.ts` `demoBuilds`), with its size when known — both bars are
 *   `buildScale` times.
 * @returns {{ plugin: string, text: string, summary: string }[]}
 */
export function loopNotices(agent, options = {}) {
  /** @type {{ plugin: string, text: string, summary: string }[]} */
  const out = []
  const scale = buildScale(options?.build)
  const budget = stepBudget(agent, scale)
  if (budget !== null)
    out.push({
      plugin: STEP_BUDGET_PLUGIN,
      text: stepBudgetNotice(
        budget.steps,
        hasPlan(agent),
        budget.sent,
        budget.seconds,
        toolReach(options?.tools),
        scale !== 1
      ),
      summary: `step budget ${budget.sent + 1}`
    })
  const long = turnLength(agent, scale)
  if (long !== null)
    out.push({
      plugin: TURN_LENGTH_PLUGIN,
      text: turnLengthNotice(long.steps, long.sent, scale !== 1),
      summary: `turn length ${long.sent + 1}`
    })
  const streak = refusalStreak(agent)
  if (streak !== null)
    out.push({
      plugin: REFUSAL_STREAK_PLUGIN,
      text: refusalStreakNotice(streak),
      summary: refusalStreakSummary(streak)
    })
  return out
}
