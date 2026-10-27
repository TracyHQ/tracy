/**
 * An OPEN Joomla site (no bound contract) as the replace tests and the handler test reach it: the
 * component's rows in the shapes claude-cowork `joomla/cowork` answers them — `content.list` with each
 * kind's summary columns (`JoomlaSiteWriter::LIST_COLUMNS`, an article's routed `url`), `include_body`
 * pages of 25 that merge the whole row in, `content.get` whole rows, `content.update` writing only a
 * kind's whitelisted columns and logging the whole row it replaced under the call's apply_id, and
 * `apply.revert` putting those rows back (`Engine.php` `contentUpdate` / `applyRevert`) — and the pages
 * Joomla 5's Cassiopeia renders FROM THOSE ROWS, so a page and the records behind it never disagree and
 * a page read after a write shows what was written.
 *
 * The site: two languages (en-GB under /en/, fr-FR under /fr/), a menu per language, a custom footer
 * module per language and an English sidebar module, a breadcrumb module with its own home text, the
 * default template style's brand, a category blog, an unpublished draft and an administrator module
 * (neither of which a visitor ever sees).
 */

import { readFileSync } from 'node:fs'

/** The component's columns per kind (`JoomlaSiteWriter::MAP`): what `content.update` may write. */
export const WRITABLE = Object.freeze({
  article: [
    'title',
    'alias',
    'introtext',
    'fulltext',
    'state',
    'catid',
    'images',
    'urls',
    'attribs',
    'metadata',
    'metakey',
    'metadesc',
    'language',
    'featured',
    'ordering',
    'access',
    'publish_up',
    'publish_down',
    'note'
  ],
  category: [
    'title',
    'note',
    'description',
    'published',
    'access',
    'language',
    'params',
    'metadesc',
    'metakey'
  ],
  menuItem: ['title', 'note', 'published', 'params', 'home', 'language', 'template_style_id', 'link'],
  module: [
    'title',
    'note',
    'content',
    'position',
    'module',
    'access',
    'showtitle',
    'params',
    'published',
    'language',
    'ordering'
  ],
  templateStyle: ['title', 'params', 'home', 'template'],
  contact: [
    'name',
    'alias',
    'con_position',
    'address',
    'suburb',
    'country',
    'postcode',
    'telephone',
    'fax',
    'misc',
    'email_to',
    'mobile',
    'webpage',
    'published',
    'catid',
    'access',
    'ordering',
    'params',
    'language',
    'metadesc',
    'metakey',
    'metadata',
    'featured',
    'publish_up',
    'publish_down'
  ],
  language: [
    'lang_code',
    'title',
    'title_native',
    'sef',
    'image',
    'description',
    'metakey',
    'metadesc',
    'sitename',
    'published',
    'access',
    'ordering'
  ]
})

/** The summary columns of a list without bodies (`JoomlaSiteWriter::LIST_COLUMNS`). */
const LIST_COLUMNS = Object.freeze({
  article: [
    'id',
    'title',
    'alias',
    'catid',
    'state',
    'language',
    'created',
    'modified',
    'created_by',
    'created_by_alias',
    'featured',
    'images',
    'metadesc',
    'metakey',
    'access',
    'publish_up',
    'publish_down'
  ],
  category: ['id', 'title', 'alias', 'path', 'parent_id', 'level', 'extension', 'published', 'language'],
  menuItem: [
    'id',
    'menutype',
    'title',
    'note',
    'alias',
    'path',
    'link',
    'type',
    'published',
    'parent_id',
    'level',
    'language',
    'client_id'
  ],
  module: ['id', 'title', 'note', 'position', 'module', 'published', 'language'],
  templateStyle: ['id', 'title', 'template', 'home'],
  contact: ['id', 'name', 'alias', 'con_position', 'email_to', 'published', 'catid', 'language'],
  language: ['lang_id', 'lang_code', 'title', 'published', 'sef']
})

const ORIGIN = 'http://acme.test'
/** Numbers as the MySQL driver answers them: strings. */
const s = (/** @type {number} */ n) => String(n)

/** @param {Record<string, any>} a */
const article = (a) => ({
  asset_id: '0',
  alias: '',
  fulltext: '',
  state: '1',
  catid: '2',
  created: '2026-03-01 09:00:00',
  modified: '2026-03-01 09:00:00',
  created_by: '42',
  created_by_alias: '',
  featured: '0',
  images: '{}',
  urls: '{}',
  attribs: '{}',
  metadata: '{}',
  metakey: '',
  metadesc: '',
  access: '1',
  publish_up: '2026-03-01 09:00:00',
  publish_down: null,
  note: '',
  ...a
})

/** @param {Record<string, any>} m */
const module = (m) => ({
  note: '',
  content: '',
  access: '1',
  showtitle: '0',
  params: '{"layout":"_:default","moduleclass_sfx":"","cache":"1"}',
  published: '1',
  language: '*',
  client_id: '0',
  ordering: '1',
  ...m
})

