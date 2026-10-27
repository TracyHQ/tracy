#!/usr/bin/env node
// Authored brief JSON → seedable spec-pack. A brief defines the target; it has no comparison source.
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initSpecPack, validateSpecPack, DEFAULT_THEME_HOOK, PAGE_FLOOR } from './spec-pack.mjs'
import { convertHtml, SLOT_BLOCK } from '../lib/html-to-blocks.mjs'

const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const args = process.argv.slice(2)
const option = (key) => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1] }
const DESIGN_VARIANTS = ['1440-light', '390-light', '1440-dark', '390-dark']
const DESIGN_CATEGORIES = ['typography', 'color', 'layout', 'component']
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const hasText = (value) => typeof value === 'string' && value.trim().length > 0

export function missingBriefFacts(brief) {
  const missing = []
  const need = (yes, where) => { if (!yes) missing.push(where) }
  const site = isRecord(brief?.site) ? brief.site : {}
  const fonts = isRecord(brief?.fonts) ? brief.fonts : {}
  const palette = isRecord(brief?.palette) ? brief.palette : {}
  for (const key of ['title', 'tagline', 'locale']) need(hasText(site[key]), `site.${key}`)
  for (const mode of ['light', 'dark']) {
    const values = isRecord(palette[mode]) ? palette[mode] : {}
    for (const key of ['primary', 'secondary', 'body_bg', 'text']) need(hasText(values[key]), `palette.${mode}.${key}`)
  }
  need(hasText(fonts.body), 'fonts.body')
  need(hasText(fonts.heading), 'fonts.heading')
  need(Array.isArray(brief?.voice) && brief.voice.length > 0 && brief.voice.every(hasText), 'voice')
  const rules = Array.isArray(brief?.rules) ? brief.rules : []
  need(Array.isArray(brief?.rules) && rules.length > 0, 'rules')
  for (const [i, rule] of rules.entries()) {
    if (!isRecord(rule)) {
      need(false, `rules[${i}]`)
      continue
    }
    need(hasText(rule.id), `rules[${i}].id`)
    need(DESIGN_CATEGORIES.includes(rule.category), `rules[${i}].category`)
    need(hasText(rule.selector), `rules[${i}].selector`)
    for (const variant of DESIGN_VARIANTS) {
      const style = rule.styles?.[variant]
      need(isRecord(style) && Object.keys(style).length > 0 && Object.values(style).every(hasText), `rules[${i}].styles.${variant}`)
    }
  }
  for (const category of DESIGN_CATEGORIES) {
    const authored = rules.filter((r) => isRecord(r) && r.category === category)
    if (!authored.length) {
      need(false, `rules.${category}`)
    }
  }
  need(Array.isArray(brief?.coverage) && brief.coverage.length > 0, 'coverage')
  for (const [i, row] of (Array.isArray(brief?.coverage) ? brief.coverage : []).entries()) {
    need(isRecord(row), `coverage[${i}]`)
    if (isRecord(row)) {
      need(hasText(row.selector), `coverage[${i}].selector`)
      need(Array.isArray(row.properties) && row.properties.length > 0 && row.properties.every(hasText), `coverage[${i}].properties`)
    }
  }

  const pageList = Array.isArray(brief?.pages) ? brief.pages : []
  need(Array.isArray(brief?.pages) && pageList.length > 0, 'pages')
  const ruleIds = new Set(rules.filter(isRecord).map((r) => r.id).filter(hasText))
  for (const [i, p] of pageList.entries()) {
    if (!isRecord(p)) {
      need(false, `pages[${i}]`)
      continue
    }
    need(hasText(p.path) && p.path.startsWith('/'), `pages[${i}].path`)
    need(hasText(p.view), `pages[${i}].view`)
    need(hasText(p.title), `pages[${i}].title`)
    if (p.view === 'category') need(hasText(p.category), `pages[${i}].category`)
    need(Array.isArray(p.sections) && p.sections.length > 0, `pages[${i}].sections`)
    for (const [j, s] of (Array.isArray(p.sections) ? p.sections : []).entries()) {
      if (!isRecord(s)) {
        need(false, `pages[${i}].sections[${j}]`)
        continue
      }
      need(hasText(s.type), `pages[${i}].sections[${j}].type`)
      need(hasText(s.content), `pages[${i}].sections[${j}].content`)
      if (s.fields !== undefined) need(isRecord(s.fields), `pages[${i}].sections[${j}].fields`)
      if (s.items !== undefined) need(Array.isArray(s.items) && s.items.every(isRecord), `pages[${i}].sections[${j}].items`)
    }
    need(Array.isArray(p.rules) && p.rules.length > 0 && p.rules.every((id) => hasText(id) && ruleIds.has(id)), `pages[${i}].rules`)
    need(Array.isArray(p.requiredRules) && p.requiredRules.length > 0 && p.requiredRules.every((id) => hasText(id) && Array.isArray(p.rules) && p.rules.includes(id)), `pages[${i}].requiredRules`)
  }

  need(Array.isArray(brief?.menus), 'menus')
  const inspectMenuItems = (items, parent) => {
    if (!Array.isArray(items)) {
      need(false, parent)
      return
    }
    for (const [i, item] of items.entries()) {
      const where = `${parent}[${i}]`
      if (!isRecord(item)) {
        need(false, where)
        continue
      }
      need(hasText(item.label), `${where}.label`)
      need(hasText(item.url) && item.url.startsWith('/'), `${where}.url`)
      if (item.children !== undefined) inspectMenuItems(item.children, `${where}.children`)
    }
  }
  for (const [i, menu] of (Array.isArray(brief?.menus) ? brief.menus : []).entries()) {
    if (!isRecord(menu)) {
      need(false, `menus[${i}]`)
      continue
    }
    need(hasText(menu.menutype), `menus[${i}].menutype`)
    need(hasText(menu.title), `menus[${i}].title`)
    need(hasText(menu.region), `menus[${i}].region`)
    inspectMenuItems(menu.items, `menus[${i}].items`)
  }
  return [...new Set(missing)]
}

