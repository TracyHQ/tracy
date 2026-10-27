/**
 * The WordPress component the replace tests and the handler tests share (moved out of
 * replace-wordpress.test.mjs on 27/09/2026 so a handler test can drive the same site through the relay).
 */
import { readFileSync } from 'node:fs'

const WP = new URL('./wordpress/', import.meta.url)
export const SITE = JSON.parse(readFileSync(new URL('site.json', WP), 'utf8'))
/** @type {Record<string, string>} */
export const PAGES = {
  '/': readFileSync(new URL('home.html', WP), 'utf8'),
  '/about/': readFileSync(new URL('about.html', WP), 'utf8'),
  '/contact/': readFileSync(new URL('contact.html', WP), 'utf8'),
  '/news/': readFileSync(new URL('news.html', WP), 'utf8')
}

/**
 * The WordPress component as the relay reaches it: `content.list` (kind post only, `post_type`, 25
 * rows with bodies, `offset`), `content.get` (post, option, postmeta, term, templatePart — the ACTIVE
 * theme's part by slug, `find_template_part`), `content.update` (a whole field per write, an undo
 * recorded per `apply_id`) and `apply.revert`. `script(action, params, n)` answers first when it
 * returns anything but undefined.
 *
 * `themeFiles` / `patterns` make it the component that reads a block theme's own words (claude-cowork
 * `feat/wordpress-theme-words-editable`): `content.list {kind:"templatePart"|"template"}` lists the
 * theme's files and the stored overrides; `content.get` serves a part or template the site never
 * stored from its file (`stored:false`) and a registered pattern by name (read-only); a write to a
 * part or template with no row creates one, and its undo deletes it. Without them it is the older
 * component, which refuses those kinds.
 * @param {{ script?: (action: string, params: Record<string, any>, n: number) => unknown,
 *   posts?: Record<string, any>[], theme?: string,
 *   themeFiles?: { parts?: Record<string, { content: string, area?: string }>, templates?: Record<string, string> },
 *   patterns?: Record<string, { title?: string, content: string }> }} [options]
 */