/** @param {Record<string, any>} i */
const item = (i) => ({
  note: '',
  type: 'component',
  published: '1',
  parent_id: '1',
  level: '1',
  client_id: '0',
  home: '0',
  template_style_id: '0',
  params: '{"show_page_heading":"0","page_heading":"","page_title":""}',
  ...i
})

/** Every row of the site, keyed by kind, and each article's route (what Joomla's router answers). */
export const SITE = Object.freeze({
  article: [
    article({
      id: s(1),
      title: 'Welcome to Acme Works',
      alias: 'welcome',
      featured: '1',
      language: 'en-GB',
      introtext:
        '<p>We clean factories, warehouses and offices across the region.</p>\r\n<p>Call our hotline: <a href="tel:+84909123456">0909 123 456</a></p>'
    }),
    article({
      id: s(2),
      title: 'About us',
      alias: 'about-us',
      language: 'en-GB',
      introtext:
        '<p>Acme Works was founded in 1998 by two engineers.</p>\r\n<h2>Our team<br><em>and our values</em></h2>\r\n<p>We answer within one working day.</p>'
    }),
    article({
      id: s(3),
      title: 'Contact',
      alias: 'contact',
      language: 'en-GB',
      introtext:
        '<p>Write to <a href="mailto:hello@acme.test">hello@acme.test</a> or call <a href="tel:+84909123456">0909 123 456</a>.</p>\r\n<p>Office hours: Mon&ndash;Fri, 8:00&ndash;17:00</p>'
    }),
    article({
      id: s(5),
      title: 'Spring cleaning offer',
      alias: 'spring-cleaning-offer',
      catid: '8',
      language: 'en-GB',
      introtext: '<p>Twenty percent off every deep clean booked before May.</p>',
      fulltext: '<p>The offer covers offices up to 500&nbsp;m².</p>'
    }),
    article({
      id: s(11),
      title: 'Bienvenue chez Acme Works',
      alias: 'bienvenue',
      featured: '1',
      language: 'fr-FR',
      introtext:
        '<p>Nous nettoyons usines, entrepôts et bureaux dans toute la région.</p>\r\n<p>Appelez notre assistance : <a href="tel:+84909123456">0909 123 456</a></p>'
    }),
    article({
      id: s(13),
      title: 'Contact',
      alias: 'contact',
      language: 'fr-FR',
      introtext:
        '<p>Écrivez à <a href="mailto:hello@acme.test">hello@acme.test</a> ou appelez le 0909 123 456.</p>'
    }),
    // Unpublished: no visitor sees it, and no replace may write it.
    article({
      id: s(20),
      title: 'Old draft',
      alias: 'old-draft',
      state: '0',
      language: 'en-GB',
      introtext: '<p>Call 0909 123 456 for last year’s offer.</p>'
    })
  ],
  route: {
    1: '/en/',
    2: '/en/about',
    3: '/en/contact',
    5: '/en/news/spring-cleaning-offer',
    11: '/fr/',
    13: '/fr/contact',
    20: null
  },
  category: [
    {
      id: s(2),
      title: 'Uncategorised',
      alias: 'uncategorised',
      path: 'uncategorised',
      parent_id: '1',
      level: '1',
      extension: 'com_content',
      published: '1',
      language: '*',
      description: '',
      params: '{}',
      note: '',
      access: '1',
      metadesc: '',
      metakey: ''
    },
    {
      id: s(8),
      title: 'News',
      alias: 'news',
      path: 'news',
      parent_id: '1',
      level: '1',
      extension: 'com_content',
      published: '1',
      language: 'en-GB',
      description: '<p>What we are up to this season.</p>',
      params: '{}',
      note: '',
      access: '1',
      metadesc: '',
      metakey: ''
    }
  ],
  contact: [
    {
      id: s(1),
      name: 'Acme Works head office',
      alias: 'head-office',
      con_position: 'Reception',
      address: '12 Harbour Road',
      suburb: 'Da Nang',
      state: '',
      country: 'Vietnam',
      postcode: '550000',
      telephone: '0236 555 0100',
      mobile: '',
      fax: '',
      misc: '<p>Visitors sign in at the gate.</p>',
      email_to: 'office@acme.test',
      webpage: '',
      published: '1',
      catid: '4',
      access: '1',
      ordering: '1',
      params: '{}',
      language: '*',
      metadesc: '',
      metakey: '',
      metadata: '{}',
      featured: '0',
      publish_up: null,
      publish_down: null
    }
  ],
  menuItem: [
    item({
      id: s(105),
      menutype: 'hiddenmenu',
      title: 'Our office',
      alias: 'our-office',
      path: 'our-office',
      link: 'index.php?option=com_contact&view=contact&id=1',
      language: 'en-GB'
    }),
    item({
      id: s(101),
      menutype: 'mainmenu-en',
      title: 'Home',
      alias: 'home',
      path: 'home',
      link: 'index.php?option=com_content&view=article&id=1',
      language: 'en-GB',
      home: '1'
    }),
    item({
      id: s(102),
      menutype: 'mainmenu-en',
      title: 'About us',
      alias: 'about',
      path: 'about',
      link: 'index.php?option=com_content&view=article&id=2',
      language: 'en-GB',
      params: '{"show_page_heading":"1","page_heading":"Who we are","page_title":""}'
    }),
    item({
      id: s(103),
      menutype: 'mainmenu-en',
      title: 'Contact',
      alias: 'contact',
      path: 'contact',
      link: 'index.php?option=com_content&view=article&id=3',
      language: 'en-GB'
    }),
    item({
      id: s(104),
      menutype: 'mainmenu-en',
      title: 'News',
      alias: 'news',
      path: 'news',
      link: 'index.php?option=com_content&view=category&layout=blog&id=8',
      language: 'en-GB'
    }),
    item({
      id: s(201),
      menutype: 'mainmenu-fr',
      title: 'Accueil',
      alias: 'accueil',
      path: 'accueil',
      link: 'index.php?option=com_content&view=article&id=11',
      language: 'fr-FR',
      home: '1'
    }),
    item({
      id: s(203),
      menutype: 'mainmenu-fr',
      title: 'Contact',
      alias: 'contact',
      path: 'contact',
      link: 'index.php?option=com_content&view=article&id=13',
      language: 'fr-FR'
    })
  ],
  module: [
    module({
      id: s(90),
      title: 'Footer (en)',
      position: 'footer',
      module: 'mod_custom',
      language: 'en-GB',
      content:
        '<p>Hotline: <a href="tel:+84909123456">0909 123 456</a> · <a href="mailto:hello@acme.test">hello@acme.test</a></p>\r\n<p>&copy; 2026 Acme Works. All rights reserved.</p>'
    }),
    module({
      id: s(91),
      title: 'Opening hours',
      position: 'sidebar-right',
      module: 'mod_custom',
      language: 'en-GB',
      showtitle: '1',
      content: '<p>Mon&ndash;Fri, 8:00&ndash;17:00</p>'
    }),
    module({
      id: s(92),
      title: 'Pied de page (fr)',
      position: 'footer',
      module: 'mod_custom',
      language: 'fr-FR',
      content:
        '<p>Assistance : <a href="tel:+84909123456">0909 123 456</a> · hello@acme.test</p>\r\n<p>&copy; 2026 Acme Works. Tous droits réservés.</p>'
    }),
    module({
      id: s(93),
      title: 'Main Menu (en)',
      position: 'menu',
      module: 'mod_menu',
      language: 'en-GB',
      params: '{"menutype":"mainmenu-en","startLevel":"1","endLevel":"0","layout":"_:default"}'
    }),
    module({
      id: s(94),
      title: 'Menu principal (fr)',
      position: 'menu',
      module: 'mod_menu',
      language: 'fr-FR',
      params: '{"menutype":"mainmenu-fr","startLevel":"1","endLevel":"0","layout":"_:default"}'
    }),
    module({
      id: s(95),
      title: 'Breadcrumbs',
      position: 'breadcrumbs',
      module: 'mod_breadcrumbs',
      params:
        '{"showHere":"1","showHome":"1","homeText":"Start","showLast":"1","separator":"","layout":"_:default"}'
    }),
    module({ id: s(96), title: 'Languages', position: 'menu', module: 'mod_languages' }),
    // Two custom modules whose template prints NO id around them (JoomlArt's T4 topbar, a bare sidebar):
    // one in a position that names a region, one in a position that is the default `main`.
    module({
      id: s(98),
      title: 'Topbar',
      position: 'topbar',
      module: 'mod_custom',
      language: 'en-GB',
      content: '<p>Free shipping on every order over 50 USD.</p>'
    }),
    module({
      id: s(99),
      title: 'Sidebar note',
      position: 'sidebar-left',
      module: 'mod_custom',
      language: 'en-GB',
      content: '<p>Words of a bare sidebar module nobody can place.</p>'
    }),
    // An administrator module: it prints nothing on a page, whatever its title.
    module({
      id: s(97),
      title: 'Opening hours',
      position: 'cpanel',
      module: 'mod_logged',
      client_id: '1',
      showtitle: '1'
    })
  ],
  templateStyle: [
    {
      id: s(11),
      title: 'Cassiopeia - Default',
      template: 'cassiopeia',
      home: '1',
      client_id: '0',
      params:
        '{"brand":"1","logoFile":"","siteTitle":"Acme Works","siteDescription":"Industrial cleaning since 1998 \\u2013 Hanoi","useFontScheme":"0","colorName":"colors_standard","fluidContainer":"0","stickyHeader":0,"backTop":0}'
    },
    {
      id: s(12),
      title: 'Atum - Default',
      template: 'atum',
      home: '1',
      client_id: '1',
      params: '{"hue":"hsl(214, 63%, 20%)"}'
    }
  ],
  language: [
    {
      lang_id: s(1),
      lang_code: 'en-GB',
      title: 'English (en-GB)',
      title_native: 'English (United Kingdom)',
      sef: 'en',
      image: 'en_gb',
      description: '',
      metakey: '',
      metadesc: '',
      sitename: '',
      published: '1',
      access: '1',
      ordering: '1'
    },
    {
      lang_id: s(2),
      lang_code: 'fr-FR',
      title: 'French (fr-FR)',
      title_native: 'Français (France)',
      sef: 'fr',
      image: 'fr_fr',
      description: '',
      metakey: '',
      metadesc: '',
      sitename: '',
      published: '1',
      access: '1',
      ordering: '2'
    }
  ]
})