export function buildBriefPack(brief, out, { force = false, pageFloor = PAGE_FLOOR, scope = 'template' } = {}) {
  const missing = missingBriefFacts(brief)
  if (missing.length) throw new Error(`Missing required brief facts:\n  ${missing.join('\n  ')}`)
  if (!['template', 'website'].includes(scope)) throw new Error(`--scope must be template or website; got ${scope}`)
  const site = brief.site
  const themeName = slug(site.title) || 'site'
  const pages = brief.pages.map((p, i) => {
    const file = `${slug(p.path.replace(/\/$/, '').split('/').pop() || 'home') || `page-${i + 1}`}.html`
    return { ...p, file, locale: site.locale, translationOf: null, translations: {}, source: null }
  })
  const pageMap = {
    template: { name: themeName, title: site.title, version: null },
    theme: { mode: 'light-primary', palette: { light: brief.palette.light, dark: brief.palette.dark }, darkDerived: false, fonts: brief.fonts, hook: { ...DEFAULT_THEME_HOOK } },
    templateParts: ['header', 'footer'], locales: [site.locale], defaultLocale: site.locale,
    pages: pages.map((p) => ({ file: p.file, view: p.view, layout: null, title: p.title, path: p.path, locale: site.locale, translationOf: null, translations: {}, ...(p.view === 'single' ? { source: { articleId: p.path } } : {}), sections: [{ position: 'main', via: 'brief', modules: p.sections.map((_, i) => `brief-${slug(p.file)}-${i + 1}`) }] })),
    menus: brief.menus.map((m) => m.menutype), ...(scope === 'template' ? {} : { scope: { mode: scope, reason: `from-brief --scope ${scope}: the pack covers exactly the authored pages`, pages: pages.map((p) => p.file) } }),
    source: { kind: 'none' }
  }
  initSpecPack(out, { pageMap, kind: 'none', adapter: 'from-brief', source: { kind: 'brief' }, viewports: [1440, 768, 390], modes: ['light', 'dark'], pages: pages.map((p) => ({ page: p.file })), force })
  const custom = []
  const wpPages = []
  const posts = []
  const archives = []
  for (const p of pages) {
    const sections = p.sections.map((s, i) => {
      const id = `brief-${slug(p.file)}-${i + 1}`
      const converted = convertHtml(s.content)
      custom.push({ id, title: s.title ?? s.type, position: 'main', scope: 'page', ordering: i + 1, showtitle: false, sectionType: s.type, locale: site.locale, pages: [{ file: p.file, wpPath: p.path }], html: s.content, blocks: converted.markup, images: converted.images, fields: s.fields, items: s.items })
      return { kind: 'section', sectionType: s.type, moduleId: id, title: s.title ?? s.type, position: 'main', html: s.content }
    })
    const sectionIds = sections.map((s) => s.moduleId)
    const sectionSlots = sectionIds.length ? [{ position: 'main', via: 'brief', modules: sectionIds }] : []
    const isPage = p.view === 'front-page' || p.view === 'page' || p.view.startsWith('page-') || p.view === '404'
    if (isPage) {
      const content = sections.map((entry) => `<!-- wp:${SLOT_BLOCK} {"position":"${entry.position}","section":"${entry.moduleId}"} /-->`).join('\n')
      wpPages.push({ file: p.file, title: p.title, slug: p.path === '/' ? 'home' : slug(p.path.split('/').filter(Boolean).at(-1)), path: p.path, view: p.view, locale: site.locale, translationOf: null, menuLabel: p.title, status: p.view === '404' ? 'draft' : 'publish', date: null, modified: null, author: null, excerpt: '', featuredImage: null, featuredImageAlt: '', meta: p.view.startsWith('page-') ? { _wp_page_template: p.view } : {}, parent: null, synthetic: false, contentKind: 'sections', content: sections, contentMarkup: content, images: sections.flatMap((entry) => custom.find((s) => s.id === entry.moduleId)?.images ?? []), sections: sectionSlots, aside: [], orphaned: [], droppedContent: null, notes: [] })
    } else if (p.view === 'single') {
      const article = convertHtml(p.sections.map((section) => section.content).join('\n'))
      posts.push({ title: p.title, slug: slug(p.path.split('/').filter(Boolean).at(-1) || 'home'), path: p.path, status: 'publish', date: null, modified: null, author: null, category: 'news', categoryName: null, locale: site.locale, sticky: false, excerpt: '', featuredImage: null, featuredImageAlt: '', source: { file: p.file, dateText: null, eyebrow: null }, joomla: { articleId: p.path }, synthetic: false, content: article.markup, images: article.images })
    } else {
      archives.push({ file: p.file, view: p.view, path: p.path, title: p.title, locale: site.locale, category: p.view === 'home' ? 'news' : p.view === 'category' ? slug(p.category) : null, sections: sectionSlots, aside: [] })
    }
  }
  const categoryArchives = archives.filter((a) => a.view === 'category').map((a) => ({ id: a.category, title: a.title, wpSlug: a.category, joomlaAlias: null, parent: null, description: '', postCount: 0 }))
  const categories = [...new Map([...(posts.length ? [{ id: 'news', title: 'News', wpSlug: 'news', joomlaAlias: null, parent: null, description: '', postCount: 0 }] : []), ...categoryArchives].map((c) => [c.wpSlug, c])).values()]
  writeJson(join(out, 'content.json'), { site: { name: site.title, tagline: site.tagline, logo: null, url: null, locales: [site.locale], defaultLocale: site.locale }, categories, pages: wpPages, posts, archives, images: [], assets: [], unresolvedLinks: [] })
  writeJson(join(out, 'sections.json'), { slotBlock: SLOT_BLOCK, acm: [], custom, other: [] })
  const menuItem = (item, path) => {
    const target = pages.find((p) => p.path === item.url)
    return { id: path, label: item.label, type: target ? 'page' : 'url', url: item.url, page: target?.file ?? null, view: target?.view ?? null, published: true, children: (item.children ?? []).map((child, i) => menuItem(child, `${path}-${i + 1}`)) }
  }
  writeJson(join(out, 'menus.json'), { menus: brief.menus.map((m) => ({ menutype: m.menutype, title: m.title, region: m.region, locale: site.locale, items: m.items.map((item, i) => menuItem(item, `${m.menutype}-${i + 1}`)) })) })
  writeJson(join(out, 'redirects.json'), { rules: [], categorySlugs: [] })
  writeJson(join(out, 'content-contract.json'), { schemaVersion: 1, id: themeName, revision: 1, mode: 'customer', language: site.locale, identity: { name: 'site.name', summary: 'site.tagline' }, voice: brief.voice, sources: { brief: { kind: 'customer', reference: 'authored brief', note: 'Facts and copy supplied in the brief.' } }, facts: { 'site.name': { value: site.title, status: 'verified', source: 'brief' }, 'site.tagline': { value: site.tagline, status: 'verified', source: 'brief' } }, surfaces: pages.map((p) => ({ id: p.file, purpose: `${p.view} · ${p.path} (${p.title})`, requiredFacts: [] })), pending: [] })
  const variants = [{ id: '1440-light', mode: 'light', width: 1440, height: 900 }, { id: '390-light', mode: 'light', width: 390, height: 844 }, { id: '1440-dark', mode: 'dark', width: 1440, height: 900 }, { id: '390-dark', mode: 'dark', width: 390, height: 844 }]
  const tokens = Object.fromEntries(variants.map((v) => { const p = brief.palette[v.mode]; return [v.id, { '--font-body': brief.fonts.body, '--font-heading': brief.fonts.heading, '--color-bg': p.body_bg, '--color-text': p.text, '--color-primary': p.primary, '--color-accent': p.secondary }] }))
  writeJson(join(out, 'design-contract.json'), { schemaVersion: 1, id: themeName, revision: 1, source: { reference: 'authored brief', inspiration: site.title, version: '1', capturedAt: new Date().toISOString() }, theme: { ...DEFAULT_THEME_HOOK }, variants, tokens, rules: brief.rules, coverage: brief.coverage, pages: pages.map((p) => ({ id: p.file, url: `http://127.0.0.1${p.path}`, expectedUrl: `http://127.0.0.1${p.path}`, identity: 'main', rules: p.rules, requiredRules: p.requiredRules })), pilotPages: [pages[0].file], exceptions: [], pending: [] })
  writeFileSync(join(out, 'design-spec.md'), `# ${site.title}\n\n${site.tagline}\n\n## Voice\n\n${brief.voice.map((line) => `- ${line}`).join('\n')}\n\n## Palette\n\n${JSON.stringify(brief.palette, null, 2)}\n\n## Fonts\n\n- Body: ${brief.fonts.body}\n- Heading: ${brief.fonts.heading}\n\n## Design rules\n\n${brief.rules.map((rule) => `- ${rule.category} · ${rule.id} · ${rule.selector}: ${JSON.stringify(rule.styles)}`).join('\n')}\n\n## Coverage\n\n${brief.coverage.map((row) => `- ${row.selector}: ${row.properties.join(', ')}`).join('\n')}\n\n## Pages\n\n${pages.map((p) => `- ${p.path} — ${p.view}: ${p.title}; rules ${p.rules.join(', ')}; required ${p.requiredRules.join(', ')}`).join('\n')}\n`)
  const provenance = JSON.parse(readFileSync(join(out, 'provenance.json'), 'utf8'))
  Object.assign(provenance, { adapterVersion: '1.0', counts: { pages: pages.length, sections: custom.length, menus: brief.menus.length }, notes: ['No comparison source: this pack was authored from a brief.'] })
  writeJson(join(out, 'provenance.json'), provenance)
  const validation = validateSpecPack(out, { pageFloor })
  return { out, validation }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const input = args.find((x) => !x.startsWith('--'))
    const out = option('--out')
    if (!input || !out) throw new Error('Usage: from-brief.mjs <brief.json> --out <spec-pack> [--scope template|website] [--page-floor N] [--force]')
    const result = buildBriefPack(JSON.parse(readFileSync(input, 'utf8')), resolve(out), { force: args.includes('--force'), pageFloor: Number(option('--page-floor') ?? PAGE_FLOOR), scope: option('--scope') ?? 'template' })
    console.log(JSON.stringify(result.validation, null, 2))
    if (!result.validation.ok) process.exitCode = 1
  } catch (e) { console.error(e.message); process.exitCode = 1 }
}