export function component({ script, posts: extra = [], theme = SITE.theme, themeFiles, patterns } = {}) {
  const posts = new Map([...SITE.posts, ...extra].map((p) => [p.ID, structuredClone(p)]))
  const options = structuredClone(SITE.options)
  const meta = structuredClone(SITE.postmeta)
  const terms = structuredClone(SITE.terms)
  /** @type {[string, Record<string, any>][]} */
  const calls = []
  /** @type {Map<string, (() => void)[]>} */
  const undo = new Map()
  const rowOf = (/** @type {string} */ type, /** @type {string} */ slug) =>
    [...posts.values()].find((p) => p.post_type === type && p.post_name === slug && p.theme === theme)
  const partOf = (/** @type {string} */ slug) => rowOf('wp_template_part', slug)
  const templateOf = (/** @type {string} */ slug) => rowOf('wp_template', slug)
  let nextId = 7000
  /** A part or template as its theme file ships it, when no row overrides it. @param {string} kind @param {string} key */
  const fileOf = (kind, key) => {
    if (kind === 'templatePart' && themeFiles?.parts?.[key])
      return {
        id: 0,
        title: key,
        content: themeFiles.parts[key].content,
        area: themeFiles.parts[key].area ?? 'uncategorized',
        source: 'theme'
      }
    if (kind === 'template' && typeof themeFiles?.templates?.[key] === 'string')
      return { id: 0, title: key, content: themeFiles.templates[key], source: 'theme' }
    return null
  }
  const err = (/** @type {string} */ code, /** @type {string} */ message) => ({
    ok: false,
    error: code,
    message
  })
  /** @param {string} kind @param {number} id @param {string} key */
  const readOne = (kind, id, key) => {
    if (kind === 'post') return posts.has(id) ? { ...posts.get(id) } : null
    if (kind === 'option') return key in options ? { value: options[key] } : null
    if (kind === 'postmeta') return meta[id] && key in meta[id] ? { value: meta[id][key] } : null
    if (kind === 'term') return terms[key]?.[id] ? { ...terms[key][id] } : null
    if (kind === 'templatePart') {
      const p = partOf(key)
      return p ? { id: p.ID, title: p.post_title, content: p.post_content, area: p.area } : null
    }
    if (kind === 'template' && themeFiles) {
      const p = templateOf(key)
      return p ? { id: p.ID, title: p.post_title, content: p.post_content } : null
    }
    return null
  }
  /**
   * @param {string} action
   * @param {Record<string, any>} params
   */
  const door = async (action, params) => {
    calls.push([action, structuredClone(params)])
    const scripted = script?.(action, params, calls.length)
    if (scripted !== undefined) return scripted
    if (action === 'content.list') {
      const listed =
        params.kind === 'templatePart' ? 'parts' : params.kind === 'template' ? 'templates' : null
      if (listed && themeFiles) {
        const type = listed === 'parts' ? 'wp_template_part' : 'wp_template'
        /** @type {Map<string, { key: string, title: string, stored: boolean }>} */
        const found = new Map()
        for (const key of Object.keys(themeFiles[listed] ?? {}))
          found.set(key, { key, title: key, stored: false })
        for (const p of posts.values())
          if (p.post_type === type && p.theme === theme)
            found.set(p.post_name, { key: p.post_name, title: p.post_title || p.post_name, stored: true })
        return {
          ok: true,
          kind: params.kind,
          items: [...found.values()].sort((a, b) => a.key.localeCompare(b.key))
        }
      }
      if ((params.kind ?? 'post') !== 'post') return err('bad_params', 'content.list serves kind "post" only')
      const body = params.include_body === true
      const limit = Math.min(body ? 25 : 200, Math.max(1, params.limit ?? (body ? 25 : 100)))
      const offset = Math.max(0, params.offset ?? 0)
      const rows = [...posts.values()]
        .filter((p) =>
          params.post_type ? p.post_type === params.post_type : ['post', 'page'].includes(p.post_type)
        )
        .sort((a, b) => a.ID - b.ID)
        .slice(offset, offset + limit)
      return {
        ok: true,
        kind: 'post',
        offset,
        items: rows.map((p) => ({
          id: p.ID,
          type: p.post_type,
          title: p.post_title,
          slug: p.post_name,
          status: p.post_status,
          // `describe_post` answers `created` = `post_date_gmt` on every row (writers.php:238); the
          // baseline was seeded in one run, so its rows share one second unless a test says otherwise
          created: p.post_date_gmt ?? '2026-09-20 08:00:00',
          ...(body ? { content: p.post_content, excerpt: p.post_excerpt } : {})
        }))
      }
    }
    if (action === 'content.get') {
      const kind = params.kind ?? 'post'
      if (kind === 'pattern') {
        if (!patterns)
          return err(
            'bad_params',
            'kind must be one of: post, postmeta, option, templatePart, term, menuItem'
          )
        const p = patterns[params.key ?? '']
        if (!p) return err('not_found', `no registered pattern named "${params.key ?? ''}"`)
        return {
          ok: true,
          kind,
          id: 0,
          key: params.key,
          item: { id: 0, title: p.title ?? params.key, content: p.content, source: 'registry' },
          stored: false
        }
      }
      const item = readOne(kind, params.id ?? 0, params.key ?? '')
      const file = item === null ? fileOf(kind, params.key ?? '') : null
      if (file) return { ok: true, kind, id: 0, key: params.key, item: file, stored: false }
      if (item === null)
        return err('not_found', `no ${kind} at id ${params.id ?? 0}, key "${params.key ?? ''}"`)
      return { ok: true, kind, id: params.id ?? 0, key: params.key ?? '', item }
    }
    if (action === 'content.update') {
      if (typeof params.apply_id !== 'string' || params.apply_id === '')
        return err('bad_params', 'apply_id required')
      const { kind, id = 0, key = '', fields } = params
      /** @type {() => void} */
      let back
      let written = id
      if (kind === 'post' && !(id > 0)) {
        // No id: the component CREATES the post (`write_post`), a draft unless a status is given.
        const row = {
          ID: (nextId += 1),
          post_type: fields.post_type ?? 'post',
          post_status: fields.post_status ?? 'draft',
          post_name: fields.post_name ?? '',
          post_title: fields.post_title ?? '',
          post_excerpt: fields.post_excerpt ?? '',
          post_content: fields.post_content ?? '',
          theme
        }
        posts.set(row.ID, row)
        undo.set(params.apply_id, [...(undo.get(params.apply_id) ?? []), () => posts.delete(row.ID)])
        return {
          ok: true,
          kind,
          id: row.ID,
          key: null,
          created: true,
          stored: {
            post_title: row.post_title,
            post_name: row.post_name,
            post_status: row.post_status,
            post_type: row.post_type
          }
        }
      }
      if (kind === 'post') {
        const p = posts.get(id)
        if (!p) return err('write_failed', `no such post: ${id}`)
        const before = { ...p }
        Object.assign(p, fields)
        back = () => posts.set(id, before)
      } else if (kind === 'templatePart' || (kind === 'template' && themeFiles)) {
        const p = kind === 'templatePart' ? partOf(key) : templateOf(key)
        if (!p) {
          // No row: the theme's file is in charge, so this write creates the override and its undo
          // deletes it — which hands the part (or template) back to the file.
          const file = fileOf(kind, key)
          if (!file) return err('write_failed', `no ${kind} ${key}`)
          const row = {
            ID: (nextId += 1),
            post_type: kind === 'templatePart' ? 'wp_template_part' : 'wp_template',
            post_status: 'publish',
            post_name: key,
            post_title: fields.title || key,
            post_excerpt: '',
            post_content: fields.content,
            theme,
            ...(kind === 'templatePart' ? { area: file.area } : {})
          }
          posts.set(row.ID, row)
          undo.set(params.apply_id, [...(undo.get(params.apply_id) ?? []), () => posts.delete(row.ID)])
          return { ok: true, kind, id: row.ID, key, created: true }
        }
        const before = { ...p }
        p.post_content = fields.content
        p.post_title = fields.title || key
        written = p.ID
        back = () => Object.assign(p, before)
      } else if (kind === 'option') {
        const before = options[key]
        options[key] = fields.value
        back = () => {
          options[key] = before
        }
        written = 0
      } else if (kind === 'postmeta') {
        const before = meta[id][key]
        meta[id][key] = fields.value
        back = () => {
          meta[id][key] = before
        }
      } else if (kind === 'term') {
        const before = terms[key][id].name
        terms[key][id].name = fields.name
        back = () => {
          terms[key][id].name = before
        }
      } else
        return err('bad_params', 'kind must be one of: post, postmeta, option, term, menuItem, templatePart')
      undo.set(params.apply_id, [...(undo.get(params.apply_id) ?? []), back])
      return { ok: true, kind, id: written, key: key === '' ? null : key, created: false }
    }
    if (action === 'content.language') {
      if (typeof params.apply_id !== 'string' || params.apply_id === '')
        return err('bad_params', 'apply_id required')
      const p = posts.get(params.id ?? 0)
      if (!p) return err('bad_params', 'id required')
      const before = p.lang
      p.lang = String(params.lang).slice(0, 2).toLowerCase()
      undo.set(params.apply_id, [
        ...(undo.get(params.apply_id) ?? []),
        () => {
          p.lang = before
        }
      ])
      return { ok: true, id: p.ID, lang: p.lang }
    }
    if (action === 'apply.revert') {
      const steps = undo.get(params.apply_id) ?? []
      for (const step of [...steps].reverse()) step()
      undo.delete(params.apply_id)
      return { ok: true, reverted: steps.length }
    }
    return err('bad_action', `unknown action ${action}`)
  }
  const writes = () => calls.filter(([a]) => a === 'content.update').map(([, p]) => p)
  return { door, calls, posts, options, meta, terms, partOf, templateOf, writes }
}

