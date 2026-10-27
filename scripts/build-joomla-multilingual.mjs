#!/usr/bin/env node
/**
 * Generate `multilingual-map.json` — the multilingual extension of a quickstart contract.
 *
 * WHY A MACHINE AND NOT HUMAN EYES: this profile classifies **every one** of the contract's 197
 * entities. A missed entity reports no error anywhere — it simply has no
 * translation, and the Chinese page shows an English block among the translated ones. A reviewer reading 197
 * lines of JSON will not see that line 198 is missing. This gate reads the original contract, classifies again, and compares
 * byte for byte — so "one entity missing" is a red run, not an ugly page at a customer's.
 *
 * 🔒 THIS PROFILE DOES NOT CHANGE THE BYTES OF CONTRACT 1.1.0. The three files `manifest`/`content-map`/
 * `presentation-lock` are released and carry their identity; the Claude Cowork plugin's `contractHash` is still the
 * digest of exactly those three files. The multilingual profile is a FOURTH file, with its own version, pinning itself to the
 * base by `baseHash`. That is how a capability is added without re-releasing an archive customers have installed.
 *
 * 🔒 ONE PROFILE FOR EACH DESIGN IN SERVICE, NOT ONE PROFILE FOR APPLE. Since one base
 * archive serves several designs (`design-templates.json`), a site may be bound to
 * `tracy-airbnb/j6/1.0.0`. Generate a profile for every `designs.*.contractProfile` that exists on disk: with one
 * missing, a site wearing that design answers "multilingual not supported" — correct as code, but
 * a sentence the customer cannot make sense of when the site next to it can add languages.
 *
 * Run: `node scripts/build-joomla-multilingual.mjs [--check] [--profile <id> ...]`
 *
 * `--profile <id>` (repeatable) builds only the profiles named, also one no design serves yet: the next
 * cut of a served design (`tracy-apple/j6/1.3.1` before its switch is flipped) needs its own profile
 * bound to its own base, or the Claude Cowork plugin refuses it ("The multilingual profile does not belong to this
 * contract"). Without it, the list is the registry's and `quickstarts.json`'s, as below.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTRACTS = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts')
const REGISTRY = path.join(
  ROOT,
  'packages/fleet/tracy-fleet-operation/scripts/provision/design-templates.json'
)
const SOURCE_LANGUAGE = 'en-GB'
const CHECK_ONLY = process.argv.includes('--check')

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

const CAPABILITIES = path.join(ROOT, 'packages/site/tracy-site-build-joomla/src/host/capabilities.json')

/**
 * Which contracts need a profile: every design `served` in the registry, by its `contractProfile`.
 * The registry is the ONLY table answering "a customer picks this design, which profile is the site bound to", so
 * taking the list from it instead of typing it by hand is the only way to add a design without silently forgetting
 * its multilingual part.
 */
const registry = readJson(REGISTRY)
/**
 * 🔒 A DESIGN WITH NO MULTILINGUAL PROFILE MUST **DECLARE IT**, NOT BE GUESSED.
 *
 * JoomlArt's quickstart cannot build such a profile, and the reason is a measurement, not a
 * choice: `ja-kinetic` carries `menuItem.img = " "`, which the derivation rules here cannot reproduce
 * on the copy, so `assertUniform` refuses — exactly as it should. That design declares
 * `multilingual: false`, the gate skips it and **says what it skipped**. A design declaring nothing
 * is still asked for a profile, so a newly added Tracy design cannot slip through by staying silent.
 */
const skippedDesigns = Object.entries(registry.designs)
  .filter(([, design]) => design.state === 'served' && design.multilingual === false)
  .map(([id]) => id)
const CONTRACT_IDS = [
  ...new Set(
    Object.values(registry.designs)
      .filter(
        (design) => design.state === 'served' && design.contractProfile && design.multilingual !== false
      )
      .map((design) => design.contractProfile)
  )
]
/**
 * 🔒 THE DESIGN REGISTRY IS NOT THE ONLY ROAD BY WHICH A SITE IS BOUND TO A CONTRACT.
 *
 * `design-templates.json` lists only the *designs* of Tracy's base archive. A standalone quickstart —
 * `tracy-business/j6` — pins its `contract` directly in `quickstarts.json` and does not appear in
 * that registry. Measured 22/09 on `site-jvsjoe`: the `language` stage died with "This quickstart contract
 * carries no multilingual profile" because this gate had never looked at the second list. Reading both
 * sources is the only way a new quickstart does not quietly reach customers without its multilingual part.
 */