const KINDS = [
  'article',
  'category',
  'tag',
  'field',
  'menuItem',
  'menutype',
  'redirect',
  'banner',
  'bannerClient',
  'contact',
  'newsfeed',
  'language',
  'articleAssociation',
  'menuAssociation',
  'moduleAssignment',
  'languageFilter',
  'module',
  'templateStyle',
  'user',
  'extensionParams'
]

/** The primary key column of a kind. @param {string} kind */
const pkOf = (kind) => (kind === 'language' ? 'lang_id' : 'id')

/** Text as Joomla's `htmlspecialchars` prints it. @param {string} t */
const esc = (t) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * A JoomlArt ACM hero module (`mod_ja_acm`, T4 template ja_mood) as the dev site leemood held it on
 * 03/10/2026 (module 93): its words live in `params` → `jatools-config`, a JSON text inside the JSON, each
 * field a list (`hero-style[hero-heading]: ["…"]`). Added to the site only when a test asks (`acm`).
 */
export const ACM_HERO = Object.freeze(
  module({
    id: s(154),
    title: 'Watch Overview',
    position: 'masthead-1',
    module: 'mod_ja_acm',
    params: JSON.parse(readFileSync(new URL('../joomla-acm/leemood-hero-93.json', import.meta.url), 'utf8'))
      .stored
  })
)

