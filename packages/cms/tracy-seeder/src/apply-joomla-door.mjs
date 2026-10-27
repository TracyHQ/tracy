/**
 * The seed plan written into a Joomla site THIS MACHINE DOES NOT HOLD, one seat-door call at a time.
 *
 * WHY A SECOND WRITER. `apply-joomla.mjs` boots Joomla beside a webroot and writes with its Table
 * API. That is the right writer for the lane's own site and the wrong one for every other: *Create
 * with* builds a NEW site, whose files live in its own container, and the lane holds neither them
 * nor any credential for them (tasks/todo-build-new-site.md). What the lane holds is a seat — so the
 * writes go through the seat book's Apply door as the person who pressed.
 *
 * WHY NOT ONE WRITER, THE WAY WORDPRESS HAS ONE. WordPress's two writers share an interface because
 * both speak the same five verbs. Joomla's do not: the local one is PHP running inside Joomla, the
 * remote one is JSON over a door, and no interface spans a language boundary. The two are kept
 * honest by writing the SAME SITE — same aliases, same layouts, same menu — and the local script
 * stays the fallback for a Joomla site with no component installed.
 *
 * WHAT THE DOOR CANNOT DO, said out loud rather than faked:
 *   · `created` is an authorship column the door does not write, so posts carry today's date and
 *     `publish_up` alone is back-dated.
 *   · A menu module's page assignment (`#__modules_menu`) is not a content row, so a module is
 *     never created here — the one Joomla ships is moved into the template's position instead.
 */

import { wanted } from './apply-wordpress.mjs'

/**
 * What a NEW article must carry to satisfy `#__content`'s NOT NULL columns. Joomla's own model
 * fills these from a form; a door write names them itself or the insert is refused.
 */
const ARTICLE_EMPTY = {
  introtext: '',
  fulltext: '',
  images: '{}',
  urls: '{}',
  attribs: '{}',
  metakey: '',
  metadesc: '',
  metadata: '{}',
  // 1 is Public. `access` has no default in this schema either, and an article that lands on 0 —
  // a view level that does not exist — is served as "You don't have permission to access this" to
  // everyone, including the person who just built the site. Measured 08/09: every page of a
  // freshly built Joomla site answered 403.
  access: 1
}

/** How many rows one listing asks for, and how many listings before a kind is called too big. */
const PAGE = 100
const PAGES_MAX = 5

/**
 * @typedef {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<unknown>} Apply
 */

/**
 * @param {{
 *   plan: any,
 *   apply: Apply,
 *   siteKey: string,
 *   applyId: string,
 *   pages?: string[],
 *   images?: Map<string, { mime: string, bytes: Buffer }>,
 *   author?: string,
 *   now?: number
 * }} o
 */
/**
 * A language slug as Joomla tags content: `vi` → `vi-VN`.
 *
 * 🔒 THE FALLBACK IS NOT ENOUGH ON ITS OWN. `xx` → `xx-XX` is right for vi, ja, ko, fr, de, it, nl,
 * pl, ru, tr and most others, and WRONG for exactly the ones a customer is most likely to pick —
 * English is `en-GB` on a stock Joomla (not `en-US`), Chinese is `zh-CN`, Portuguese `pt-PT`,
 * Arabic `ar-AA`. A wrong tag is not an error: Joomla files the article under a language that does
 * not exist, and it vanishes from the site with nothing in a log.
 */
