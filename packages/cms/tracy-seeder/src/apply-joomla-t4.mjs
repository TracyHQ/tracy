/** Reconcile a T4 quickstart through Cowork's transactional content door. */
import { createHash } from 'node:crypto'
import { packFor } from './language-catalog.mjs'
import { normaliseLocale } from './locales.mjs'
import { contentHtml, homeContent, rewriteLinks, sectionModule } from './t4-content.mjs'

const TAGS = { en: 'en-GB', fr: 'fr-FR', vi: 'vi-VN', de: 'de-DE', es: 'es-ES' }
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const parse = (value) => (typeof value === 'string' ? JSON.parse(value || '{}') : (value ?? {}))
const escape = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** @param {{ plan: any, site?: any, apply: Function, siteKey: string, applyId: string,
 * languages?: string[], translations?: any[], images?: Map<string, any>, pages?: string[] }} input */
export async function applyJoomlaT4(input) {
  const { plan, site = {}, apply, siteKey, applyId } = input
  const call = async (action, params = {}) => {
    const result = await apply({ siteKey, action, params })
    if (!result?.ok) throw new Error(result?.message || result?.error || `${action} failed`)
    return result
  }
  const list = async (kind) => {
    const rows = []
    for (let offset = 0; offset < 10000; offset += 25) {
      const result = await call('content.list', { kind, offset, limit: 25, include_body: true })
      rows.push(...result.items)
      if (result.items.length < 25) return rows
    }
    throw new Error(`Too many ${kind} rows to reconcile safely`)
  }
  let revision = ''
  const batch = async (operations) => {
    if (!operations.length) return {}
    const result = await call('content.batch', {
      apply_id: applyId,
      request_id: digest(operations),
      operations
    })
    revision = result.revision
    return result.ids
  }
  const update = async (kind, row, fields, key = 'row') => {
    const changed = Object.fromEntries(
      Object.entries(fields).filter(([name, value]) => !row || String(row[name] ?? '') !== String(value))
    )
    if (row && !Object.keys(changed).length) return Number(row.id ?? row.lang_id)
    const expected = row
      ? Object.fromEntries(
          Object.keys(changed)
            .filter((name) => name in row)
            .map((name) => [name, row[name]])
        )
      : undefined
    const previousHomes =
      kind === 'menuItem' && Number(fields.home) === 1
        ? menu.filter(
            (other) =>
              other.id !== row?.id &&
              Number(other.home) === 1 &&
              other.language === (fields.language ?? row?.language ?? '*')
          )
        : []
    // Journal the displaced home in the same transaction. The Table writer's automatic
    // home switch otherwise changes a second row whose previous state is absent from undo.
    const operations = previousHomes.map((other) => ({
      kind: 'menuItem',
      id: Number(other.id),
      expected: { home: other.home, language: other.language },
      fields: { home: 0 }
    }))
    operations.push({
      key,
      kind,
      id: Number(row?.id ?? row?.lang_id ?? 0),
      fields: changed,
      ...(expected ? { expected } : {})
    })
    const ids = await batch(operations)
    for (const other of previousHomes) other.home = 0
    if (row) Object.assign(row, changed)
    return Number(ids[key])
  }
  const [styles, modules, menu, articles, categories, menuTypes] = await Promise.all([
    list('templateStyle'),
    list('module'),
    list('menuItem'),
    list('article'),
    list('category'),
    list('menutype')
  ])
  const homeStyle = styles.find(
    (row) => String(row.home) === '1' && ['tracy', 'tracy_airbnb'].includes(row.template)
  )
  if (!homeStyle) throw new Error('This site has no active Tracy T4 quickstart style')
  const template = homeStyle.template
  const innerStyle =
    styles.find((row) => row.template === template && parse(row.params)['typelist-layout'] === 'default') ??
    homeStyle
  const heroSource = modules.find(
    (row) => row.module === 'mod_ja_acm' && row.position === 'masthead' && row.title.includes('Home - Hero')
  )
  if (!heroSource) throw new Error('The quickstart hero schema is missing')
  const category = categories.find((row) => row.extension === 'com_content' && String(row.published) === '1')
  if (!category) throw new Error('The site has no published article category')
  const languages = input.languages?.length ? input.languages : ['en']
  const editions = [{ lang: languages[0], plan }, ...(input.translations ?? [])]
  for (const lang of languages)
    if (!editions.some((item) => item.lang === lang))
      throw new Error(`Missing translated content for ${lang}`)
  const selected = new Set(input.pages ?? ['all'])
  const all = selected.has('all')
  for (const edition of editions) {
    const slugs = (edition.plan.pages ?? []).map((page) => page.slug)
    if (!slugs.includes('home') || new Set(slugs).size !== slugs.length)
      throw new Error(`The ${edition.lang} edition needs unique pages and a home page`)
  }
  // Resolve every prerequisite before changing the customer's content.
  const inventory = await call('core.manifest')
  if (!String(inventory.manifest?.platformVersion).startsWith('6.'))
    throw new Error('This T4 recipe requires Joomla 6')
  for (const lang of languages) {
    if (lang === 'en') continue
    // The reviewed catalog is the only source of a pack; this legacy writer gets it through the
    // same door as the contract path so the two can never pin different bytes.
    const pack = packFor(normaliseLocale(lang), 6)
    if (!pack) continue
    if (
      !inventory.manifest.extensions.some(
        (row) => row.type === 'language' && row.element === pack.tag && row.enabled
      )
    ) {
      await call('extension.install', { url: pack.url, sha256: pack.sha256, bytes: pack.bytes })
    }
  }
  const multilingual = editions.length > 1
  if (
    !all &&
    multilingual &&
    menu.some((row) => row.note?.startsWith('tracy-build:home:') && row.language === '*')
  )
    throw new Error('Adding a language requires reconciling the complete site')
  const contentLanguages = multilingual ? await list('language') : []
  const pageIds = {},
    menuIds = {},
    menuNames = {},
    routes = [],
    postIds = {}
  const associations = new Map()
  const managedMenus = new Set()
  if (multilingual && all) {
    // A former single-language home becomes language-specific below. Joomla still needs
    // a neutral home: restore the base's own home before changing that row's language.
    const neutral = menu.find(
      (row) => row.menutype === 'tracy' && row.alias === 'home' && row.language === '*'
    )
    if (!neutral) throw new Error('The quickstart neutral home is missing')
  }
  for (const edition of editions) {
    const lang = edition.lang
    const tag = multilingual ? TAGS[lang] : '*'
    if (!tag) throw new Error(`No verified Joomla language mapping for ${lang}`)
    if (
      multilingual &&
      !contentLanguages.some((row) => row.lang_code === tag && Number(row.published) === 1)
    ) {
      const row = contentLanguages.find((item) => item.lang_code === tag)
      await update('language', row, {
        lang_code: tag,
        title: tag,
        title_native: lang === 'fr' ? 'Français' : 'English',
        sef: lang,
        image: lang === 'en' ? 'en_gb' : lang,
        published: 1,
        access: 1,
        description: '',
        metakey: '',
        metadesc: '',
        sitename: ''
      })
    }
    const menutype = `tracy-build-${lang}`
    menuNames[tag] = menutype
    if (!menuTypes.some((row) => row.menutype === menutype)) {
      await update('menutype', null, { menutype, title: `Website (${lang})`, description: '', client_id: 0 })
      menuTypes.push({ menutype })
    }
    let homeId = 0
    const editionPages = [...(edition.plan.pages ?? [])]
    const blogLinks = []
    for (const post of all || selected.has('posts') || selected.has('blog')
      ? (edition.plan.posts ?? [])
      : []) {
      const alias = `tracy-build-post-${post.slug}-${lang}`
      const found = articles.find((row) => row.alias === alias)
      let imageFields = {}
      const cover = input.images?.get(post.slug)
      if (cover) {
        const ext = cover.mime.includes('jpeg') ? 'jpg' : cover.mime.includes('webp') ? 'webp' : 'png'
        const file = `images/tracy/${post.slug}.${ext}`
        await call('media.upload', {
          apply_id: applyId,
          path: file,
          content_b64: Buffer.from(cover.bytes).toString('base64')
        })
        imageFields = {
          images: JSON.stringify({
            image_intro: file,
            image_intro_alt: post.title,
            image_fulltext: file,
            image_fulltext_alt: post.title
          })
        }
      }
      const postId = await update('article', found, {
        title: post.title,
        ...(found ? {} : { alias }),
        introtext: `<p>${escape(post.excerpt)}</p>`,
        fulltext: (post.paragraphs ?? []).map((p) => `<p>${escape(p)}</p>`).join(''),
        catid: Number(category.id),
        state: 1,
        language: tag,
        access: 1,
        ...imageFields
      })
      postIds[`${post.slug}:${lang}`] = postId
      const postKey = `post:${post.slug}`
      if (!associations.has(postKey)) associations.set(postKey, { articles: [], menus: [] })
      associations.get(postKey).articles.push(postId)
      blogLinks.push(
        `<li><a href="index.php?option=com_content&amp;view=article&amp;id=${postId}${multilingual ? `&amp;lang=${lang}` : ''}">${escape(post.title)}</a></li>`
      )
    }
    if (blogLinks.length) {
      const blog = {
        slug: 'blog',
        title: lang === 'fr' ? 'Actualités' : 'Blog',
        body: `<ul>${blogLinks.join('')}</ul>`
      }
      const at = editionPages.findIndex((page) => page.slug === 'blog')
      if (at < 0) editionPages.push(blog)
      else editionPages[at] = blog
    }
    const editionMenu = edition.plan.menu ?? []
    // Every managed page has a stable alias. Retrying after a lost reply finds the same row.
    for (const page of editionPages) {
      const slug = String(page.slug)
      const alias = `tracy-build-${slug}-${lang}`
      const article = articles.find((row) => row.alias === alias)
      const chosen = all || selected.has(slug) || (slug === 'blog' && selected.has('posts'))
      if (!chosen) {
        const existingMenu = menu.find((row) => row.note === `tracy-build:${slug}:${lang}`)
        if (!article || !existingMenu)
          throw new Error(`Seed the complete site before revising ${[...selected].join(', ')}`)
        pageIds[`${slug}:${lang}`] = Number(article.id)
        menuIds[`${slug}:${lang}`] = Number(existingMenu.id)
        if (slug === 'home') homeId = Number(existingMenu.id)
        continue
      }
      const body = slug === 'home' ? '' : contentHtml(page.body)
      const articleId = await update('article', article, {
        title: page.title,
        ...(article ? {} : { alias }),
        introtext: '',
        fulltext: body,
        catid: Number(category.id),
        state: 1,
        language: tag,
        access: 1,
        attribs: JSON.stringify({ show_title: slug === 'home' ? 0 : 1 })
      })
      if (!article) articles.push({ id: articleId, alias, fulltext: body })
      pageIds[`${slug}:${lang}`] = articleId
      const label = editionMenu.find((item) => item.slug === slug)?.label ?? page.title
      const note = `tracy-build:${slug}:${lang}`
      let menuRow = menu.find((row) => row.note === note)
      // The original neutral home is retained as Joomla's required '*' home and hidden by
      // Language Filter after language homes exist. Its demo content is disabled below.
      const fields = {
        title: label,
        note,
        published: 1,
        language: tag,
        home: slug === 'home' ? 1 : 0,
        template_style_id: Number(slug === 'home' ? homeStyle.id : innerStyle.id),
        params: JSON.stringify({ show_page_heading: 0 }),
        link: `index.php?option=com_content&view=article&id=${articleId}`
      }
      if (!menuRow)
        Object.assign(fields, {
          menutype,
          alias: `tracy-build-${slug}-${lang}`,
          type: 'component',
          parent_id: 1
        })
      const menuId = await update('menuItem', menuRow, fields)
      if (!menuRow) {
        menuRow = { id: menuId, ...fields }
        menu.push(menuRow)
      }
      managedMenus.add(menuId)
      menuIds[`${slug}:${lang}`] = menuId
      if (slug === 'home') homeId = menuId
      if (!associations.has(slug)) associations.set(slug, { articles: [], menus: [] })
      associations.get(slug).articles.push(articleId)
      associations.get(slug).menus.push(menuId)
      routes.push({ language: lang, menuId, title: page.title })
    }
    if (!homeId) throw new Error(`The ${lang} edition needs a home page`)
    for (const page of editionPages) {
      if (
        page.slug === 'home' ||
        (!all && !selected.has(page.slug) && !(page.slug === 'blog' && selected.has('posts')))
      )
        continue
      const row = articles.find((item) => Number(item.id) === pageIds[`${page.slug}:${lang}`])
      await update('article', row, { fulltext: rewriteLinks(contentHtml(page.body), menuIds, lang) })
    }
    const homePage = editionPages.find((page) => page.slug === 'home')
    const home = homeContent(homePage?.body)
    const cfg = parse(heroSource.params)
    const acm = parse(cfg['jatools-config'])
    acm[':type'] = `${template}:hero`
    const hero = acm.hero
    const title = home.title || homePage?.title || site.name
    const lead = home.lead || (lang === languages[0] ? site.about : '')
    Object.assign(hero, {
      'tracy-seeded': true,
      eyebrow: escape(site.name || homePage.title),
      title: escape(title),
      lead: escape(lead),
      'btn-1-text': menuIds[`contact:${lang}`] ? (lang === 'fr' ? 'Nous rendre visite' : 'Visit us') : '',
      'btn-1-link': menuIds[`contact:${lang}`] ? `index.php?Itemid=${menuIds[`contact:${lang}`]}` : '',
      'btn-2-text': '',
      'btn-2-link': '',
      'aside-label': '',
      'aside-badge': '',
      notes: { 'notes[note]': [], rows: 0, cols: 1, type: 'list' }
    })
    if (home.action?.href) {
      const link = rewriteLinks(
        `<a href="${escape(home.action.href)}">${escape(home.action.text)}</a>`,
        menuIds,
        lang
      )
      const href = /href="([^"]*)"/.exec(link)?.[1]?.replace(/&amp;/g, '&')
      if (href) {
        hero['btn-1-text'] = home.action.text
        hero['btn-1-link'] = href
      }
    }
    cfg['jatools-config'] = JSON.stringify(acm)
    const heroNote = `tracy-build:hero:${lang}`
    const heroRow = modules.find((row) => row.note === heroNote)
    if (!all && !selected.has('home')) continue
    const heroId = await update('module', heroRow, {
      title: `${site.name || homePage.title} — ${lang}`,
      note: heroNote,
      module: 'mod_ja_acm',
      position: 'masthead',
      content: '',
      published: 1,
      showtitle: 0,
      access: 1,
      language: tag,
      params: JSON.stringify(cfg)
    })
    const assignment = await call('content.get', { kind: 'moduleAssignment', id: heroId })
    await update(
      'moduleAssignment',
      { id: heroId, ...(assignment.item ?? assignment.fields) },
      { menuids: JSON.stringify([homeId]) }
    )
    const sectionNotes = new Set()
    for (const [index, section] of home.sections.entries()) {
      const note = `tracy-build:section:${lang}:${section.key}`
      sectionNotes.add(note)
      const moduleId = await update(
        'module',
        modules.find((row) => row.note === note),
        {
          title: `${site.name || homePage.title} — ${section.key} (${lang})`,
          note,
          module: 'mod_custom',
          // The base and both design packs expose section-1 on their Home layout. Keeping all
          // sections here preserves arbitrary section counts without editing a layout file.
          position: 'section-1',
          ordering: index + 1,
          content: sectionModule(rewriteLinks(section.html, menuIds, lang)),
          published: 1,
          showtitle: 0,
          access: 1,
          language: tag,
          params: JSON.stringify({ prepare_content: 0, cache: 0, moduleclass_sfx: '' })
        }
      )
      await batch([{ kind: 'moduleAssignment', id: moduleId, fields: { menuids: JSON.stringify([homeId]) } }])
    }
    for (const row of modules.filter(
      (row) =>
        row.note?.startsWith(`tracy-build:section:${lang}:`) &&
        !sectionNotes.has(row.note) &&
        Number(row.published) === 1
    ))
      await update('module', row, { published: 0 })
    const navNote = `tracy-build:nav:${lang}`
    const navRow = modules.find((row) => row.note === navNote)
    const navId = await update('module', navRow, {
      title: `Navigation (${lang})`,
      note: navNote,
      module: 'mod_menu',
      content: '',
      position: 'off-canvas',
      published: 1,
      showtitle: 0,
      access: 1,
      language: tag,
      params: JSON.stringify({ menutype, startLevel: 1, endLevel: 0, showAllChildren: 1, cache: 0 })
    })
    await batch([{ kind: 'moduleAssignment', id: navId, fields: { menuids: '[0]' } }])
  }
  if (multilingual && all) {
    const neutral = menu.find(
      (row) => row.menutype === 'tracy' && row.alias === 'home' && row.language === '*'
    )
    if (Number(neutral.home) !== 1) await update('menuItem', neutral, { home: 1, published: 1 })
  }
  // Only the quickstart's identifiable demo modules and menu are retired. The customer's
  // unrelated extensions, modules and menus are outside this ownership set.
  const demoOps = modules
    .filter((row) => all && /^\[Tracy (Apple|Airbnb)\]/.test(row.title) && Number(row.published) === 1)
    .map((row) => ({
      kind: 'module',
      id: Number(row.id),
      expected: { published: row.published },
      fields: { published: 0 }
    }))
  const baseMenu = menu.filter(
    (row) => all && row.menutype === 'tracy' && Number(row.published) === 1 && Number(row.home) !== 1
  )
  demoOps.push(...baseMenu.map((row) => ({ kind: 'menuItem', id: Number(row.id), fields: { published: 0 } })))
  if (all) {
    for (const row of menu.filter(
      (row) =>
        row.note?.startsWith('tracy-build:') &&
        !managedMenus.has(Number(row.id)) &&
        Number(row.published) === 1
    ))
      demoOps.push({
        kind: 'menuItem',
        id: Number(row.id),
        expected: { published: row.published },
        fields: { published: 0, home: 0 }
      })
    const activeArticles = new Set([...Object.values(pageIds), ...Object.values(postIds)])
    for (const row of articles.filter(
      (row) =>
        row.alias?.startsWith('tracy-build-') &&
        !activeArticles.has(Number(row.id)) &&
        Number(row.state) === 1
    ))
      demoOps.push({
        kind: 'article',
        id: Number(row.id),
        expected: { state: row.state },
        fields: { state: 0 }
      })
  }
  for (let i = 0; i < demoOps.length; i += 80) await batch(demoOps.slice(i, i + 80))
  for (const style of styles.filter((row) => all && row.template === template)) {
    const params = {
      ...parse(style.params),
      tracy_business_name: site.name || plan.pages[0].title,
      tracy_menu_types: menuNames
    }
    await update('templateStyle', style, { params: JSON.stringify(params) })
  }
  if (multilingual) {
    const operations = []
    for (const pair of associations.values()) {
      if (pair.articles.length > 1)
        operations.push({
          kind: 'articleAssociation',
          id: pair.articles[0],
          fields: { ids: JSON.stringify(pair.articles) }
        })
      if (pair.menus.length > 1)
        operations.push({
          kind: 'menuAssociation',
          id: pair.menus[0],
          fields: { ids: JSON.stringify(pair.menus) }
        })
    }
    const filters = await list('languageFilter')
    if (!filters[0]) throw new Error('Joomla Language Filter is missing')
    const filter = filters[0]
    operations.push({
      kind: 'languageFilter',
      id: Number(filter.id),
      fields: {
        enabled: 1,
        params: JSON.stringify({
          ...parse(filter.params),
          item_associations: 1,
          remove_default_prefix: 0,
          detect_browser: 0
        })
      }
    })
    await batch(operations)
    const switcher = modules.find((row) => row.note === 'tracy-build:languages')
    const switchId = await update('module', switcher, {
      title: 'Languages',
      note: 'tracy-build:languages',
      module: 'mod_languages',
      position: 'header-r',
      content: '',
      published: 1,
      showtitle: 0,
      language: '*',
      access: 1,
      params: JSON.stringify({
        header_text: '',
        footer_text: '',
        dropdown: 0,
        image: 0,
        inline: 1,
        full_name: 0,
        active: 1,
        cache: 0
      })
    })
    await batch([{ kind: 'moduleAssignment', id: switchId, fields: { menuids: '[0]' } }])
  }
  return { pages: pageIds, menu: menuIds, posts: postIds, warnings: [], revision, routes }
}