const quickstarts = readJson(
  path.join(ROOT, 'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json')
)
// A design that declared `multilingual: false` declared it once and that is enough: this second road must not
// pull it back into the list through the back door of `quickstarts.json`.
const declinedProfiles = new Set(
  Object.values(registry.designs)
    .filter((design) => design.multilingual === false && design.contractProfile)
    .map((design) => design.contractProfile)
)
// A standalone quickstart that is not in the design registry declares `multilingual: false` on its
// own `quickstarts.json` entry — the same second road `build-joomla-demo-trim.mjs` reads `demoTrim`
// from. Saying nothing still means a profile is demanded.
const skippedQuickstarts = Object.entries(quickstarts)
  .filter(([, entry]) => entry?.platform === 'joomla' && entry.contract && entry.multilingual === false)
  .map(([id, entry]) => {
    declinedProfiles.add(entry.contract)
    return id
  })
for (const entry of Object.values(quickstarts))
  if (entry?.platform === 'joomla' && entry.contract && !declinedProfiles.has(entry.contract))
    CONTRACT_IDS.push(entry.contract)
const NAMED = process.argv.flatMap((arg, i, all) => (arg === '--profile' && all[i + 1] ? [all[i + 1]] : []))
if (NAMED.length) CONTRACT_IDS.splice(0, CONTRACT_IDS.length, ...NAMED)
CONTRACT_IDS.splice(0, CONTRACT_IDS.length, ...new Set(CONTRACT_IDS).values())
CONTRACT_IDS.sort()
if (!CONTRACT_IDS.length) throw new Error('The design registry serves no contract profile')
if (skippedDesigns.length)
  process.stdout.write(
    `build-joomla-multilingual: skipped ${skippedDesigns.length} design(s) declaring multilingual: false (${skippedDesigns.join(', ')})\n`
  )
if (skippedQuickstarts.length)
  process.stdout.write(
    `build-joomla-multilingual: skipped ${skippedQuickstarts.length} quickstart(s) declaring multilingual: false (${skippedQuickstarts.join(', ')})\n`
  )

let failed = false
for (const CONTRACT_ID of CONTRACT_IDS) generate(CONTRACT_ID)
if (failed) process.exit(1)