const JOOMLA_TAG = {
  en: 'en-GB',
  zh: 'zh-CN',
  pt: 'pt-PT',
  ar: 'ar-AA',
  he: 'he-IL',
  el: 'el-GR',
  cs: 'cs-CZ',
  da: 'da-DK',
  sv: 'sv-SE',
  nb: 'nb-NO',
  no: 'nb-NO',
  uk: 'uk-UA',
  ja: 'ja-JP',
  ko: 'ko-KR',
  vi: 'vi-VN',
  hi: 'hi-IN',
  fa: 'fa-IR',
  ur: 'ur-PK',
  bn: 'bn-BD',
  ms: 'ms-MY',
  sr: 'sr-RS',
  sq: 'sq-AL',
  ca: 'ca-ES',
  eu: 'eu-ES',
  gl: 'gl-ES',
  ga: 'ga-IE',
  cy: 'cy-GB',
  af: 'af-ZA',
  sw: 'sw-KE',
  zu: 'zu-ZA',
  am: 'am-ET',
  ha: 'ha-NG',
  yo: 'yo-NG',
  ig: 'ig-NG',
  et: 'et-EE',
  sl: 'sl-SI',
  bs: 'bs-BA',
  km: 'km-KH',
  lo: 'lo-LA',
  my: 'my-MM',
  ne: 'ne-NP',
  si: 'si-LK',
  ta: 'ta-IN',
  te: 'te-IN',
  ml: 'ml-IN',
  kn: 'kn-IN',
  mr: 'mr-IN',
  gu: 'gu-IN',
  pa: 'pa-IN',
  tl: 'tl-PH',
  lb: 'lb-LU'
}

/**
 * @param {string} lang
 * @returns {{ tag: string, guessed: boolean }} `guessed` when the table had no answer and `xx-XX`
 *   was assumed — right for fr, de, it, ru and most of the rest, and a caller should say so.
 */
export function joomlaTag(lang) {
  const slug = String(lang).toLowerCase()
  const known = JOOMLA_TAG[slug]
  if (known) return { tag: known, guessed: false }
  return { tag: `${slug}-${slug.toUpperCase()}`, guessed: true }
}