/**
 * A site whose DEFAULT template style is a home layout (`homeLayout`): the T4 "Home" style prints the
 * home page's modules and no component, the "Inner" style prints the article; each page's menu item
 * names the one it wears.
 */
export const HOME_LAYOUT = Object.freeze({
  styles: [
    { id: s(13), title: 'T4 — Home', template: 't4', home: '1', client_id: '0', params: '{"layout":"home"}' },
    {
      id: s(14),
      title: 'T4 — Inner',
      template: 't4',
      home: '0',
      client_id: '0',
      params: '{"layout":"default"}'
    }
  ],
  worn: { 101: '13', 102: '14', 103: '14', 201: '13', 203: '14' }
})

/**
 * The component as the relay reaches it. `script(action, params, n)` answers first when it returns
 * anything but undefined.
 * @param {{ script?: (action: string, params: Record<string, any>, n: number) => unknown,
 *   contact?: Record<string, any>, acm?: boolean, homeLayout?: boolean }} [options] - `contact`: columns of
 *   contact 1 that differ (the hotline it shares with the footer, a mobile…); `acm`: the site also holds
 *   {@link ACM_HERO}, which the English home page prints in its masthead; `homeLayout`: the site's DEFAULT
 *   template style is a home layout that prints no component (tracy-base j6's "Tracy — base · Home",
 *   dskeepjo 10/10/2026), and its article pages wear an inner style of their own ({@link HOME_LAYOUT}).
 */