/**
 * The site identity a 1.2.0+ Tracy Business site keeps in ONE option, `tracy_site_identity`, and the
 * theme prints wherever a part or a body carries `{site.*}`, `{contact.*}` or `{social.*}`
 * (`inc/identity.php`). Nested groups, as the Claude Cowork plugin writes them.
 */
export const IDENTITY = Object.freeze({
  name: 'Golden Crust',
  legalName: 'Golden Crust Bakery',
  slogan: 'Freshly baked every morning',
  contact: { phone: '0912 345 678', email: 'hello@goldencrust.example' }
})

/**
 * The fixture site as a 1.2.0+ release stores it: the footer prints the legal name twice and the
 * header topbar the phone, through tokens; the rendered home page shows the identity's values.
 * @param {{ option?: boolean }} [options] - `option:false`: a site with no identity option.
 */
export function tokenSite({ option = true } = {}) {
  const footer = SITE.posts.find((p) => p.ID === 81)
  const header = SITE.posts.find((p) => p.ID === 80)
  const site = component({
    posts: [
      {
        ...footer,
        post_content: footer.post_content
          .replace(
            '<p class="tracy-footer__note">© 2026 Northgate Industrial JSC. Template running on WordPress.</p>',
            '<p class="tracy-footer__note" data-tracy-identity="site.legalName">©&nbsp;{site.legalName}</p>'
          )
          .replace(
            '<p class="tracy-footer__text">Northgate Industrial JSC. Design–build',
            '<p class="tracy-footer__text"><span data-tracy-identity="site.legalName">{site.legalName}. </span>Design–build'
          )
      },
      {
        ...header,
        post_content: header.post_content.replace(
          /<p class="tracy-topbar__item">Hotline: <a href="tel:\+78005506789">8[\s\u00a0]800 550-67-89<\/a><\/p>/,
          '<p class="tracy-topbar__item" data-tracy-identity="contact.phone">Hotline: <a href="tel:{contact.tel}">{contact.phone}</a></p>'
        )
      }
    ]
  })
  if (!/©&nbsp;\{site\.legalName\}/.test(site.partOf('footer').post_content))
    throw new Error('tokenSite: the footer fixture moved')
  if (!/\{contact\.phone\}/.test(site.partOf('header').post_content))
    throw new Error('tokenSite: the header fixture moved')
  if (option) site.options.tracy_site_identity = structuredClone(IDENTITY)
  return site
}

/** The home page as the theme renders those parts: every token read as its identity value. */
export const TOKEN_PAGES = {
  ...PAGES,
  '/': PAGES['/']
    .replace(
      '<p class="tracy-footer__note wp-block-paragraph">© 2026 Northgate Industrial JSC. Template running on WordPress.</p>',
      '<p class="tracy-footer__note wp-block-paragraph" data-tracy-identity="site.legalName">©&nbsp;Golden Crust Bakery</p>'
    )
    .replace(
      '<p class="tracy-footer__text wp-block-paragraph">Northgate Industrial JSC. Design–build',
      '<p class="tracy-footer__text wp-block-paragraph"><span data-tracy-identity="site.legalName">Golden Crust Bakery. </span>Design–build'
    )
    .replace(
      /<p class="tracy-topbar__item wp-block-paragraph">Hotline: <a href="tel:\+78005506789">8[\s\u00a0]800 550-67-89<\/a><\/p>/,
      '<p class="tracy-topbar__item wp-block-paragraph" data-tracy-identity="contact.phone">Hotline: <a href="tel:+84912345678">0912 345 678</a></p>'
    )
}