export async function applyJoomlaThroughDoor({
  plan,
  apply,
  siteKey,
  applyId,
  pages = ['all'],
  images = new Map(),
  author = '',
  now = Date.now(),
  /** Every language the customer chose, first one first. */
  languages = [],
  /** The same plan written again in each EXTRA language: `[{ lang, plan }]`. */
  translations = []
}) {
  /** @type {string[]} */
  const warnings = []

  /**
   * One door call. A refusal carries the site's OWN sentence: `TOOLSET_NOT_GRANTED` tells the
   * customer to ask their Owner, and "the site said no" would send them hunting instead.
   * @param {string} action @param {Record<string, unknown>} params
   * @returns {Promise<Record<string, any>>}
   */
  const call = async (action, params) => {
    const answer = await apply({ siteKey, action, params })
    const a = /** @type {Record<string, any>} */ (answer && typeof answer === 'object' ? answer : {})
    if (a.ok === false) {
      const words = [a.message, a.error, a.code].find((w) => typeof w === 'string' && w !== '')
      throw new Error(String(words ?? `${action} was refused`))
    }
    return a
  }

  /**
   * Every row of one kind, paged. Joomla's `content.list` takes no name filter — unlike
   * WordPress's — so a row is found by reading the kind and matching here.
   * @param {string} kind
   * @returns {Promise<Record<string, any>[]>}
   */
  const listAll = async (kind) => {
    /** @type {Record<string, any>[]} */
    const rows = []
    for (let page = 0; page < PAGES_MAX; page++) {
      const answer = await call('content.list', { kind, offset: page * PAGE, limit: PAGE })
      const items = Array.isArray(answer.items) ? answer.items : []
      rows.push(...items)
      if (items.length < PAGE) return rows
    }
    warnings.push(`${siteKey} has more than ${PAGE * PAGES_MAX} ${kind} rows; only the first were read`)
    return rows
  }

  const same = (/** @type {unknown} */ a, /** @type {string} */ b) =>
    String(a ?? '').toLowerCase() === b.toLowerCase()

  // ── Categories ────────────────────────────────────────────────────────────────────────────────
  const categories = await listAll('category')
  const content = categories.filter((c) => same(c.extension, 'com_content'))
  /** @param {string} alias @param {string} title */
  const categoryId = async (alias, title) => {
    const found = content.find((c) => same(c.alias, alias))
    if (found) return Number(found.id)
    const made = await call('content.update', {
      apply_id: applyId,
      kind: 'category',
      id: 0,
      fields: { title, extension: 'com_content', parent_id: 1, published: 1 }
    })
    const id = Number(made.id ?? 0)
    if (!Number.isInteger(id) || id <= 0) throw new Error(`the door made no category for ${alias}`)
    content.push({ id, alias, title, extension: 'com_content' })
    return id
  }
  // Pages go where a stock Joomla puts everything; posts get their own, made when missing.
  const pagesCat = content.find((c) => same(c.alias, 'uncategorised'))
    ? Number(content.find((c) => same(c.alias, 'uncategorised'))?.id)
    : await categoryId('uncategorised', 'Uncategorised')
  const blogCat = await categoryId('blog', 'Blog')

  // ── Articles ──────────────────────────────────────────────────────────────────────────────────
  const articles = await listAll('article')
  /**
   * Upsert one article by alias. An alias is the address a page is linked by, so it is written on
   * the CREATE only — renaming it on an update would break links somebody may already hold.
   * @param {string} alias @param {Record<string, unknown>} fields @param {number} catid
   */
  const upsertArticle = async (alias, fields, catid, language = '*') => {
    const found = articles.find((a) => same(a.alias, alias))
    const body = { ...fields, state: 1, catid }
    if (!found) {
      body.alias = alias
      body.language = language
      // `#__content` declares these NOT NULL with no default, so an insert that names none of them
      // is refused by the database itself — measured 08/09 on a real site as
      // "Field 'images' doesn't have a default value", which says nothing about the article it
      // refused. Filled here rather than in the door: they are empty values, not policy.
      for (const [column, empty] of Object.entries(ARTICLE_EMPTY))
        if (body[column] === undefined) body[column] = empty
    }
    const answer = await call('content.update', {
      apply_id: applyId,
      kind: 'article',
      id: found ? Number(found.id) : 0,
      fields: body
    })
    const id = Number(answer.id ?? found?.id ?? 0)
    if (!Number.isInteger(id) || id <= 0) throw new Error(`the door wrote ${alias} without an id`)
    if (!found) articles.push({ id, alias })
    return id
  }

  /** @type {Record<string, number>} */
  const pageIds = {}
  for (const page of plan.pages ?? []) {
    const slug = String(page.slug)
    if (!wanted(pages, slug)) {
      const found = articles.find((a) => same(a.alias, slug))
      if (found) pageIds[slug] = Number(found.id)
      continue
    }
    /** @type {Record<string, string>} */
    const attribs = { article_layout: `tpl_tracy:${page.kind}` }
    if (page.kind === 'artifact') attribs.tracy_artifact = String(page.artifact ?? 'landing')
    pageIds[slug] = await upsertArticle(
      slug,
      {
        title: String(page.title),
        introtext: '',
        fulltext: String(page.body),
        attribs: JSON.stringify(attribs)
      },
      pagesCat
    )
  }

  // ── Posts ─────────────────────────────────────────────────────────────────────────────────────
  /** @type {Record<string, number>} */
  const postIds = {}
  if (wanted(pages, 'posts') && Array.isArray(plan.posts)) {
    let i = 0
    for (const post of plan.posts) {
      const slug = String(post.slug)
      const paragraphs = Array.isArray(post.paragraphs) ? post.paragraphs.map(String) : []
      const lead = paragraphs[0] ?? ''
      const day = new Date(now - i * 86400000).toISOString().slice(0, 19).replace('T', ' ')

      // The cover first: a file the article's `images` column then names. On Joomla a media upload
      // is a FILE, not an attachment row — the article points at the path.
      let coverPath = ''
      const image = images.get(slug)
      if (image) {
        const ext = image.mime.includes('jpeg') ? 'jpg' : image.mime.includes('webp') ? 'webp' : 'png'
        const at = `images/tracy/${slug}.${ext}`
        try {
          await call('media.upload', {
            apply_id: applyId,
            path: at,
            content_b64: Buffer.from(image.bytes).toString('base64')
          })
          coverPath = at
        } catch (error) {
          warnings.push(`cover of ${slug}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      postIds[slug] = await upsertArticle(
        slug,
        {
          title: String(post.title),
          introtext: `<p>${escapeHtml(String(post.excerpt || lead))}</p>`,
          fulltext: paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join(''),
          // `created` is an authorship column the door does not write, so the ordering a reader
          // sees comes from publish_up. Named in the header rather than papered over.
          publish_up: day,
          images: JSON.stringify({
            image_intro: coverPath,
            image_intro_alt: coverPath === '' ? '' : String(post.title),
            image_fulltext: coverPath,
            image_fulltext_alt: coverPath === '' ? '' : String(post.title)
          }),
          metadata: JSON.stringify({ tracy_image_prompt: String(post.imagePrompt ?? ''), author })
        },
        blogCat
      )
      i++
    }
  }

  // ── Contact ───────────────────────────────────────────────────────────────────────────────────
  let contactId = 0
  if (plan.contact?.email) {
    const contactCat = categories.find((c) => same(c.extension, 'com_contact'))
    if (!contactCat) warnings.push('this site has no com_contact category, so the contact page has no form')
    else {
      const contacts = await listAll('contact')
      const name = String(plan.contact.name ?? 'Contact')
      const found = contacts.find((c) => same(c.name, name))
      const answer = await call('content.update', {
        apply_id: applyId,
        kind: 'contact',
        id: found ? Number(found.id) : 0,
        fields: {
          name,
          email_to: String(plan.contact.email),
          misc: String(plan.contact.lead ?? ''),
          published: 1,
          catid: Number(contactCat.id),
          language: '*',
          // `#__contact_details` declares these NOT NULL with no default, the way `#__content` does.
          // The alias is the address the contact is read at, so it is derived from the name.
          alias: contactAlias(name),
          access: 1,
          metadesc: '',
          metadata: '{}',
          params: '{}'
        }
      })
      contactId = Number(answer.id ?? found?.id ?? 0)
    }
  }

  // ── Menu ──────────────────────────────────────────────────────────────────────────────────────
  /** @type {Record<string, number>} */
  const menuIds = {}
  if (wanted(pages, 'menu')) {
    const items = (await listAll('menuItem')).filter((m) => same(m.menutype, 'mainmenu'))
    /**
     * Upsert one main-menu item by alias. `link` and `menutype` are create-time fields the door
     * will not let an update touch, so an item that exists keeps its link and only its title,
     * params and home flag are written.
     * @param {string} alias @param {string} title @param {string} link @param {boolean} home @param {Record<string, string>} params
     */
    const upsertMenuItem = async (alias, title, link, home, params = {}) => {
      const found = items.find((m) => same(m.alias, alias))
      /** @type {Record<string, unknown>} */
      const fields = { title, published: 1, params: JSON.stringify(params) }
      if (home) fields.home = 1
      if (!found) {
        fields.menutype = 'mainmenu'
        fields.link = link
        fields.type = 'component'
        fields.parent_id = 1
        fields.language = '*'
      } else if (!same(found.link, link)) {
        // The door writes no `link` on an update, and pointing an existing item somewhere new is
        // exactly the move that would silently not happen. Say it.
        warnings.push(`the menu item ${alias} already points at ${found.link} and was left there`)
      }
      const answer = await call('content.update', {
        apply_id: applyId,
        kind: 'menuItem',
        id: found ? Number(found.id) : 0,
        fields
      })
      const id = Number(answer.id ?? found?.id ?? 0)
      if (!found) items.push({ id, alias, link, menutype: 'mainmenu' })
      return id
    }

    for (const item of plan.menu ?? []) {
      const slug = String(item.slug)
      const label = String(item.label)
      if (slug === 'blog') {
        menuIds[slug] = await upsertMenuItem(
          'blog',
          label,
          `index.php?option=com_content&view=category&layout=blog&id=${blogCat}`,
          false,
          { num_leading_articles: '0', num_intro_articles: '6', num_columns: '3', show_page_heading: '0' }
        )
        continue
      }
      if (slug === 'contact' && contactId > 0) {
        menuIds[slug] = await upsertMenuItem(
          'contact',
          label,
          `index.php?option=com_contact&view=contact&id=${contactId}`,
          false,
          { show_email_form: '1', show_email: '1', show_page_heading: '0' }
        )
        continue
      }
      if (!pageIds[slug]) continue
      const link = `index.php?option=com_content&view=article&id=${pageIds[slug]}`
      if (slug !== 'home') {
        menuIds[slug] = await upsertMenuItem(slug, label, link, false)
        continue
      }
      // The home page is the one item that cannot be fixed in place. Joomla ships a Home item
      // pointing at its featured-article view, and the door writes no `link` on an update — so
      // pointing the stock item at the customer's landing page is impossible. A NEW item is made
      // instead, claims the home flag (which clears the old one), and the stock item is unpublished
      // so the menu does not show two Homes. The alias never appears in a URL: a home item's
      // address is the site root.
      const stock = items.find((m) => same(m.alias, 'home') && !same(m.link, link))
      // The alias is not ours to choose: `alias` is absent from the door's create columns because
      // Joomla's Menu table derives it from the TITLE. So the new item is created under a title
      // that folds to a free alias and then renamed — creating it as "Home" beside Joomla's own
      // Home is a duplicate-key refusal, measured 08/09 on a real site. The alias never shows: a
      // home item's address is the site root.
      const id = await upsertMenuItem(stock ? 'home-tracy' : 'home', stock ? 'Home Tracy' : label, link, true)
      menuIds[slug] = id
      if (stock) {
        await call('content.update', { apply_id: applyId, kind: 'menuItem', id, fields: { title: label } })
        await call('content.update', {
          apply_id: applyId,
          kind: 'menuItem',
          id: Number(stock.id),
          fields: { published: 0 }
        })
      }
    }

    // The navigation the reader actually clicks. A module's page assignment lives in
    // `#__modules_menu`, a table the content door does not reach — so a module is never CREATED
    // here: it would show on no page at all, which is worse than none. Joomla ships a menu module,
    // and it is MOVED to the position the Tracy template renders. `position` is a column the door
    // writes, and moving keeps the page assignment the stock module already has.
    const modules = await listAll('module')
    if (!modules.some((m) => same(m.module, 'mod_menu') && same(m.position, 'nav'))) {
      const menuModule = modules.find((m) => same(m.module, 'mod_menu'))
      if (!menuModule)
        warnings.push('this site has no menu module at all, so the pages are not linked from the header')
      else
        await call('content.update', {
          apply_id: applyId,
          kind: 'module',
          id: Number(menuModule.id),
          fields: {
            position: 'nav',
            published: 1,
            showtitle: 0,
            params: JSON.stringify({ menutype: 'mainmenu', layout: '_:default' })
          }
        })
    }
  }

  // ── The other languages ──────────────────────────────────────────────────────────────────────
  //
  // Joomla switches language BY MENU: the Language Filter plugin reads which menu the visitor is
  // in. So a second language is a second set of articles and a menu of its own — not the same
  // pages with a tag on them.
  //
  // What is NOT here, and cannot be until the component grows two kinds: the content languages
  // themselves (`#__languages`) and the associations that tie a page to its twin
  // (`#__associations`). Without the first, Joomla files these articles under a language it does
  // not know and they do not show. The build says so rather than pretending.
  if ((languages[0] ?? '') !== '' && translations.length > 0) {
    // The content languages themselves. Without these rows Joomla files every article below under
    // a language it does not know and shows them to nobody — so they are made FIRST, and a site
    // whose component is too old to know the kind says so instead of seeding into the dark.
    const known = await listAll('language').catch(() => [])
    for (const { lang } of translations) {
      const { tag } = joomlaTag(lang)
      if (known.some((l) => same(l.lang_code, tag))) continue
      try {
        await call('content.update', {
          apply_id: applyId,
          kind: 'language',
          id: 0,
          fields: { lang_code: tag, title: tag, title_native: tag, sef: lang, published: 1, access: 1 }
        })
      } catch (error) {
        warnings.push(
          `${tag} is not a language on this site yet (${error instanceof Error ? error.message : String(error)}), so its pages will not show`
        )
      }
    }
    // What Joomla needs to switch at all: the language pack for each tag, and the plugin that reads
    // which menu the visitor is in. Both are verbs the door has carried all along.
    for (const { lang } of translations) {
      const { tag } = joomlaTag(lang)
      const put = await apply({
        siteKey,
        action: 'extension.install',
        params: { url: `https://update.joomla.org/language/details5/${tag}_details.xml` }
      }).catch(() => ({ ok: false }))
      if (!put || put.ok === false) warnings.push(`the ${tag} language pack did not install`)
    }
    const filter = await apply({
      siteKey,
      action: 'extension.enable',
      params: { element: 'languagefilter', type: 'plugin', folder: 'system' }
    }).catch(() => ({ ok: false }))
    if (!filter || filter.ok === false)
      warnings.push('the language filter plugin is not on, so the site does not switch language yet')

    for (const { lang, plan: other } of translations) {
      const { tag, guessed } = joomlaTag(lang)
      if (guessed) warnings.push(`${lang} was filed as ${tag}; check it is the tag this Joomla knows`)
      /** @type {Record<string, number>} */
      const twinIds = {}
      for (const page of other.pages ?? []) {
        const slug = String(page.slug)
        if (!wanted(pages, slug)) continue
        /** @type {Record<string, string>} */
        const attribs = { article_layout: `tpl_tracy:${page.kind}` }
        if (page.kind === 'artifact') attribs.tracy_artifact = String(page.artifact ?? 'landing')
        twinIds[slug] = await upsertArticle(
          `${slug}-${lang}`,
          {
            title: String(page.title),
            introtext: '',
            fulltext: String(page.body),
            attribs: JSON.stringify(attribs)
          },
          pagesCat,
          tag
        )
      }
      // A menu of its own, so the Language Filter has something to switch INTO.
      const menutype = `mainmenu-${lang}`
      await call('content.update', {
        apply_id: applyId,
        kind: 'menutype',
        id: 0,
        fields: { menutype, title: `Main Menu (${tag})`, client_id: 0 }
      })
      for (const item of other.menu ?? []) {
        const slug = String(item.slug)
        const target = twinIds[slug]
        if (!target) continue
        await call('content.update', {
          apply_id: applyId,
          kind: 'menuItem',
          id: 0,
          fields: {
            menutype,
            title: String(item.label),
            alias: `${slug}-${lang}`,
            link: `index.php?option=com_content&view=article&id=${target}`,
            type: 'component',
            parent_id: 1,
            published: 1,
            language: tag
          }
        })
      }
    }
  }

  return { pages: pageIds, posts: postIds, menu: menuIds, contact: contactId, warnings }
}

/** @param {string} s */
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * The address part of a contact's URL, from what the customer called their business. Joomla's own
 * alias rules: lowercase, no punctuation, dashes between words — and never empty, because an empty
 * alias is a row the database refuses.
 * @param {string} name
 */
function contactAlias(name) {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '')
  return slug === '' ? 'contact' : slug
}
