/**
 * `door-measures.mjs` part E: where the places the build writes outside the JA ACM data print, and whether the CMS or
 * the template escapes them there (the questions of the write step after #597). Every page is made the way the
 * mapping file declares it (`pages.<page type>`: the menu item, its template style and params, the record base and
 * category, the address under the list page), each place holds its own probe (`door-measures-escapes-lib.mjs`), and
 * every page is read for every probe: page body, `<title>`, meta tags, Open Graph, breadcrumbs, menus, module output,
 * list pages and detail pages. Also: the detail position blocks (159, 191) on an article reached under its list page
 * and on its own menu item, two copies at a detail position under one list page, and module titles written with a
 * character reference or the literal character.
 */
import { pageFields } from './door-measures-lib.mjs'
import { FALLBACK_PAYLOADS, printsOf, probes, summary } from './door-measures-escapes-lib.mjs'
import { K } from './door-measures-lib.mjs'

const parse = (v) => (typeof v === 'string' && v.trim() ? JSON.parse(v) : (v ?? {}))
const COM_CONTACT = 7

export async function measureEscapes(ctx) {
  const { door, fact, mapping } = ctx
  const p = probes()
  const pages = mapping.pages
  const styleOf = (ref) => (ref === 0 ? 0 : ctx.contentMap.entities.find((e) => e.key === ref)?.sourceId)
  // Records the pages show. Each category title, record column and attribs key holds a probe of its own.
  const category = (extension, params, place) =>
    door.made('category', 0, {
      title: p.next(place).value,
      alias: ctx.alias('cat'),
      extension,
      published: 1,
      language: '*',
      access: 1,
      params: JSON.stringify(params ?? {})
    })
  const cats = {
    class: await category('com_content', pages.class.record.category.params, 'category.title (class)'),
    news: await category('com_content', pages['news-post'].record.category.params, 'category.title (news)'),
    learning: await category(
      'com_content',
      pages['learning-post'].record.category.params,
      'category.title (learning)'
    ),
    contact: await category('com_contact', {}, 'category.title (contact)')
  }
  const catOf = (type) => cats[{ 'news-post': 'news', 'learning-post': 'learning' }[type] ?? type]
  const fill = (link, ids) =>
    link
      .replace('{record}', ids.record ?? '')
      .replace(/\{category(?::([\w-]+))?\}/g, (_, t) => catOf(t ?? ids.type))
      .replace(/\{page:([\w-]+)\}/g, (_, t) => ids.pages?.[t])
  // A page of the main menu as the mapping file declares it, its title and SEO params probed.
  const seoProbes = {}
  const page = async (type, declared, ids = {}) => {
    const d = declared ?? pages[type].menuItem
    const params = { ...d.params }
    for (const key of ['page_title', 'menu-meta_description', 'og_title', 'og_desc', 'og_img'])
      params[key] = p.next(`menuItem.params.${key} (${type})`).value
    const title = p.next(`menuItem.title (${type})`).value
    const id = await door.made(
      'menuItem',
      0,
      pageFields(title, ctx.alias(type), styleOf(d.templateStyle), fill(d.link, { ...ids, type }), {
        params: JSON.stringify(params),
        component_id: d.link.includes('com_contact') ? COM_CONTACT : 19
      })
    )
    seoProbes[type] = id
    return id
  }
  const list = {
    classes: await page('classes'),
    news: await page('news'),
    learning: await page('learning-center'),
    featured: await page('featured-posts')
  }
  // Articles, from each page type's record base, every text place probed.
  const article = async (type, attribs, extra = {}) => {
    const base = pages[type].record.base
    const fields = {
      title: p.next(`article.title (${type})`).value,
      alias: ctx.alias('art'),
      catid: catOf(type),
      state: 1,
      language: '*',
      access: 1,
      metakey: 'zqmeasure, zqrelated',
      metadesc: p.next(`article.metadesc (${type})`).value,
      introtext: `<p>${p.next(`article.introtext (${type})`).value}</p>`,
      fulltext: `<p>${p.next(`article.fulltext (${type})`).value}</p>`,
      images: JSON.stringify({
        ...base.images,
        image_intro: p.next(`article.images.image_intro (${type})`).value,
        image_fulltext: p.next(`article.images.image_fulltext (${type})`).value
      }),
      ...(base.featured ? { featured: base.featured } : {}),
      attribs: JSON.stringify({
        ...base.attribs,
        og_title: p.next(`article.attribs.og_title (${type})`).value,
        og_desc: p.next(`article.attribs.og_desc (${type})`).value,
        article_page_title: p.next(`article.attribs.article_page_title (${type})`).value,
        og_img: p.next(`article.attribs.og_img (${type})`).value,
        ...attribs
      }),
      ...extra
    }
    return door.made('article', 0, fields)
  }
  const a = (key, type) => p.next(`article.attribs.${key} (${type})`).value
  const classAttribs = {
    'classes-title': a('classes-title', 'class'),
    'classes-type': a('classes-type', 'class'),
    'classes-video-thumb': a('classes-video-thumb', 'class'),
    'classes-video-lead': a('classes-video-lead', 'class'),
    'ft-title': a('ft-title', 'class'),
    'ft-desc': a('ft-desc', 'class'),
    'exer-title': a('exer-title', 'class'),
    'exer-desc': a('exer-desc', 'class'),
    'classes-info': {
      'classes-info0': {
        project_label: a('classes-info.project_label', 'class'),
        project_info: a('classes-info.project_info', 'class')
      }
    },
    'classes-features': {
      'classes-features0': {
        feature_img: a('classes-features.feature_img', 'class'),
        feature_img_light: a('classes-features.feature_img_light', 'class'),
        feature_title: a('classes-features.feature_title', 'class'),
        feature_desc: a('classes-features.feature_desc', 'class')
      }
    },
    'exer-features': {
      'exer-features0': {
        exer_img: a('exer-features.exer_img', 'class'),
        exer_video_id: a('exer-features.exer_video_id', 'class'),
        feature_title: a('exer-features.feature_title', 'class'),
        feature_desc: a('exer-features.feature_desc', 'class')
      }
    }
  }
  const records = {
    class: await article('class', classAttribs),
    classTwo: await article('class', {}, { title: 'Measure Class Two' }),
    news: await article('news-post', {}),
    newsTwo: await article('news-post', {}, { title: 'Measure Post Two' }),
    learning: await article('learning-post', {
      'learning-features': {
        'learning-features0': {
          learning_title: a('learning-features.learning_title', 'learning-post'),
          learning_link: a('learning-features.learning_link', 'learning-post'),
          learning_thumb: a('learning-features.learning_thumb', 'learning-post'),
          id_video: a('learning-features.id_video', 'learning-post')
        }
      }
    })
  }
  const contactBase = pages.contact.record.base
  records.contact = await door.made('contact', 0, {
    name: p.next('contact.name').value,
    alias: ctx.alias('contact'),
    catid: cats.contact,
    published: 1,
    language: '*',
    access: 1,
    address: p.next('contact.address').value,
    telephone: p.next('contact.telephone').value,
    email_to: `${p.next('contact.email_to').value}@example.com`,
    misc: `<p>${p.next('contact.misc').value}</p>`,
    params: JSON.stringify(contactBase.params ?? {}),
    metadata: JSON.stringify(contactBase.metadata ?? {}),
    metadesc: contactBase.metadesc ?? ''
  })
  list.contact = await page('contact', null, { record: records.contact })
  // The class article on a menu item of its own (ownItem), beside its address under the list page.
  const own = await page('class', pages.class.ownItem, { record: records.class })
  const under = (type, record, listPage) =>
    fill(pages[type].under.address, { record, pages: { [pages[type].under.page]: listPage }, type })
  const addresses = {
    home: ctx.pages.home,
    classes: list.classes,
    classUnder: under('class', records.class, list.classes),
    classTwoUnder: under('class', records.classTwo, list.classes),
    classOwnItem: own,
    news: list.news,
    newsUnder: under('news-post', records.news, list.news),
    newsTwoUnder: under('news-post', records.newsTwo, list.news),
    featured: list.featured,
    learning: list.learning,
    learningUnder: under('learning-post', records.learning, list.learning),
    contact: list.contact
  }
  // The home menu item's own SEO params (the featured view prints them while a featured article is published).
  const homeParams = {}
  for (const key of ['page_title', 'og_title', 'og_desc', 'menu-meta_description'])
    homeParams[key] = p.next(`menuItem.params.${key} (home)`).value
  await door.made('menuItem', ctx.pages.home, {
    params: JSON.stringify({ ...pages.home.menuItem.params, ...homeParams })
  })

  // Modules: copies of the detail position blocks with the kit's resets, two of 159 under one list page; the
  // breadcrumbs, a footer menu with a probed item, the masthead with probed defaults; module titles.
  const copy = async (store, edit, menuids) => {
    const record = await door.get('module', store)
    const fields = edit(K.copyFields(record), parse(record.params))
    const id = await door.made('module', 0, fields)
    await door.made('moduleAssignment', id, { menuids: JSON.stringify(menuids) })
    return id
  }
  const withParams = (f, params) => ({ ...f, params: JSON.stringify(params) })
  // Every `features-intro[info-*]` list of a JA ACM config gets a probe in its first item.
  const probeInfo = (config) => {
    const value = typeof config === 'string' ? JSON.parse(config) : config
    const visit = (v) => {
      if (!v || typeof v !== 'object') return
      for (const [k, x] of Object.entries(v)) {
        const key = k.match(/\[(info-[\w-]+)\]$/)?.[1]
        if (key && Array.isArray(x) && typeof x[0] === 'string')
          x[0] = p.next(`module.params.jatools-config.${key} (acm features-intro)`).value
        else visit(x)
      }
    }
    visit(value)
    return typeof config === 'string' ? JSON.stringify(value) : value
  }
  const modules = {
    c159: await copy(
      159,
      (f, pr) =>
        withParams(
          { ...f, title: 'Measure 159 One' },
          { ...pr, catid: [String(cats.class)], 'main-section': 'zqmone' }
        ),
      [list.classes]
    ),
    c159b: await copy(
      159,
      (f, pr) =>
        withParams(
          { ...f, title: 'Measure 159 Two' },
          { ...pr, catid: [String(cats.class)], 'main-section': 'zqmtwo' }
        ),
      [list.classes]
    ),
    c191: await copy(191, (f) => f, [list.news, list.learning]),
    breadcrumbs: await copy(
      17,
      (f) => ({ ...f, title: p.next('module.title (mod_breadcrumbs, aria-label)').value }),
      [0]
    ),
    footer: await copy(168, (f) => f, [0]),
    newsletter: await copy(
      169,
      (f, pr) =>
        withParams(f, {
          ...pr,
          introtext: `<h4>${p.next('module.params.introtext (mod_acym heading)').value}</h4><p>${p.next('module.params.introtext (mod_acym paragraph)').value}</p>`
        }),
      [0]
    ),
    mastheadRow: await copy(
      162,
      (f, pr) => {
        const rows = pr.menuitem_config
        rows.item_id[0] = String(list.news)
        rows.title[0] = p.next('module.params.menuitem_config.title (masthead row)').value
        rows.description[0] = p.next('module.params.menuitem_config.description (masthead row)').value
        return withParams(f, pr)
      },
      [list.news]
    ),
    masthead: await copy(
      162,
      (f, pr) =>
        withParams(f, {
          ...pr,
          'default-title': p.next('module.params.default-title (masthead)').value,
          'default-description': p.next('module.params.default-description (masthead)').value
        }),
      [list.contact]
    ),
    menu: await copy(
      174,
      (f) => ({ ...f, title: p.next('module.title (mod_menu, title shown)').value, showtitle: 1 }),
      [0]
    ),
    titleReference: await copy(
      174,
      (f) => ({ ...f, title: 'zqtitleref &#169; &copy 2026 one', showtitle: 1 }),
      [0]
    ),
    titleLiteral: await copy(174, (f) => ({ ...f, title: 'zqtitlelit \u00a9 two', showtitle: 1 }), [0]),
    // A plans container and a plan it holds: the plan title prints as the label of its tab.
    tabs: await copy(184, (f) => f, [0]),
    tabPlan: await copy(
      167,
      (f) => ({ ...f, title: p.next('module.title (tab label, acm container-tabs)').value }),
      [0]
    ),
    // The contact info block (acm features-intro): each info key of its first item probed.
    info: await copy(
      177,
      (f, pr) => withParams(f, { ...pr, 'jatools-config': probeInfo(pr['jatools-config']) }),
      [0]
    ),
    // The footer contact column (its title is the column heading) and the header button (mod_custom content).
    footerContact: await copy(
      175,
      (f) => ({ ...f, title: p.next('module.title (footer column heading)').value }),
      [0]
    ),
    headerButton: await copy(
      176,
      (f) => ({
        ...f,
        content: `<div><a href="${p.next('module.content (mod_custom link)').value}">${p.next('module.content (mod_custom text)').value}</a></div>`
      }),
      [0]
    )
  }
  await door.made(
    'menuItem',
    0,
    pageFields(
      p.next('menuItem.title (site-map menu item)').value,
      ctx.alias('map'),
      0,
      'index.php?option=com_content&view=featured',
      {
        menutype: 'site-map'
      }
    )
  )

  // The site name (site.identity) and the contract places: the custom field hint and the language strings.
  const sitename = p.next('globalConfiguration.sitename').value
  const identity = await door.call('site.identity', {
    operation: 'set',
    fields: { sitename },
    apply_id: door.applyId('identity')
  })
  const contract = {}
  const slotOf = (entity) => {
    for (const b of Object.values(mapping.blocks))
      for (const loc of Object.values(b.fields ?? {})) if (loc?.entity === entity && loc.slot) return loc.slot
    for (const list of Object.values(mapping.facts ?? {}))
      for (const loc of list ?? []) if (loc?.entity === entity && loc.slot) return loc.slot
    return null
  }
  const contractPlaces = [
    ['field-1', 'field.params.hint (field-1)'],
    ...Object.entries(mapping.entities)
      .filter(([, e]) => e.kind === 'siteSetting' && (e.identity?.key ?? '').startsWith('site_logo'))
      .map(([k, e]) => [k, `siteSetting.value (${e.identity.key})`]),
    ...Object.entries(mapping.entities)
      .filter(([, e]) => e.kind === 'languageString')
      .map(([k, e]) => [k, `languageString.value (${e.identity.key})`])
  ]
  for (const [entity, place] of contractPlaces) {
    const slot = slotOf(entity)
    if (!slot) continue
    const tryWrite = async (value) => {
      const state = await ctx.inspect()
      return door.call('content.contract', {
        operation: 'apply',
        apply_id: door.applyId('contract-escape'),
        request_id: door.applyId('req'),
        expected_revision: state.revision,
        changes: { [slot]: value },
        evidence: { [slot]: 'invented: an escaping probe' }
      })
    }
    // The full probe first, then payloads with fewer special characters, until the door writes one.
    const tries = []
    for (const [name, body] of FALLBACK_PAYLOADS) {
      const probe = p.next(`${place} (${name})`, body)
      const answer = await tryWrite(probe.value)
      tries.push({
        payload: name,
        written: answer.ok === true,
        ...(answer.ok ? {} : { error: `${answer.error}: ${answer.message}` })
      })
      if (answer.ok) break
    }
    contract[place] = { slot, tries }
  }

  // What each record holds after the writes (a write may change a value).
  const stored = new Map()
  const keep = (value) => {
    for (const m of String(value ?? '').matchAll(/zqs([a-z]+)0[\s\S]*?zqe\1(0)?/g))
      stored.set(m[1], new Set([...(stored.get(m[1]) ?? []), m[0]]))
  }
  // A JSON column (attribs, images, params, metadata) is read as the values it holds.
  const walk = (v) => {
    if (typeof v === 'string') {
      if (/^\s*[[{]/.test(v)) {
        try {
          return walk(JSON.parse(v))
        } catch {}
      }
      return keep(v)
    }
    if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  for (const id of Object.values(cats)) walk(await door.get('category', id))
  for (const [k, id] of Object.entries(records))
    walk(await door.get(k === 'contact' ? 'contact' : 'article', id))
  for (const id of [...Object.values(list), own, ctx.pages.home]) {
    const item = await door.get('menuItem', id)
    walk(item)
  }
  for (const id of Object.values(modules)) {
    const m = await door.get('module', id)
    walk(m)
  }
  for (const s of (await ctx.inspect()).slots ?? []) keep(s.current)
  const identityRead = await door.call('site.identity', { operation: 'read', fields: ['sitename'] })
  walk(identityRead.fields ?? {})

  // Every page read for every probe.
  const html = {}
  for (const [name, at] of Object.entries(addresses)) {
    const r = await ctx.html(at)
    html[name] = r
  }
  const placesOut = []
  for (const [id, { place, value }] of p.made) {
    const held = [...(stored.get(id) ?? [])]
    const asWritten = held.includes(value)
    const prints = {}
    const segments = new Set()
    for (const [name, r] of Object.entries(html)) {
      const found = printsOf(r.html, id, asWritten ? value : (held[0] ?? value))
      if (found.length) prints[name] = summary(found)
      for (const f of found)
        if (f.form === 'other' || f.form === 'cut') segments.add(`${f.context}: ${f.segment}`)
    }
    placesOut.push({
      place,
      probe: id,
      asWritten,
      held: asWritten ? undefined : held,
      prints,
      otherSegments: [...segments]
    })
  }
  for (const entry of placesOut) fact(`E1 ${entry.place}`, entry)
  fact('E1 contract places', { contract, identity: { ok: identity.ok, error: identity.error ?? null } })

  // E2. The detail positions: which addresses print the copies of 159 and 191, and the layout of each.
  const shape = (r) => ({
    status: r.status,
    bodyLayout: r.html.match(/class="[^"]*\b(layout-[a-z0-9-]+)/)?.[1] ?? null,
    classesDetail: r.html.includes('view-classes-detail'),
    sections: [...r.html.matchAll(/id="t4-([a-z0-9-]+)"/g)].map((m) => m[1]),
    copies: Object.fromEntries(
      ['c159', 'c159b', 'c191'].map((k) => [
        k,
        K.moduleHtml(r.html, modules[k]) === null
          ? null
          : K.visibleText(K.moduleHtml(r.html, modules[k])).slice(0, 160)
      ])
    ),
    breadcrumbs: K.visibleText(K.moduleHtml(r.html, modules.breadcrumbs) ?? '').slice(0, 200),
    activeMenu:
      r.html
        .match(/class="[^"]*\b(current|active)\b[^"]*"[^>]*>\s*<a[^>]*>([^<]*)/)?.[2]
        ?.trim()
        .slice(0, 80) ?? null
  })
  fact('E2 detail positions by address', {
    modules,
    addresses: Object.fromEntries(Object.entries(html).map(([k, r]) => [k, shape(r)]))
  })
  // E3. Module titles written with a character reference or the literal character, as the front prints them.
  const front = html.home.html
  fact('E3 module titles on the front', {
    reference: K.visibleText(K.moduleHtml(front, modules.titleReference) ?? '').slice(0, 80),
    referenceSource: (front.match(/zqtitleref[^<]*/) ?? [null])[0],
    literal: K.visibleText(K.moduleHtml(front, modules.titleLiteral) ?? '').slice(0, 80),
    literalSource: (front.match(/zqtitlelit[^<]*/) ?? [null])[0],
    storedReference: (await door.get('module', modules.titleReference))?.title,
    storedLiteral: (await door.get('module', modules.titleLiteral))?.title,
    administrator: await adminModuleList(ctx.base, 'zqtitle')
  })
  Object.assign(ctx, { escapes: { addresses, modules, records, cats, list } })
}

/**
 * The administrator's module list for a search, as its HTML shows each matching title: only when
 * TRACY_ADMIN_USER and TRACY_ADMIN_PASSWORD name an administrator of the throwaway site (else `not read`).
 */
async function adminModuleList(base, search) {
  const user = process.env.TRACY_ADMIN_USER
  const password = process.env.TRACY_ADMIN_PASSWORD
  if (!user || !password) return 'not read: TRACY_ADMIN_USER and TRACY_ADMIN_PASSWORD are not set'
  const admin = `${base}/administrator/index.php`
  const cookies = new Map()
  const send = async (url, init = {}) => {
    const response = await fetch(url, {
      ...init,
      redirect: 'manual',
      headers: { ...init.headers, cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') }
    })
    for (const line of response.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';')
      const at = pair.indexOf('=')
      cookies.set(pair.slice(0, at), pair.slice(at + 1))
    }
    return response.text()
  }
  const form = await send(admin)
  const token = form.match(/name="([0-9a-f]{32})" value="1"/)?.[1]
  if (!token) return 'not read: no login form token'
  const body = new URLSearchParams({
    username: user,
    passwd: password,
    option: 'com_login',
    task: 'login',
    [token]: '1'
  })
  await send(admin, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded' }
  })
  const list = await send(
    `${admin}?option=com_modules&view=modules&client_id=0&filter[search]=${search}&list[limit]=50`
  )
  return [...new Set(list.match(new RegExp(`${search}[a-z]+[^<"]{0,40}`, 'g')) ?? [])]
}