export function component({ script, contact, acm = false, homeLayout = false } = {}) {
  /** @type {Record<string, Map<number, Record<string, any>>>} */
  const db = {}
  for (const kind of ['article', 'category', 'menuItem', 'module', 'templateStyle', 'language', 'contact'])
    db[kind] = new Map(
      /** @type {Record<string, any>[]} */ (/** @type {any} */ (SITE)[kind]).map((r) => [
        Number(r[pkOf(kind)]),
        structuredClone(r)
      ])
    )
  if (contact) Object.assign(/** @type {Record<string, any>} */ (db.contact.get(1)), contact)
  if (homeLayout) {
    const cassiopeia = /** @type {Record<string, any>} */ (db.templateStyle.get(11))
    cassiopeia.home = '0'
    for (const style of HOME_LAYOUT.styles) db.templateStyle.set(Number(style.id), structuredClone(style))
    for (const [id, style] of Object.entries(HOME_LAYOUT.worn)) {
      const row = /** @type {Record<string, any>} */ (db.menuItem.get(Number(id)))
      row.template_style_id = style
    }
  }
  if (acm) db.module.set(Number(ACM_HERO.id), structuredClone(ACM_HERO))
  /** @type {[string, Record<string, any>][]} */
  const calls = []
  /**
   * @type {Map<string, { kind: string, id: number, before: Record<string, any> | null, order?: number[] }[]>}
   *   `before: null`: a row this apply created (its undo deletes it); `order`: a move's previous order.
   */
  const log = new Map()
  /** The ids rows this component creates take, past every id the site holds. */
  let made = 3000
  const err = (/** @type {string} */ code, /** @type {string} */ message) => ({
    ok: false,
    error: code,
    message
  })
  /** @param {string} kind @param {Record<string, any>} row */
  const summary = (kind, row) => {
    /** @type {Record<string, any>} */
    const out = {}
    for (const c of /** @type {any} */ (LIST_COLUMNS)[kind]) out[c] = row[c]
    if (kind === 'article') {
      const route = /** @type {any} */ (SITE.route)[Number(row.id)]
      out.category_title = db.category.get(Number(row.catid))?.title ?? null
      out.url = route ? `${ORIGIN}${route}` : null
    }
    out.id = row[pkOf(kind)]
    return out
  }
  /**
   * @param {string} action
   * @param {Record<string, any>} params
   */
  const door = async (action, params) => {
    calls.push([action, structuredClone(params)])
    const scripted = script?.(action, params, calls.length)
    if (scripted !== undefined) return scripted
    const kind = typeof params.kind === 'string' ? params.kind : 'article'
    if (action === 'content.list') {
      if (!KINDS.includes(kind)) return err('bad_params', `kind must be one of: ${KINDS.join(', ')}`)
      const table = db[kind]
      if (!table) return { ok: true, kind, offset: 0, items: [] }
      const offset = Math.max(0, Number(params.offset ?? 0))
      const body = Boolean(params.include_body)
      const limit = Math.min(body ? 25 : 200, Math.max(1, Number(params.limit ?? (body ? 25 : 100))))
      const rows = [...table.values()].sort((a, b) => Number(a[pkOf(kind)]) - Number(b[pkOf(kind)]))
      const page = rows.slice(offset, offset + limit)
      return {
        ok: true,
        kind,
        offset,
        items: page.map((r) => (body ? { ...structuredClone(r), ...summary(kind, r) } : summary(kind, r)))
      }
    }
    if (action === 'content.get') {
      if (!KINDS.includes(kind)) return err('bad_params', `kind must be one of: ${KINDS.join(', ')}`)
      const id = Math.max(0, Number(params.id ?? 0))
      if (id === 0) return err('bad_params', 'id required')
      const row = db[kind]?.get(id)
      if (!row) return err('not_found', `no ${kind} with id ${id}`)
      return { ok: true, kind, id, item: structuredClone(row) }
    }
    if (action === 'content.update') {
      if (typeof params.apply_id !== 'string' || params.apply_id.trim() === '')
        return err('bad_params', 'apply_id required')
      if (!KINDS.includes(kind) || !params.kind)
        return err('bad_params', `kind must be one of: ${KINDS.join(', ')}`)
      const id = Math.max(0, Number(params.id ?? 0))
      const f = params.fields ?? {}
      // id 0 INSERTS (`Engine.php` contentUpdate): an article with every column the table has no
      // default for, a menu item as `createNested` makes it (title, menutype and link required).
      if (id === 0 && (kind === 'article' || kind === 'menuItem')) {
        const newId = (made += 1)
        if (kind === 'article') {
          if (!('introtext' in f))
            return err('write_failed', "Field 'introtext' doesn't have a default value")
          db.article.set(
            newId,
            article({
              id: s(newId),
              title: String(f.title ?? ''),
              alias: String(f.alias ?? ''),
              catid: s(Number(f.catid ?? 2)),
              state: s(Number(f.state ?? 0)),
              language: String(f.language ?? '*'),
              introtext: String(f.introtext),
              fulltext: String(f.fulltext ?? '')
            })
          )
        } else {
          for (const need of ['title', 'menutype', 'link'])
            if (String(f[need] ?? '').trim() === '')
              return err('write_failed', `creating a menuItem needs ${need}`)
          db.menuItem.set(
            newId,
            item({
              id: s(newId),
              menutype: String(f.menutype),
              title: String(f.title),
              alias: String(f.alias ?? f.title),
              path: String(f.alias ?? f.title),
              link: String(f.link),
              type: String(f.type ?? 'url'),
              published: s(Number(f.published ?? 1)),
              parent_id: s(Number(f.parent_id ?? 1)),
              language: String(f.language ?? '*'),
              template_style_id: s(Number(f.template_style_id ?? 0))
            })
          )
        }
        log.set(params.apply_id, [...(log.get(params.apply_id) ?? []), { kind, id: newId, before: null }])
        const row = db[kind].get(newId)
        return {
          ok: true,
          kind,
          id: newId,
          created: true,
          stored:
            kind === 'menuItem'
              ? { title: row.title, alias: row.alias, path: row.path, published: 1, menutype: row.menutype }
              : { title: row.title, alias: row.alias, state: Number(row.state), catid: Number(row.catid) }
        }
      }
      // move_after on an existing menu item re-hangs it after that sibling (`JoomlaSiteWriter::move`).
      if (id > 0 && kind === 'menuItem' && 'move_after' in f) {
        const after = Number(f.move_after)
        if (!db.menuItem.has(id) || !db.menuItem.has(after)) return err('write_failed', 'no such menu item')
        const order = [...db.menuItem.keys()]
        const rest = order.filter((k) => k !== id)
        rest.splice(rest.indexOf(after) + 1, 0, id)
        const rows = new Map(db.menuItem)
        db.menuItem.clear()
        for (const k of rest) db.menuItem.set(k, /** @type {any} */ (rows.get(k)))
        log.set(params.apply_id, [...(log.get(params.apply_id) ?? []), { kind, id, before: null, order }])
        return { ok: true, kind, id, created: false, moved: true }
      }
      const row = db[kind]?.get(id)
      if (!row) return err('write_failed', 'target does not exist in this scope')
      const allowed = /** @type {any} */ (WRITABLE)[kind] ?? []
      const fields = Object.entries(params.fields ?? {}).filter(([k]) => allowed.includes(k))
      if (fields.length === 0) return err('write_failed', `no writable column for kind ${kind}`)
      const before = structuredClone(row)
      for (const [k, v] of fields) row[k] = v
      log.set(params.apply_id, [...(log.get(params.apply_id) ?? []), { kind, id, before }])
      return { ok: true, kind, id, created: false }
    }
    if (action === 'apply.revert') {
      const entries = log.get(params.apply_id) ?? []
      for (const e of [...entries].reverse()) {
        if (e.order) {
          const rows = new Map(db[e.kind])
          db[e.kind].clear()
          for (const k of e.order) if (rows.has(k)) db[e.kind].set(k, rows.get(k))
          continue
        }
        if (e.before === null) {
          db[e.kind].delete(e.id)
          continue
        }
        const row = db[e.kind].get(e.id)
        if (!row) continue
        for (const k of /** @type {any} */ (WRITABLE)[e.kind]) if (k in e.before) row[k] = e.before[k]
      }
      log.delete(params.apply_id)
      return { ok: true, reverted: entries.length }
    }
    if (action === 'apply.list') {
      const entries = log.get(params.apply_id) ?? []
      return {
        ok: true,
        apply_id: params.apply_id,
        steps: entries.map((e) => ({ op: 'content', kind: e.kind, id: e.id, created: false }))
      }
    }
    return err('bad_action', `unknown action: ${action}`)
  }
  const writes = () => calls.filter(([a]) => a === 'content.update').map(([, p]) => p)
  /** @param {string} path */
  const pageHtml = async (path) => {
    const html = renderPage(db, path)
    return html === null
      ? { ok: true, status: 404, html: '<html><body><p>Not found</p></body></html>' }
      : { ok: true, status: 200, html }
  }
  return { door, calls, db, writes, pageHtml, log }
}