/** @param {string} CONTRACT_ID */
function generate(CONTRACT_ID) {
  const dir = path.join(CONTRACTS, CONTRACT_ID)
  const manifest = readJson(path.join(dir, 'manifest.json'))
  const map = readJson(path.join(dir, 'content-map.json'))
  const lock = readJson(path.join(dir, 'presentation-lock.json'))

  /**
   * The base's identity, computed on the BYTES of the three files — not on the decoded structure.
   *
   * ⚠ The Claude Cowork plugin's `contractHash()` hashes the decoded structure, and that number CANNOT be reproduced here:
   * measured 12/09, PHP's `json_encode` keeps the key order read from the file while JS's `JSON.stringify`
   * reorders every integer-looking key ascending. `presentation-lock` has
   * exactly that shape — the ACL `rules` are `{"6":1,"2":1}` — so the two sides produce strings that differ
   * at byte 938991 and two different hashes, while the data is identical.
   *
   * So this profile pins the base by something both languages compute identically: the sha256 of each file,
   * joined by name. The same measure `quickstarts.json.contractFiles` already uses.
   */
  const fileHashes = Object.fromEntries(
    ['manifest.json', 'content-map.json', 'presentation-lock.json'].map((name) => [
      name,
      sha256(readFileSync(path.join(dir, name)))
    ])
  )
  const baseHash = sha256(
    Object.entries(fileHashes)
      .map(([name, hash]) => `${name}:${hash}\n`)
      .join('')
  )

  const entities = Object.fromEntries(map.entities.map((entity) => [entity.key, entity]))
  const slotsByEntity = new Map()
  for (const slot of map.slots) {
    if (!slotsByEntity.has(slot.entity)) slotsByEntity.set(slot.entity, [])
    slotsByEntity.get(slot.entity).push(slot)
  }

  /**
   * 🔒 A QUICKSTART MAY ALREADY BE MULTILINGUAL INSIDE ITS ARCHIVE, AND THAT IS A DIFFERENT SHAPE ENTIRELY.
   *
   * Apple and Airbnb ship ONE edition: every row at `language='*'`, and adding a language means pulling the original
   * to `en-GB` and then creating copies. `tracy-business` does not — measured 22/09 on its contract 1.1.0:
   * 81 modules, 43 articles, 38 menu items carry `en-GB` and EXACTLY AS MANY carry `ru-RU`, plus 3 modules
   * and 2 menu items at `*`. The `ru-RU` edition is not a translation: it carries its own legal entity numbers (INN,
   * OGRN, SRO), Russian client names and a Moscow address — data that cannot be derived from the English.
   *
   * So for such an archive, `authoredLanguages` states the set of languages already present, and three kinds of
   * rows are treated differently. Without this step the profile would build a Vietnamese edition for BOTH
   * editions — two Vietnamese topbars stacked — and would pull the `*` rows (breadcrumbs, language switcher,
   * search box) to `en-GB`, taking them off every live Russian page.
   */
  const authoredLanguages = [
    ...new Set(
      Object.keys(entities)
        .map((key) => String(lock.entities[key]?.language ?? ''))
        .filter((tag) => tag !== '' && tag !== '*')
    )
  ].sort()
  const alreadyMultilingual = authoredLanguages.length > 0
  if (alreadyMultilingual && !authoredLanguages.includes(SOURCE_LANGUAGE))
    throw new Error(
      `${CONTRACT_ID} ships editions ${authoredLanguages.join(', ')} but none in the source language ${SOURCE_LANGUAGE}`
    )
  const otherEditions = authoredLanguages.filter((tag) => tag !== SOURCE_LANGUAGE)

  /**
   * Classify one entity. Three valid answers, and every answer other than `translate` must carry a reason
   * — principle #3 of AGENTS.md: say what is missing, do not leave it blank.
   */
  function classify(key) {
    const entity = entities[key]
    const fields = lock.entities[key]
    const slots = slotsByEntity.get(key) ?? []
    const tag = String(fields?.language ?? '')
    if (alreadyMultilingual && tag !== '' && tag !== SOURCE_LANGUAGE)
      return tag === '*'
        ? {
            policy: 'shared',
            reason: `This row stays at language '*' on an archive that already publishes ${authoredLanguages.join(' and ')}. Joomla filters \`language IN (tag, '*')\`, so one row already renders on every edition; pulling it to ${SOURCE_LANGUAGE} so it could be copied would take it off the ${otherEditions.join('/')} pages it serves today`
          }
        : {
            policy: 'shared',
            reason: `This row belongs to the ${tag} edition the archive AUTHORED, not to a translation of ${SOURCE_LANGUAGE}. Its words carry facts the source does not hold — the archive's ${tag} rows name their own legal identifiers, clients and address — so a receiver must never derive, overwrite or re-key them, and a second copy of them in a new language would put two editions of the same block on one page` // vocabulary-allow: text of an already released profile
          }
    // The identity module (`[Tracy] Site identity`) is ONE row for the whole site: plg_system_tracyidentity
    // reads it by `note`, not by language, so one copy per language is N identity sources and
    // which one the plugin takes depends on row order. It renders nothing, so it has no words to translate.
    if (entity.siteIdentity)
      return {
        policy: 'shared',
        reason:
          "The site's identity (name, contact, social links) is one row for every language: plg_system_tracyidentity finds it by its note, not by language, and it renders nothing itself — a copy per language would give the site several identities and no rule for which one a page shows"
      }
    switch (entity.kind) {
      case 'article':
        return { policy: 'translate' }
      case 'menuItem':
        return { policy: 'translate' }
      case 'module':
        // The visible words are those in `content`/`params`, PLUS `title` when showtitle is on. A module
        // with no text slot that still shows its title must still be translated — otherwise the Chinese page
        // carries an English title right in the middle of translated content.
        if (slots.length > 0 || fields.showtitle === '1') return { policy: 'translate' }
        return {
          policy: 'shared',
          reason: `${fields.module} renders rows Joomla itself filters by the active language and shows no fixed copy (showtitle is off), so one module serves every language`
        }
      case 'category':
        // A deliberate decision, not an oversight. See `unsupported` below for the cost.
        return {
          policy: 'shared',
          reason:
            'The published 1.1.0 contract exposes no category content slot, and the receiver cannot set a category alias on create — a translated category would take a generated alias and move every derived article into a tree whose ordering and ACL the base contract does not describe' // vocabulary-allow: text of an already released profile
        }
      case 'templateStyle':
        return {
          policy: 'shared',
          reason: 'A template style is presentation, shared by every language and locked by the base contract'
        }
      default:
        throw new Error(`Unclassified entity kind: ${entity.kind} (${key})`)
    }
  }

  const policies = {}
  for (const key of Object.keys(entities)) {
    const verdict = classify(key)
    policies[key] = { kind: entities[key].kind, ...verdict }
  }

  const translated = Object.keys(policies).filter((key) => policies[key].policy === 'translate')

  /**
   * The fields of the ORIGINAL that may change when a language is added.
   *
   * A translated entity must leave `*` for the source language, otherwise it shows on BOTH language editions
   * and the customer sees two heroes stacked. This is the only delta on the original, it is recorded in the receipt,
   * and `revert` returns it to `*`.
   */
  const sourceDelta = {
    language: { from: '*', to: SOURCE_LANGUAGE, entities: translated }
  }

  /** Check the assumptions the derivation rules rely on, at generation time — not when writing to a customer site. */
  /**
   * ⚠ ONLY ROWS THAT ARE REALLY COPIED ARE CHECKED. A `shared` row never has a copy, so
   * the derivation rules need not reproduce any of its fields — checking it fails on something that does not
   * happen. Before 22/09 the gate scanned every entity, and on `tracy-business` it went red over the `metadesc` of a
   * Russian article that is never copied anywhere.
   */
  function assertUniform(kind, field, allowed) {
    const seen = new Set(
      Object.keys(entities)
        .filter((key) => entities[key].kind === kind && policies[key].policy === 'translate')
        .map((key) => String(lock.entities[key][field] ?? ''))
    )
    for (const value of seen)
      if (!allowed.includes(value))
        throw new Error(
          `${kind}.${field} carries ${JSON.stringify(value)} on a row this profile copies, which the derivation rule cannot reproduce on the copy`
        )
  }
  // The Claude Cowork plugin cannot write the `publish_up`/`publish_down` of modules and menu items, so a quickstart
  // with a publishing schedule on them must turn this gate red rather than silently drop that schedule.
  assertUniform('module', 'publish_up', [''])
  assertUniform('module', 'publish_down', [''])
  assertUniform('menuItem', 'publish_up', [''])
  assertUniform('menuItem', 'publish_down', [''])
  /**
   * "No image" has TWO spellings on a Joomla menu and the Claude Cowork plugin knows both. The quickstart's
   * dump carries `''`; everything `Table\Menu::check()` writes carries `' '` (one space). The copy
   * goes through that very Table, so `MultilingualProfile::derivedPresentation()` treats the two spellings
   * as one when both the source and the real row are blank — read the `if ($kind === 'menuItem' && trim(...))` block
   * in `joomla/cowork/lib/MultilingualProfile.php`. This gate was once stricter than the Claude Cowork plugin, and the cost
   * was `tracy-business` (menu items carrying `' '` across the whole archive) refused over a difference
   * that no viewer and no administrator could see.
   */
  assertUniform('menuItem', 'img', ['', ' '])
  assertUniform('module', 'client_id', ['0'])
  assertUniform('menuItem', 'client_id', ['0'])
  // The articles' `metadesc`/`metakey` are empty across this whole quickstart, so copying them verbatim is
  // enough. A later quickstart with hand-written SEO must turn this gate red, not quietly carry the English
  // description over to the Chinese page.
  /**
   * ⚠ `metadesc` MUST NOT BE SILENT, BUT IT IS NO LONGER A DEAD-END RED RUN EITHER.
   *
   * `derive.article.carry` copies `metadesc` verbatim, so an article with hand-written SEO carries that exact English
   * sentence to the Vietnamese page. Dropping it from `carry` CANNOT fix this on this side: `inspect()`
   * builds the copy's expectation from the original's presentation, so a copy missing `metadesc` is drift
   * on the very next read. What this gate can hold is: those articles must be NAMED in
   * `unsupported`, so they appear in the acceptance report instead of vanishing.
   */
  /**
   * 🔒 AN ARCHIVE THAT ALREADY HAS A LANGUAGE SWITCHER REUSES THAT ONE, IT DOES NOT BUILD A SECOND.
   *
   * `MultilingualApply::phaseFinish()` finds the module by the profile's `note` — `existingSwitcher()` —
   * and only creates one when it finds none. `tracy-business` ships `module-425`: `mod_languages`, position
   * `language-switcher`, the template's own layout (`tracy_business:tb`), note `tb:pilot`, already
   * `published` and assigned `menuid 0` (every page). Pinning the profile's `note` to that very note is the only
   * way the Claude Cowork plugin RECOGNISES it; leave `tracy-ml:switcher` and the topbar has two switchers side by
   * side, the second with the default layout instead of the template's.
   *
   * Every value below is read from `presentation-lock.json`, none typed by hand — so the write
   * of `phaseFinish` matches exactly what the contract locked, and `inspect()` sees no drift.
   */
  const switcherKey = Object.keys(entities).find(
    (key) => entities[key].kind === 'module' && lock.entities[key]?.module === 'mod_languages'
  )
  const shippedSwitcher = switcherKey
    ? {
        module: 'mod_languages',
        position: String(lock.entities[switcherKey].position),
        anchorEntity: switcherKey,
        language: String(lock.entities[switcherKey].language),
        showtitle: String(lock.entities[switcherKey].showtitle),
        access: String(lock.entities[switcherKey].access),
        published: String(lock.entities[switcherKey].published),
        ordering: String(lock.entities[switcherKey].ordering),
        assignment: 'all',
        note: String(lock.entities[switcherKey].note),
        params: JSON.parse(lock.entities[switcherKey].params)
      }
    : null
  if (switcherKey && policies[switcherKey].policy !== 'shared')
    throw new Error(`${switcherKey} is the shipped language switcher but this profile would copy it`)

  const carriedMetadesc = Object.keys(entities)
    .filter(
      (key) =>
        entities[key].kind === 'article' &&
        policies[key].policy === 'translate' &&
        String(lock.entities[key].metadesc ?? '') !== ''
    )
    .sort()
  assertUniform('article', 'metakey', [''])
  // A copied row must stand at `*` (then `sourceDelta` pulls it to the source language) or already stand
  // in the source language itself. Any other tag was classified `shared` by `classify`, so reaching here is a bug.
  for (const kind of ['article', 'module', 'menuItem'])
    assertUniform(kind, 'language', alreadyMultilingual ? [SOURCE_LANGUAGE] : ['*'])

  const profile = {
    schemaVersion: 'tracy-quickstart-multilingual/v1',
    /**
     * 🔒 BUMP THIS WHEN THE DERIVATION RULES CHANGE — EVEN WHEN THOSE RULES LIVE IN THE PHP CODE.
     *
     * `inspect()` RECOMPUTES every copy from its source row, so changing `remapLink` or `derivedPresentation`
     * changes the expectation for a site built under the old rules: it goes red at once with "Presentation drift", and
     * red in the place that also blocks the undo that could have cleaned up. Measured 12/09 when `remapLink` was changed to
     * recognise `view=`.
     *
     * This number goes into `profileHash` in the binding, so bumping it turns a silent drift into a
     * clear sentence — "The installed multilingual profile changed" — and forces a migration path
     * instead of letting old sites break on their own.
     */
    extensionVersion: '1.1.0',
    contract: manifest.id,
    baseHash,
    baseFiles: fileHashes,
    sourceLanguage: SOURCE_LANGUAGE,
    /**
     * The derivation machine: each kind states which fields are carried verbatim, which are translated, and which
     * the Claude Cowork plugin computes itself. The Claude Cowork plugin understands exactly these keys and nothing else — no expression
     * is loaded from here.
     */
    derive: {
      article: {
        create: 'row',
        carry: [
          'catid',
          'state',
          'featured',
          'access',
          'ordering',
          'publish_up',
          'publish_down',
          'images',
          'urls',
          'attribs',
          'metadata',
          'metadesc',
          'metakey'
        ],
        translate: ['title', 'introtext', 'fulltext'],
        // ⚠ NOT like a menu item. Joomla's `Table\Content::store()` checks alias uniqueness by
        // `(alias, catid)` and does NOT count the `language` column — measured 12/09 on 6.1.1, line 356 of
        // `libraries/src/Table/Content.php` — so a translation reusing the original's alias is refused with
        // `COM_CONTENT_ERROR_UNIQUE_ALIAS`. A menu item's unique index includes `language`, so it keeps
        // the alias and the URLs of the two languages share a path. Two rules differ because Joomla differs.
        alias: 'source-sef',
        association: 'articleAssociation'
      },
      module: {
        create: 'row',
        carry: [
          'module',
          'position',
          'ordering',
          'published',
          'showtitle',
          'access',
          'client_id',
          'publish_up',
          'publish_down'
        ],
        translate: ['content', 'params', 'title'],
        // A title that is NOT shown is the administrator's label. Translating it to Chinese takes away
        // the customer's ability to read the Module Manager screen without changing anything on the page.
        hiddenTitle: '{source} [{locale}]',
        note: 'tracy-ml:{sourceKey}:{locale}',
        assignments: 'map'
      },
      menuItem: {
        create: 'nested',
        carry: [
          'menutype',
          'type',
          'browserNav',
          'access',
          'published',
          'params',
          'template_style_id',
          'component_id'
        ],
        translate: ['title'],
        alias: 'source',
        parent: 'map',
        // A copy's `path` equals the original's `path` (same alias, same parent chain), so every URL
        // slot written as a raw path — `/resources/style-guide` — is already right for both languages without
        // rewriting. Only `Itemid=` and `&id=` are numeric references, and only they are remapped.
        link: 'remap-ids',
        home: 'mirror',
        note: 'tracy-ml:{sourceKey}:{locale}',
        association: 'menuAssociation'
      }
    },
    /**
     * 🔒 ORDER, NOT PREFERENCE. A MENU ITEM translation KEEPS the original's alias, so the URLs are
     * `/en/resources/style-guide` and `/zh/resources/style-guide` — one path, two prefixes.
     * That is only valid once the original has left `*`: `Table\Menu::store()` treats an alias at `language='*'`
     * as taken in EVERY language under the same parent, while the unique index of `#__menu` counts the
     * `language` column. So `sourceDelta` must run BEFORE copies are created; reversing the order makes Joomla
     * refuse menu items one by one, with a sentence about the alias rather than about the order.
     */
    aliasPolicy: 'shared-with-source',
    sourceDelta,
    policies,
    /** The language switcher: one module, the right type in the right position, not a stand-in mod_custom. */
    switcher: shippedSwitcher ?? {
      module: 'mod_languages',
      position: 'header-r',
      // The same slot as `[Tracy Apple] Chrome - Header action`, the only slot of this quickstart that a
      // top-of-page chrome element already occupies — so the switcher stands next to the Contact button instead of finding
      // a new position in the layout.
      anchorEntity: 'module-170',
      language: '*',
      showtitle: '0',
      access: '1',
      published: '1',
      assignment: 'all',
      note: 'tracy-ml:switcher',
      params: {
        header_text: '',
        footer_text: '',
        dropdown: 0,
        image: 0,
        inline: 1,
        show_active: 1,
        full_name: 0,
        horizontal: 1,
        active_lang_icon: 0,
        layout: '_:default',
        moduleclass_sfx: '',
        cache: 0
      }
    },
    /** The language routing plugin. Only the keys below are written. */
    languageFilter: {
      element: 'languagefilter',
      folder: 'system',
      enabled: 1,
      params: {
        item_associations: 1,
        detect_browser: 0,
        automatic_change: 0,
        remove_default_prefix: 0,
        lang_cookie: 0,
        alternate_meta: 1,
        xdefault: 1,
        xdefault_language: SOURCE_LANGUAGE
      }
    },
    /** The target language's `#__languages` row. `sef` is the URL prefix. */
    contentLanguage: {
      published: '1',
      access: '1',
      image: '{sef}'
    },
    /**
     * What is NOT translated, with the effect the user sees. This list is part of the contract:
     * an entry here is one that must appear in the acceptance report, not one that is forgotten.
     */
    unsupported: [
      {
        scope: 'category',
        effect:
          'Category titles and descriptions stay in the source language wherever Joomla renders them directly: breadcrumbs on a category route, and the section list of the Magazine sidebar module.',
        reason:
          policies[
            Object.keys(policies).find(
              (key) =>
                entities[key].kind === 'category' &&
                (!alreadyMultilingual || String(lock.entities[key].language) === SOURCE_LANGUAGE)
            )
          ].reason
      },
      {
        scope: 'menu:tracy-utility',
        effect:
          'The utility menu Joomla ships for account, contact and newsfeed routes is outside the contract inventory. Those routes keep one menu item for every language; their component views translate themselves from the installed language pack, but the menu item titles stay in the source language. No module renders this menu, so the titles are not on a page.',
        reason: 'Not identified by the published 1.1.0 contract, which covers the `tracy` menu only'
      },
      {
        scope: 'article:archived',
        effect: 'Archived articles keep their state and get no translation.',
        reason: 'Not identified by the published 1.1.0 contract, which covers published articles only'
      },
      {
        scope: 'acm-layout-defaults',
        effect:
          'Copy written into a template ACM layout as the fallback for an empty module parameter renders in the source language on every page, translated or not. Measured 12/09/2026 on the Apple quickstart home page: 33 of 180 visible lines, among them the three feature cards and the four statistic labels.',
        reason:
          'These strings are not content slots in the published 1.1.0 contract — grep the content map and they are absent — so they cannot be edited in the SOURCE language either. They live in `templates/tracy/acm/*/tmpl/style-1.php`, which the presentation lock hash-locks as design. Reaching them is a change to the contract or to the template, not to this extension.'
      },
      {
        scope: 'text-in-images',
        effect: 'Words baked into an image stay in the source language.',
        reason:
          'The contract carries image paths, not image content, and Tracy does not redraw customer artwork'
      },
      {
        scope: 'menuItem:type=url',
        effect:
          'A menu item linking to a raw site path keeps that path. When the path names a source-language route the switcher still reaches the source page.',
        reason: 'A raw path is not an entity reference the receiver can remap with proof' // vocabulary-allow: text of an already released profile
      },
      ...(otherEditions.length
        ? [
            {
              scope: `edition:${otherEditions.join(',')}`,
              effect: `The archive's own ${otherEditions.join(' and ')} edition is left exactly as published and gets no copy in the new language. Its pages keep serving ${otherEditions.join('/')} visitors unchanged.`,
              reason:
                'Those rows are authored content, not a translation of the source: they carry legal identifiers, client names and an address the source language does not hold, so nothing here can derive or check them'
            }
          ]
        : []),
      ...(carriedMetadesc.length
        ? [
            {
              scope: `article:metadesc (${carriedMetadesc.join(', ')})`,
              effect: `${carriedMetadesc.length} article${carriedMetadesc.length > 1 ? 's' : ''} ship${carriedMetadesc.length > 1 ? '' : 's'} a hand-written meta description, and the copy carries it in the SOURCE language. The translated page's own words are translated; the sentence a search engine quotes is not.`,
              reason:
                '`metadesc` is not a content slot of the published contract, so it is carried rather than translated; dropping it from the copy would make the copy differ from the expectation `inspect()` computes from the source row'
            }
          ]
        : []),
      ...(alreadyMultilingual
        ? [
            {
              scope: 'entity:language=*',
              effect: `Rows the archive left at '*' — ${Object.keys(entities)
                .filter((key) => String(lock.entities[key]?.language ?? '') === '*')
                .sort()
                .join(', ')} — render on the new language's pages in the source language.`,
              reason:
                "Joomla filters `language IN (tag, '*')`, so one row already serves every edition; pulling it to the source language so it could be copied would remove it from the editions the archive publishes today"
            }
          ]
        : [])
    ],
    counts: {
      translate: translated.length,
      shared: Object.keys(policies).length - translated.length,
      total: Object.keys(policies).length
    }
  }

  /**
   * Two locale lists, one source.
   *
   * The pack catalog is what the Claude Cowork plugin installs from; `locales` in capabilities is what the agent is ALLOWED to offer the customer.
   * When they drift, no error fires: the agent offers a language the Claude Cowork plugin refuses, or hides
   * a pinned language. Both read plausibly, so this gate compares them.
   */
  const catalog = readJson(path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/language-packs.json'))
  const capabilities = readJson(CAPABILITIES)
  const expectedLocales = Object.values(catalog.packs)
    .filter((pack) => pack.platformMajors.includes(6))
    .map((pack) => pack.tag)
  const declared = capabilities.providers['joomla-multilingual']?.locales ?? []
  if (JSON.stringify(declared) !== JSON.stringify(expectedLocales))
    throw new Error(
      `capabilities.json declares locales ${JSON.stringify(declared)} but the pack catalog pins ${JSON.stringify(expectedLocales)}`
    )

  const file = path.join(dir, 'multilingual-map.json')
  const text = `${JSON.stringify(profile, null, 2)}\n`

  if (CHECK_ONLY) {
    let current
    try {
      current = readJson(file)
    } catch {
      console.error(
        `build-joomla-multilingual: ${CONTRACT_ID}/multilingual-map.json is missing or unreadable — run the script and commit it.`
      )
      failed = true
      return
    }
    /**
     * ⚠ COMPARE STRUCTURE, NOT BYTES — and that is not a loosening.
     *
     * This file has TWO owners: the generator decides the CONTENT, biome decides the LAYOUT (it folds short
     * arrays onto one line). The bytes belong to nobody: generate then format and the gate is red, format then
     * generate again and it is red too. Comparing structure lets each owner keep its own part, and a missing key still
     * goes red as before — which is what this gate exists to catch.
     */
    const differences = []
    const compare = (want, has, at) => {
      if (JSON.stringify(want) === JSON.stringify(has)) return
      if (want === null || has === null || typeof want !== 'object' || typeof has !== 'object') {
        differences.push(`${at}: expected ${JSON.stringify(want)}, file has ${JSON.stringify(has)}`)
        return
      }
      for (const key of new Set([...Object.keys(want), ...Object.keys(has)]))
        compare(want[key], has[key], `${at}.${key}`)
    }
    compare(profile, current, 'multilingual-map')
    if (differences.length) {
      console.error(
        'build-joomla-multilingual: multilingual-map.json differs from the contract it is generated from —\n' +
          differences
            .slice(0, 8)
            .map((line) => `  ${line}`)
            .join('\n') +
          (differences.length > 8 ? `\n  (and ${differences.length - 8} more)` : '') +
          '\n  run `node scripts/build-joomla-multilingual.mjs` and commit the result.'
      )
      // Accumulate rather than exit here: with more than one design the reader wants every profile
      // that drifted, not the first one.
      failed = true
      return
    }
    console.log(
      `${CONTRACT_ID}: ${profile.counts.translate} translated, ${profile.counts.shared} shared; ` +
        `capabilities offer ${declared.join(', ')}`
    )
  } else {
    writeFileSync(file, text)
    console.log(
      `${CONTRACT_ID}  ${profile.counts.translate} translated, ${profile.counts.shared} shared, baseHash ${baseHash.slice(0, 12)}`
    )
  }
}