/**
 * One page as Cassiopeia (Joomla 5) prints it from the rows: `itemid-N` on the body, `item-N` on each
 * menu `<li>`, `mod-custom<id>` around a custom module's words, the sidebar's card chrome with its
 * title and no id, the brand from the template style's params, the breadcrumb's home text from its
 * module's params. Null for a path the site has no page at.
 * @param {Record<string, Map<number, Record<string, any>>>} db
 * @param {string} path
 * @returns {string | null}
 */
export function renderPage(db, path) {
  const p = path.endsWith('/') || path === '' ? path : path
  const routes =
    /** @type {Record<string, { item: number, sef: 'en' | 'fr', article?: number, category?: number, contact?: number }>} */ ({
      '/en/': { item: 101, sef: 'en', article: 1 },
      '/en/about': { item: 102, sef: 'en', article: 2 },
      '/en/contact': { item: 103, sef: 'en', article: 3 },
      '/en/news': { item: 104, sef: 'en', category: 8 },
      '/en/our-office': { item: 105, sef: 'en', contact: 1 },
      '/fr/': { item: 201, sef: 'fr', article: 11 },
      '/fr/contact': { item: 203, sef: 'fr', article: 13 }
    })
  // A page a menu item routes to by its path (an item created after the site was seeded).
  const routed = () => {
    for (const r of db.menuItem.values()) {
      const sef = r.language === 'fr-FR' ? 'fr' : r.language === 'en-GB' ? 'en' : null
      const article = /view=article&id=(\d+)/.exec(String(r.link))?.[1]
      if (sef && article && r.published === '1' && `/${sef}/${r.path}` === p)
        return { item: Number(r.id), sef, article: Number(article) }
    }
    return undefined
  }
  const route = routes[p] ?? /** @type {any} */ (routed())
  if (!route) return null
  const lang = route.sef === 'en' ? 'en-GB' : 'fr-FR'
  // A menu not placed in a module (`hiddenmenu`) opens pages and prints no list.
  const menu = [...db.menuItem.values()].filter(
    (r) => r.language === lang && r.published === '1' && r.menutype !== 'hiddenmenu'
  )
  const own = db.menuItem.get(route.item)
  const ownParams = JSON.parse(own?.params ?? '{}')
  // The style the page wears: its menu item's, else the site's default one. A home layout prints no component.
  const worn =
    db.templateStyle.get(Number(own?.template_style_id ?? 0)) ??
    [...db.templateStyle.values()].find((t) => t.home === '1' && t.client_id === '0')
  const printsComponent = JSON.parse(worn?.params ?? '{}').layout !== 'home'
  const style = JSON.parse(db.templateStyle.get(11)?.params ?? '{}')
  const crumbs = JSON.parse(db.module.get(95)?.params ?? '{}')
  const custom = (/** @type {number} */ id) => {
    const m = db.module.get(id)
    return m && m.published === '1'
      ? `<div id="mod-custom${id}" class="mod-custom custom">\n${m.content}</div>`
      : ''
  }
  const hrefOf = (/** @type {Record<string, any>} */ r) =>
    r.home === '1' ? `/${route.sef}/` : `/${route.sef}/${r.path}`
  const nav = menu
    .map((r) => {
      const current = Number(r.id) === route.item ? ' current active' : ''
      const aria = current ? ' aria-current="page"' : ''
      return `<li class="nav-item item-${r.id}${r.home === '1' ? ' default' : ''}${current}"><a href="${hrefOf(r)}"${aria}>${esc(r.title)}</a></li>`
    })
    .join('')
  const docTitle = ownParams.page_title || own?.title || ''
  const pageHeading = ownParams.show_page_heading === '1'
  let component = ''
  if (route.article) {
    const a = db.article.get(route.article)
    const text = a.fulltext ? `${a.introtext} ${a.fulltext}` : a.introtext
    const tag = pageHeading ? 'h2' : 'h1'
    component = `<div class="com-content-article item-page" itemscope itemtype="https://schema.org/Article">
<meta itemprop="inLanguage" content="${lang}">
${pageHeading ? `<div class="page-header"><h1>${esc(ownParams.page_heading || own.title)}</h1></div>\n` : ''}<div class="page-header"><${tag} itemprop="headline">${esc(a.title)}</${tag}></div>
<dl class="article-info text-muted"><dt class="article-info-term">Details</dt><dd class="published"><time datetime="2026-03-01T09:00:00+00:00" itemprop="datePublished">Published: 01 March 2026</time></dd></dl>
<div itemprop="articleBody" class="com-content-article__body">
${text}</div>
</div>`
  } else if (route.contact) {
    // com_contact's contact view (Joomla 5 default layout): the name as the heading, then each detail.
    const c = db.contact.get(route.contact)
    const line = (/** @type {string} */ cls, /** @type {string} */ v) =>
      v ? `<dd><span class="contact-${cls}">${esc(v)}</span></dd>` : ''
    component = `<div class="com-contact contact" itemscope itemtype="https://schema.org/Person">
<div class="page-header"><h1><span class="contact-name" itemprop="name">${esc(c.name)}</span></h1></div>
<dl class="com-contact__position contact-position dl-horizontal">${line('position', c.con_position)}</dl>
<dl class="com-contact__address contact-address dl-horizontal">${line('street', c.address)}${line('suburb', c.suburb)}${line('postcode', c.postcode)}${line('country', c.country)}${line('telephone', c.telephone)}${line('mobile', c.mobile)}${c.email_to ? `<dd><span class="contact-emailto"><a href="mailto:${c.email_to}">${esc(c.email_to)}</a></span></dd>` : ''}</dl>
<div class="com-contact__miscinfo contact-miscinfo">${c.misc}</div>
</div>`
  } else if (route.category) {
    const c = db.category.get(route.category)
    const items = [...db.article.values()].filter(
      (a) => Number(a.catid) === route.category && a.state === '1'
    )
    component = `<div class="com-content-category-blog blog" itemscope itemtype="https://schema.org/Blog">
<h2><span class="subheading-category">${esc(c.title)}</span></h2>
<div class="category-desc clearfix">${c.description}</div>
<div class="com-content-category-blog__items blog-items">
${items
  .map((a) => {
    const href = /** @type {any} */ (SITE.route)[Number(a.id)]
    return `<div class="com-content-category-blog__item blog-item" itemprop="blogPost" itemscope itemtype="https://schema.org/BlogPosting"><div class="item-content">
<div class="page-header"><h2 itemprop="name"><a href="${href}" itemprop="url">${esc(a.title)}</a></h2></div>
${a.introtext}
<p class="readmore"><a class="btn btn-secondary" href="${href}" aria-label="Read more: ${esc(a.title)}">Read more &hellip;</a></p>
</div></div>`
  })
  .join('\n')}
</div>
</div>`
  }
  if (!printsComponent) component = ''
  const crumbItems = [
    `<li class="mod-breadcrumbs__here float-start">You are here: &#160;</li>`,
    `<li class="mod-breadcrumbs__item breadcrumb-item"><a href="/${route.sef}/" class="pathway"><span>${esc(crumbs.homeText || 'Home')}</span></a></li>`,
    ...(own?.home === '1'
      ? []
      : [
          `<li class="mod-breadcrumbs__item breadcrumb-item active"><span>${esc(own?.title ?? '')}</span></li>`
        ])
  ]
  // `mod_ja_acm` renders its layout by the config's `:type`; without one it prints nothing (leemood, 03/10/2026).
  const acmHero = () => {
    const m = db.module.get(154)
    if (route.sef !== 'en' || !route.article || route.article !== 1 || m?.published !== '1') return ''
    const config = JSON.parse(JSON.parse(m.params)['jatools-config'])
    if (config[':type'] !== 'ja_mood:hero') return ''
    const h = config.hero
    return `<div id="Mod154" class="t4-module module mod-nopadding mod-nobg"><div class="module-inner"><div class="module-ct">
<div class="acm-hero style-1 ${esc(h['hero-style[hero-style]'][0])}"><div class="container"><div class="hero-content">
<h1 class="hero-heading">${esc(h['hero-style[hero-heading]'][0])}</h1>
<div class="hero-intro">${esc(h['hero-style[hero-intro]'][0])}</div>
<a class="btn btn-play" href="${esc(h['hero-style[hero-link]'][0])}" data-action="${esc(h['hero-style[hero-action]'][0])}"><span class="${esc(h['hero-style[hero-icon]'][0])}"></span>${esc(h['hero-style[hero-text]'][0])}</a>
</div></div></div>
</div></div></div>\n`
  }
  const sidebar =
    route.sef === 'en' && db.module.get(91)?.published === '1'
      ? `<div class="grid-child container-sidebar-right"><div class="sidebar-right card "><h3 class="card-header ">${esc(db.module.get(91).title)}</h3><div class="card-body">
${custom(91)}
</div></div></div>`
      : ''
  return `<!DOCTYPE html>
<html lang="${lang.toLowerCase()}" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="generator" content="Joomla! - Open Source Content Management">
<title>${esc(docTitle)}</title>
<link href="${ORIGIN}/en/" rel="alternate" hreflang="en-GB">
<link href="${ORIGIN}/fr/" rel="alternate" hreflang="fr-FR">
<link href="/media/templates/site/cassiopeia/css/template.min.css?5a1b2c" rel="stylesheet">
</head>
<body class="site ${route.contact ? 'com_contact' : 'com_content'} wrapper-static view-${route.article ? 'article' : route.contact ? 'contact' : 'category'} no-layout no-task itemid-${route.item}">
${
  route.sef === 'en' && db.module.get(98)?.published === '1'
    ? `<div id="t4-topbar" class="t4-section t4-topbar"><div class="custom">\n${db.module.get(98).content}</div></div>\n`
    : ''
}<header class="header container-header full-width">
<div class="grid-child">
<div class="navbar-brand">
<a class="brand-logo" href="/${route.sef}/"><span title="Acme Works Ltd">${esc(style.siteTitle ?? '')}</span></a>
<div class="site-description">${esc(style.siteDescription ?? '')}</div>
</div>
</div>
<div class="grid-child container-nav">
<ul class="mod-menu mod-list nav ">${nav}</ul>
<div class="mod-languages"><ul class="lang-inline" dir="ltr">
<li${route.sef === 'en' ? ' class="lang-active"' : ''}><a href="/en/">English (United Kingdom)</a></li>
<li${route.sef === 'fr' ? ' class="lang-active"' : ''}><a href="/fr/">Français (France)</a></li>
</ul></div>
</div>
</header>
${acmHero()}<div class="site-grid">
${
  route.sef === 'en' && db.module.get(99)?.published === '1'
    ? `<aside class="container-sidebar-left"><div class="custom">\n${db.module.get(99).content}</div></aside>\n`
    : ''
}<div class="grid-child container-component">
<nav class="mod-breadcrumbs__wrapper" aria-label="Breadcrumbs"><ol class="mod-breadcrumbs breadcrumb px-3 py-2">${crumbItems.join('')}</ol></nav>
<div id="system-message-container" aria-live="polite"></div>
<main>
${component}
</main>
</div>
${sidebar}
</div>
<footer class="container-footer footer full-width">
<div class="grid-child">
${custom(route.sef === 'en' ? 90 : 92)}
</div>
</footer>
</body>
</html>`
}
