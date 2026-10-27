#!/usr/bin/env node
// Build the EmDash seed (schema + menus + taxonomies + text content, EN and RU) from the extracted
// source data, plus the media map the importer uses to upload images and patch image fields.
//
//   node tools/build-seed.mjs <source-data.json> <seed-dir> [--source-dir <folder>]
//
// Writes <seed-dir>/seed.json, <seed-dir>/media-map.json, <seed-dir>/field-map.json and copies the
// referenced media into <seed-dir>/media/ when --source-dir is given. The seed carries NO media: on
// emdash 0.37 `$media` only downloads from a URL (packages/core/src/seed/apply.ts resolveMedia), so
// image fields are filled by tools/seed-apply.mjs after upload -- see DECISIONS D14.
//
// Every value here is a literal from the source data; the few labels the canvas computed in code
// (`allProjLabel`, `themeLabel`) are quoted with their source line.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
const [srcArg, outArg] = args
if (!srcArg || !outArg) {
  console.error('usage: build-seed.mjs <source-data.json> <seed-dir> [--source-dir <folder>]')
  process.exit(2)
}
const sourceDirIdx = args.indexOf('--source-dir')
const SOURCE_DIR = sourceDirIdx >= 0 ? path.resolve(args[sourceDirIdx + 1]) : null
const OUT = path.resolve(outArg)
mkdirSync(OUT, { recursive: true })
const extracted = JSON.parse(readFileSync(path.resolve(srcArg), 'utf8'))
const D = extracted.data

const LOCALES = ['en', 'ru']
const L = {
  en: { t: D.EN, res: D.RES_EN, sv: D.SV_EN, ab: D.AB_EN, pj: D.PJ_EN, car: D.CAR_EN, ir: D.IR_EN },
  ru: { t: D.RU, res: D.RES_RU, sv: D.SV_RU, ab: D.AB_RU, pj: D.PJ_RU, car: D.CAR_RU, ir: D.IR_RU }
}
// Labels the canvas computed in its component class rather than its data objects
// (tracy_business/Home.html lines 3406 and 3428-3430 in the shared script).
const COMPUTED = {
  en: { allProjects: 'All projects', themeDark: 'Dark', themeLight: 'Light', kit: 'Marketing Kit' },
  ru: { allProjects: 'Все объекты', themeDark: 'Тёмная', themeLight: 'Светлая', kit: 'Marketing Kit' }
}
const prefix = (locale, p) => (locale === 'en' ? p : `/ru${p === '/' ? '' : p}`)

// ───────────────────────── helpers ─────────────────────────
const RU_MAP = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya'
}
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => RU_MAP[c] ?? c)
    .replace(/[’'"«»“”]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
let keyN = 0
const key = () => `k${(++keyN).toString(36)}`
const span = (text) => ({ _type: 'span', _key: key(), text: String(text), marks: [] })
const block = (text, style = 'normal', extra = {}) => ({
  _type: 'block',
  _key: key(),
  style,
  markDefs: [],
  children: [span(text)],
  ...extra
})
const bullet = (text) => block(text, 'normal', { listItem: 'bullet', level: 1 })
const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12
}
/** "12 Aug 2026" | "12.08.2026" | "3 Jul 2026" -> "2026-08-12T09:00:00.000Z" */
function isoDate(s) {
  let m = String(s).match(/(\d{1,2})\.(\d{2})\.(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1].padStart(2, '0')}T09:00:00.000Z`
  m = String(s).match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/)
  if (m)
    return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}T09:00:00.000Z`
  throw new Error(`unparsed date: ${s}`)
}
const readingMinutes = (meta) => Number((String(meta).match(/(\d+)\s*(min|мин)/) ?? [])[1] ?? 0)
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

// ───────────────────────── media ─────────────────────────
const media = new Map() // key -> { key, file, alt, sha256, targets: [] }
function img(file, alt, target) {
  if (!file) return null
  // Key = source path without extension (`img/hero-ru`, `decks/en/corporate-2026`): the EN and RU
  // decks share basenames, so a basename key would silently merge them.
  const k = file.replace(/\.[a-z0-9]+$/i, '')
  if (!media.has(k))
    media.set(k, {
      key: k,
      file,
      alt: alt ?? k,
      mime: file.endsWith('.pdf') ? 'application/pdf' : 'image/png',
      targets: []
    })
  if (target) media.get(k).targets.push(target)
  return k
}
// Target = where the importer writes the uploaded media value: { collection, slug, locale, path }.
const T = (collection, slug, locale, fieldPath) => ({ collection, slug, locale, path: fieldPath })

// ───────────────────────── schema ─────────────────────────
const f = (slug, label, type, extra = {}) => ({ slug, label, type, ...extra })
const str = (slug, label, extra) => f(slug, label, 'string', extra)
const txt = (slug, label, extra) => f(slug, label, 'text', extra)
const image = (slug, label) => f(slug, label, 'image')
const int = (slug, label, extra) => f(slug, label, 'integer', extra)
const bool = (slug, label) => f(slug, label, 'boolean', { defaultValue: false })
const rep = (slug, label, subFields, extra = {}) =>
  f(slug, label, 'repeater', { validation: { subFields }, ...extra })
const sub = (slug, label, type = 'string', extra = {}) => ({ slug, label, type, ...extra })
// `reference` holds ONE id on 0.37 (fields/reference.ts validates z.string()); a list of references is several fields.
// EmDash ≥0.41: a reference field naming `validation.targetCollection` binds to a relation (an
// entry picker in the admin; the value lives in `entry.references`, not `data`).
const ref = (slug, label, collection) =>
  f(slug, label, 'reference', { validation: { targetCollection: collection } })
const kv = (slug, label) => rep(slug, label, [sub('key', 'Label'), sub('value', 'Value')])
const stats = (slug = 'stats', label = 'Stats') =>
  rep(slug, label, [sub('value', 'Value'), sub('label', 'Label')])
const titleText = (slug, label) => rep(slug, label, [sub('title', 'Title'), sub('text', 'Text', 'text')])
const numbered = (slug, label) =>
  rep(slug, label, [sub('number', 'Number'), sub('title', 'Title'), sub('text', 'Text', 'text')])

const collections = [
  {
    slug: 'site',
    label: 'Site chrome',
    labelSingular: 'Site chrome',
    sortOrder: 1,
    routable: false,
    description: 'Topbar, header, footer, search and 404 copy. One entry per locale.',
    supports: ['revisions'],
    fields: [
      str('title', 'Title', { required: true }),
      str('brand_mark', 'Brand mark'),
      str('brand_name', 'Brand name'),
      str('brand_sub', 'Brand subtitle'),
      str('quote_label', 'Header CTA label'),
      str('quote_url', 'Header CTA URL'),
      str('topbar_phone', 'Topbar phone line'),
      str('topbar_email', 'Topbar email'),
      str('topbar_address', 'Topbar address'),
      str('home_label', 'Breadcrumb home label'),
      str('resources_label', 'Resources menu label'),
      str('kit_title', 'Marketing kit column title'),
      str('recent_projects_title', 'Recent projects column title'),
      str('news_column_title', 'News column title'),
      str('resources_all_label', 'All resources link'),
      str('all_projects_label', 'All projects link'),
      str('all_label', 'Filter: all'),
      str('theme_dark_label', 'Theme toggle: switch to dark'),
      str('theme_light_label', 'Theme toggle: switch to light'),
      str('language_name', 'Language name'),
      txt('footer_text', 'Footer description'),
      str('footer_legal_1', 'Footer legal line 1'),
      str('footer_legal_2', 'Footer legal line 2'),
      str('footer_services_title', 'Footer column 1 title'),
      str('footer_company_title', 'Footer column 2 title'),
      str('footer_contact_title', 'Footer column 3 title'),
      str('hotline', 'Hotline number'),
      str('sales_email', 'Sales email'),
      str('hours', 'Office hours'),
      str('footer_book_label', 'Footer booking link'),
      str('copyright', 'Copyright line'),
      rep('social', 'Social profiles', [
        sub('name', 'Network'),
        sub('handle', 'Handle'),
        sub('url', 'URL'),
        sub('text', 'Description')
      ]),
      str('search_title', 'Search: title'),
      str('search_placeholder', 'Search: placeholder'),
      str('search_button', 'Search: button'),
      str('search_next', 'Search: next label'),
      str('search_results_line', 'Search: results line ({count}, {query})'),
      str('search_filter_title', 'Search: filter title'),
      str('search_popular_title', 'Search: popular title'),
      rep('search_popular', 'Search: popular terms', [sub('term', 'Term')]),
      str('not_found_title', '404: title'),
      txt('not_found_text', '404: text'),
      str('not_found_placeholder', '404: search placeholder'),
      str('not_found_back', '404: back link'),
      str('not_found_suggestions_title', '404: suggestions title'),
      rep('not_found_suggestions', '404: suggestions', [sub('label', 'Label'), sub('url', 'URL')]),
      rep('slots', 'Image placeholder hints', [sub('key', 'Slot'), sub('text', 'Hint')])
    ]
  },
  {
    slug: 'home',
    urlPattern: '/',
    label: 'Home page',
    labelSingular: 'Home page',
    sortOrder: 2,
    routable: false,
    supports: ['revisions', 'seo'],
    fields: [
      str('title', 'Title', { required: true }),
      str('hero_badge', 'Hero badge'),
      str('hero_title_a', 'Hero title (line 1)'),
      str('hero_title_b', 'Hero title (accent line)'),
      txt('hero_text', 'Hero text'),
      str('hero_cta1_label', 'Hero CTA 1 label'),
      str('hero_cta1_url', 'Hero CTA 1 URL'),
      str('hero_cta2_label', 'Hero CTA 2 label'),
      str('hero_cta2_url', 'Hero CTA 2 URL'),
      image('hero_image', 'Hero image'),
      stats(),
      str('services_eyebrow', 'Services eyebrow'),
      str('services_title', 'Services title'),
      str('services_all_label', 'Services link label'),
      str('services_all_url', 'Services link URL'),
      numbered('services_items', 'Services cards'),
      str('projects_title', 'Projects title'),
      ref('project_big', 'Large project card', 'projects'),
      ref('project_small_1', 'Small project card 1', 'projects'),
      ref('project_small_2', 'Small project card 2', 'projects'),
      image('about_image', 'About section image'),
      str('why_eyebrow', 'Why eyebrow'),
      str('why_title', 'Why title'),
      titleText('why_items', 'Why items'),
      str('band_title', 'CTA band title'),
      txt('band_text', 'CTA band text'),
      str('band_button', 'CTA band button'),
      str('band_url', 'CTA band URL'),
      str('news_title', 'News title'),
      str('news_all_label', 'News link label'),
      str('clients_label', 'Clients label'),
      rep('client_logos', 'Client logos', [sub('logo', 'Logo', 'image'), sub('name', 'Name')])
    ]
  },
  {
    slug: 'about',
    urlPattern: '/about',
    label: 'About page',
    labelSingular: 'About page',
    sortOrder: 3,
    routable: false,
    supports: ['revisions', 'seo'],
    fields: [
      str('title', 'Title', { required: true }),
      str('breadcrumb', 'Breadcrumb label'),
      txt('lede', 'Lede'),
      image('hero_image', 'Hero image'),
      str('stats_title', 'Stats title'),
      stats(),
      str('mission_title', 'Mission title'),
      txt('mission_text', 'Mission text'),
      titleText('pillars', 'Pillars'),
      str('history_title', 'History title'),
      rep('history', 'History', [sub('year', 'Year'), sub('title', 'Title'), sub('text', 'Text', 'text')]),
      str('geo_title', 'Geography title'),
      txt('geo_text', 'Geography text'),
      rep('geo_list', 'Locations', [sub('city', 'City'), sub('role', 'Role')]),
      image('map_image', 'Map image'),
      str('team_title', 'Team title'),
      rep('team', 'Team', [
        sub('name', 'Name'),
        sub('role', 'Role'),
        sub('text', 'Text', 'text'),
        sub('photo', 'Photo', 'image')
      ]),
      str('cert_title', 'Accreditations title'),
      titleText('certs', 'Accreditations'),
      str('safety_title', 'Safety title'),
      txt('safety_text', 'Safety text'),
      image('safety_image', 'Safety image'),
      str('cta_title', 'CTA title'),
      txt('cta_text', 'CTA text'),
      str('cta_button', 'CTA button'),
      str('cta_url', 'CTA URL'),
      str('cta_alt_label', 'CTA secondary label'),
      str('cta_alt_url', 'CTA secondary URL')
    ]
  },
  {
    slug: 'services_page',
    urlPattern: '/services',
    label: 'Services page',
    labelSingular: 'Services page',
    sortOrder: 4,
    routable: false,
    supports: ['revisions', 'seo'],
    fields: [
      str('title', 'Title', { required: true }),
      str('breadcrumb', 'Breadcrumb label'),
      txt('lede', 'Lede'),
      stats(),
      str('services_title', 'Services title'),
      str('includes_label', 'Includes label'),
      str('process_title', 'Process title'),
      numbered('process', 'Process'),
      str('pricing_title', 'Pricing title'),
      txt('pricing_text', 'Pricing note'),
      rep('pricing', 'Pricing', [sub('title', 'Title'), sub('value', 'Value'), sub('text', 'Text')]),
      str('cta_title', 'CTA title'),
      txt('cta_text', 'CTA text'),
      str('cta_button', 'CTA button'),
      str('cta_url', 'CTA URL'),
      str('cta_alt_label', 'CTA secondary label'),
      str('cta_alt_url', 'CTA secondary URL')
    ]
  },
  {
    slug: 'services',
    label: 'Services',
    labelSingular: 'Service',
    sortOrder: 10,
    urlPattern: '/services/{slug}',
    supports: ['drafts', 'revisions', 'search', 'seo'],
    fields: [
      str('title', 'Title', { required: true, searchable: true }),
      txt('description', 'Description', { searchable: true }),
      rep('includes', 'Covered by the contract', [sub('item', 'Item')]),
      str('term', 'Timeline'),
      int('sort', 'Sort order', { indexed: true })
    ]
  },
  {
    slug: 'projects_page',
    urlPattern: '/projects',
    label: 'Projects page',
    labelSingular: 'Projects page',
    sortOrder: 5,
    routable: false,
    supports: ['revisions', 'seo'],
    fields: [
      str('title', 'Title', { required: true }),
      str('breadcrumb', 'Breadcrumb label'),
      txt('lede', 'Lede'),
      str('featured_label', 'Featured label'),
      ref('featured_project', 'Featured project', 'projects'),
      image('featured_image', 'Featured image'),
      str('featured_title', 'Featured title'),
      txt('featured_text', 'Featured text'),
      kv('featured_facts', 'Featured facts'),
      str('featured_cta', 'Featured CTA label'),
      str('grid_title', 'Grid title'),
      str('grid_text', 'Grid note'),
      str('view_label', 'View project label'),
      str('sectors_title', 'Sectors title'),
      rep('sectors', 'Sectors', [
        sub('sector', 'Sector slug'),
        sub('title', 'Title'),
        sub('count', 'Count'),
        sub('text', 'Text', 'text')
      ]),
      str('how_title', 'How we work title'),
      numbered('how', 'How we work'),
      str('cta_title', 'CTA title'),
      txt('cta_text', 'CTA text'),
      str('cta_button', 'CTA button'),
      str('cta_url', 'CTA URL'),
      str('cta_alt_label', 'CTA secondary label'),
      str('cta_alt_url', 'CTA secondary URL')
    ]
  },
  {
    slug: 'projects',
    label: 'Projects',
    labelSingular: 'Project',
    sortOrder: 11,
    urlPattern: '/projects/{slug}',
    supports: ['drafts', 'revisions', 'search', 'seo'],
    admin: { listColumns: ['year', 'city', 'featured'] },
    fields: [
      str('title', 'Title', { required: true, searchable: true }),
      str('card_tag', 'Card tag'),
      str('type_label', 'Type label (breadcrumb)'),
      str('year', 'Year', { indexed: true }),
      str('area', 'Area / size'),
      str('city', 'City'),
      txt('summary', 'Card summary', { searchable: true }),
      txt('lede', 'Lede'),
      image('image', 'Image'),
      kv('facts', 'Facts'),
      str('scope_title', 'Scope title'),
      rep('scope', 'Scope of work', [sub('item', 'Item')]),
      str('gallery_title', 'Gallery title'),
      rep('gallery', 'Gallery', [sub('image', 'Image', 'image'), sub('caption', 'Caption')]),
      txt('quote', 'Quote'),
      str('quote_by', 'Quote by'),
      str('cta_label', 'CTA label'),
      str('next_title', 'Other projects title'),
      bool('featured', 'Featured'),
      int('sort', 'Sort order', { indexed: true })
    ]
  },
  {
    slug: 'news_page',
    urlPattern: '/news',
    label: 'News page',
    labelSingular: 'News page',
    sortOrder: 6,
    routable: false,
    supports: ['revisions', 'seo'],
    fields: [
      str('title', 'Title', { required: true }),
      str('breadcrumb', 'Breadcrumb label'),
      txt('lede', 'Lede'),
      str('count_label', 'Count label ({count})'),
      str('page_meta', 'Page meta ({page}, {pages}, {perPage})'),
      str('featured_label', 'Featured label'),
      str('all_label', 'All filter label'),
      str('sidebar_search_title', 'Sidebar: search title'),
      str('sidebar_search_placeholder', 'Sidebar: search placeholder'),
      str('categories_title', 'Sidebar: categories title'),
      str('latest_title', 'Sidebar: latest title'),
      str('newsletter_title', 'Newsletter title'),
      txt('newsletter_text', 'Newsletter text'),
      str('newsletter_placeholder', 'Newsletter placeholder'),
      str('newsletter_button', 'Newsletter button'),
      str('newsletter_form_id', 'Newsletter form id (set by the importer)'),
      str('tags_label', 'Article: tags label'),
      str('prev_label', 'Article: previous label'),
      str('next_label', 'Article: next label'),
      str('related_title', 'Article: related title'),
      str('toc_title', 'Article: contents title'),
      str('downloads_title', 'Article: downloads title'),
      str('aside_title', 'Article: aside title'),
      txt('aside_text', 'Article: aside text'),
      str('aside_button', 'Article: aside button'),
      str('aside_url', 'Article: aside URL')
    ]
  },
  {
    slug: 'posts',
    label: 'News',
    labelSingular: 'Article',
    sortOrder: 12,
    urlPattern: '/news/{slug}',
    supports: ['drafts', 'revisions', 'scheduling', 'search', 'seo'],
    dateField: 'date',
    admin: { listColumns: ['date', 'author', 'featured'] },
    fields: [
      str('title', 'Title', { required: true, searchable: true }),
      str('short_title', 'Short title (breadcrumb)'),
      txt('lede', 'Lede'),
      txt('excerpt', 'Excerpt', { searchable: true }),
      image('featured_image', 'Featured image'),
      str('caption', 'Image caption'),
      str('author', 'Author'),
      str('author_role', 'Author role'),
      f('date', 'Date', 'datetime', { indexed: true }),
      int('reading_time', 'Reading time (min)'),
      f('content', 'Content', 'portableText', { searchable: true }),
      rep('downloads', 'Downloads', [
        sub('title', 'Title'),
        sub('format', 'Format'),
        sub('url', 'URL (empty = not linked)')
      ]),
      rep('toc', 'Contents labels (one per H2, in order; empty = heading text)', [sub('label', 'Label')]),
      bool('featured', 'Featured')
    ]
  },
  {
    slug: 'careers',
    urlPattern: '/careers',
    label: 'Careers page',
    labelSingular: 'Careers page',
    sortOrder: 7,
    routable: false,
    supports: ['revisions', 'seo'],
    fields: [
      str('title', 'Title', { required: true }),
      str('breadcrumb', 'Breadcrumb label'),
      txt('lede', 'Lede'),
      image('hero_image', 'Hero image'),
      stats('stats', 'Stats ({n} in a value = number of published vacancies)'),
      str('open_title', 'Open roles title'),
      str('all_label', 'All filter label'),
      str('apply_label', 'Apply label'),
      str('more_label', 'More roles label ({n} = number of published vacancies)'),
      str('benefits_title', 'Benefits title'),
      titleText('benefits', 'Benefits'),
      str('process_title', 'Hiring process title'),
      numbered('steps', 'Hiring steps'),
      str('life_title', 'Life on site title'),
      rep('life', 'Life on site', [sub('image', 'Image', 'image'), sub('caption', 'Caption')]),
      txt('quote', 'Quote'),
      str('quote_by', 'Quote by'),
      str('cta_title', 'CTA title'),
      txt('cta_text', 'CTA text'),
      str('cta_button', 'CTA button'),
      str('cta_url', 'CTA URL'),
      str('cta_mail', 'CTA email')
    ]
  },
  {
    slug: 'vacancies',
    label: 'Vacancies',
    labelSingular: 'Vacancy',
    sortOrder: 13,
    routable: false,
    supports: ['drafts', 'revisions'],
    fields: [
      str('title', 'Title', { required: true }),
      str('city', 'City'),
      str('type', 'Type'),
      str('pay', 'Pay'),
      int('sort', 'Sort order', { indexed: true })
    ]
  },
  {
    slug: 'investors',
    urlPattern: '/investors',
    label: 'Investor relations page',
    labelSingular: 'Investor relations page',
    sortOrder: 8,
    routable: false,
    supports: ['revisions', 'seo'],
    fields: [
      str('title', 'Title', { required: true }),
      str('breadcrumb', 'Breadcrumb label'),
      str('ticker', 'Ticker'),
      txt('lede', 'Lede'),
      kv('quote', 'Share quote'),
      str('fin_title', 'Key figures title'),
      str('fin_note', 'Key figures note'),
      rep('fin_headers', 'Table headers', [sub('label', 'Label')]),
      rep('fin_rows', 'Table rows', [
        sub('metric', 'Metric'),
        sub('a', 'Column 2'),
        sub('b', 'Column 3'),
        sub('change', 'Column 4')
      ]),
      str('reports_title', 'Reports title'),
      rep('reports', 'Reports', [
        sub('title', 'Title'),
        sub('format', 'Format'),
        sub('date', 'Date'),
        sub('url', 'URL (empty = not linked)')
      ]),
      str('disclosures_title', 'Disclosures title'),
      str('dividends_title', 'Dividends title'),
      txt('dividends_text', 'Dividends text'),
      rep('dividends', 'Dividends', [
        sub('period', 'Period'),
        sub('value', 'Value'),
        sub('status', 'Status')
      ]),
      str('calendar_title', 'Calendar title'),
      rep('calendar', 'Calendar', [sub('date', 'Date'), sub('text', 'Event')]),
      str('governance_title', 'Governance title'),
      rep('governance', 'Governance links', [sub('label', 'Label'), sub('url', 'URL')]),
      str('contact_title', 'IR contact title'),
      str('contact_name', 'IR contact'),
      str('contact_mail', 'IR email'),
      str('contact_phone', 'IR phone'),
      str('subscribe_placeholder', 'Subscribe placeholder'),
      str('subscribe_button', 'Subscribe button'),
      // The investors page shows its own newsletter form: an unticked News page takes its entry off the site (TCH #1013).
      str('newsletter_form_id', 'Newsletter form id (set by the importer)')
    ]
  },
  {
    slug: 'contact',
    urlPattern: '/contact',
    label: 'Contact page',
    labelSingular: 'Contact page',
    sortOrder: 9,
    routable: false,
    supports: ['revisions', 'seo'],
    fields: [
      str('title', 'Title', { required: true }),
      txt('lede', 'Lede'),
      txt('notice', 'Form notice'),
      str('form', 'Form slug'),
      str('form_id', 'Form id (set by the importer)'),
      str('reset_label', 'Clear form button'),
      str('hq_title', 'Head office title'),
      str('hq_address_1', 'Head office address 1'),
      str('hq_address_2', 'Head office address 2'),
      str('hotline_label', 'Hotline label'),
      str('sales_label', 'Sales label'),
      str('hours_label', 'Hours label'),
      image('map_image', 'Map image'),
      str('branches_title', 'Branches title'),
      rep('branches', 'Branches', [sub('city', 'City'), sub('address', 'Address')]),
      str('social_title', 'Social title'),
      txt('social_text', 'Social text')
    ]
  },
  {
    slug: 'pages',
    label: 'Pages',
    labelSingular: 'Page',
    sortOrder: 14,
    urlPattern: '/{slug}',
    supports: ['drafts', 'revisions', 'search', 'seo'],
    fields: [
      str('title', 'Title', { required: true, searchable: true }),
      txt('lede', 'Lede'),
      f('content', 'Content', 'portableText', { searchable: true }),
      f('template', 'Template', 'select', {
        validation: {
          options: ['default', 'kit-newsletter', 'kit-email', 'kit-form', 'kit-slides', 'kit-style-guide']
        },
        defaultValue: 'default'
      }),
      f('sample', 'Sample data (kit pages)', 'json')
    ]
  }
]

// ───────────────────────── taxonomies ─────────────────────────
const catSlugs = ['disclosures', 'engineering', 'projects', 'careers', 'company']
const catLabels = {
  en: [...D.EN.blog.filters.slice(1), 'Company'],
  ru: [...D.RU.blog.filters.slice(1), 'Компания']
}
const sectorSlugs = ['production', 'logistics', 'energy', 'refurbishment', 'infrastructure']
const sectorLabels = {
  en: [...D.PJ_EN.filters.slice(1), 'Infrastructure'],
  ru: [...D.PJ_RU.filters.slice(1), 'Инфраструктура']
}
const deptSlugs = ['site', 'design', 'estimating', 'office']
const deptLabels = { en: D.CAR_EN.filters.slice(1), ru: D.CAR_RU.filters.slice(1) }
const tagSlugs = D.EN.art.tags.map(slugify)

function taxonomy(name, label, labelSingular, collectionsFor, slugs, labels, hierarchical = false) {
  return LOCALES.map((locale) => ({
    id: `tax:${name}:${locale}`,
    name,
    label: label[locale],
    labelSingular: labelSingular[locale],
    hierarchical,
    collections: collectionsFor,
    locale,
    ...(locale !== 'en' ? { translationOf: `tax:${name}:en` } : {}),
    terms: slugs.map((slug, i) => ({
      id: `term:${name}:${slug}:${locale}`,
      slug,
      label: labels[locale][i],
      locale,
      ...(locale !== 'en' ? { translationOf: `term:${name}:${slug}:en` } : {})
    }))
  }))
}
const taxonomies = [
  ...taxonomy(
    'category',
    { en: 'Categories', ru: 'Рубрики' },
    { en: 'Category', ru: 'Рубрика' },
    ['posts'],
    catSlugs,
    catLabels,
    true
  ),
  ...taxonomy('tag', { en: 'Tags', ru: 'Теги' }, { en: 'Tag', ru: 'Тег' }, ['posts'], tagSlugs, {
    en: D.EN.art.tags,
    ru: D.RU.art.tags
  }),
  ...taxonomy(
    'sector',
    { en: 'Sectors', ru: 'Секторы' },
    { en: 'Sector', ru: 'Сектор' },
    ['projects'],
    sectorSlugs,
    sectorLabels
  ),
  ...taxonomy(
    'department',
    { en: 'Departments', ru: 'Направления' },
    { en: 'Department', ru: 'Направление' },
    ['vacancies'],
    deptSlugs,
    deptLabels
  )
]

// ───────────────────────── content ─────────────────────────
const content = {}
const push = (collection, entry) => (content[collection] ??= []).push(entry)
const idOf = (collection, slug, locale) => `${collection}:${slug}:${locale}`
/** One entry per locale, RU linked to EN. `build(locale) -> data` */
function singleton(collection, slug, build, extra = {}) {
  for (const locale of LOCALES) {
    push(collection, {
      id: idOf(collection, slug, locale),
      slug,
      status: 'published',
      locale,
      ...(locale !== 'en' ? { translationOf: idOf(collection, slug, 'en') } : {}),
      data: build(locale),
      ...(typeof extra === 'function' ? extra(locale) : extra)
    })
  }
}
const mapRep = (arr, fn) => (arr ?? []).map(fn)
const numberedRows = (arr) => mapRep(arr, (x) => ({ number: x.n, title: x.t, text: x.d }))
const titleTextRows = (arr) => mapRep(arr, (x) => ({ title: x.t, text: x.d }))
const statRows = (arr) => mapRep(arr, (x) => ({ value: x.v, label: x.l }))
const kvRows = (arr) => mapRep(arr, (x) => ({ key: x.k, value: x.v }))

// site chrome
singleton('site', 'site', (locale) => {
  const { t, res } = L[locale]
  const c = COMPUTED[locale]
  return {
    title: locale === 'en' ? 'Site chrome (EN)' : 'Site chrome (RU)',
    brand_mark: 'NG',
    brand_name: 'NORTHGATE',
    brand_sub: t.brandSub,
    quote_label: t.quote,
    quote_url: prefix(locale, '/contact'),
    topbar_phone: t.top.phone,
    topbar_email: 'info@northgate-ind.ru',
    topbar_address: t.top.addr,
    home_label: t.home,
    resources_label: res.label,
    // res.kitT ("Marketing Kit") is English on BOTH locales in the source data -- same gap as
    // KIT_LABELS_RU above. "Маркетинг-кит" mirrors the RU admin-facing menu name already chosen
    // for this same section a few lines below (menu('resources_kit', ...).label.ru).
    kit_title: locale === 'ru' ? 'Маркетинг-кит' : res.kitT,
    recent_projects_title: res.projT,
    news_column_title: res.newsT,
    resources_all_label: res.all,
    all_projects_label: c.allProjects,
    all_label: t.proj.filters[0],
    theme_dark_label: c.themeDark,
    theme_light_label: c.themeLight,
    language_name: locale === 'en' ? 'English' : 'Русский',
    footer_text: t.ft.desc,
    footer_legal_1: t.ft.legal1,
    footer_legal_2: t.ft.legal2,
    footer_services_title: t.ft.c1T,
    footer_company_title: t.ft.c2T,
    footer_contact_title: t.ft.c3T,
    hotline: '8 800 550-67-89',
    sales_email: 'sales@northgate-ind.ru',
    hours: t.ct.hoursV,
    footer_book_label: t.ft.book,
    copyright: t.ft.copy.replace(
      /Template running on Joomla 5\.|Шаблон работает на Joomla 5\./u,
      'EmDash CMS Template by Tracy.ai'
    ),
    social: mapRep(t.ct.social, (s) => ({ name: s.n, handle: s.h, url: `https://${s.u}`, text: s.d })),
    search_title: t.sr.h1,
    search_placeholder: t.sr.ph,
    search_button: t.sr.btn,
    search_next: t.sr.next,
    // Source: "17 results for “pre-engineered building” · sorted by relevance" — the number and query are live values here.
    search_results_line: t.sr.line
      .replace(/^\d+|^Найдено \d+/, (m) => m.replace(/\d+/, '{count}'))
      .replace(/[“«][^”»]+[”»]/, (m) => `${m[0]}{query}${m[m.length - 1]}`),
    search_filter_title: t.sr.filterT,
    search_popular_title: t.sr.popT,
    search_popular: mapRep(t.sr.pop, (p) => ({ term: p })),
    not_found_title: t.nf.h1,
    not_found_text: t.nf.p,
    not_found_placeholder: t.nf.ph,
    not_found_back: t.nf.back,
    not_found_suggestions_title: t.nf.sugT,
    // Source links are "#"; only the two that name a real section get a URL (content-gaps G26).
    not_found_suggestions: t.nf.sug.map((label, i) => ({
      label,
      url: i === 1 ? prefix(locale, '/projects') : i === 3 ? prefix(locale, '/careers') : ''
    })),
    slots: Object.entries(t.slots).map(([k, v]) => ({ key: k, text: v }))
  }
})

// projects (needed before home for refs)
const PROJECTS = [
  { slug: 'elektra-lipetsk', sector: 'production', full: true, kind: 'featured' },
  { slug: 'vorsino-phase-3', sector: 'infrastructure', fromHomeSmall: 0, fromMega: 1 },
  { slug: 'obninsk-2-substation', sector: 'energy', fromHomeSmall: 1, fromMega: 2 },
  { slug: 'zavolzhye-logistics-building', sector: 'logistics', fromMega: 3 },
  ...[
    ['sever-2-logistics', 'logistics'],
    ['pharma-cluster-production', 'production'],
    ['retailer-distribution-centre', 'logistics'],
    ['boiler-house-32-mw', 'energy'],
    ['metalworking-shop-refurbishment', 'refurbishment'],
    ['class-a-warehouse-cold-rooms', 'logistics']
  ].map(([slug, sector], i) => ({ slug, sector, fromGrid: i }))
]
PROJECTS.forEach((p, order) => {
  for (const locale of LOCALES) {
    const { t, res, pj } = L[locale]
    let data
    if (p.full) {
      const pr = res.pr,
        big = t.proj.big,
        mega = res.projects[0]
      data = {
        title: pr.h1,
        card_tag: big.tag,
        type_label: pr.cat,
        year: pr.facts.find((x) => /Delivered|Сдан/.test(x.k))?.v ?? '2025',
        area: pr.facts.find((x) => /Area|Площадь/.test(x.k))?.v,
        city: pr.facts.find((x) => /Region|Регион/.test(x.k))?.v,
        summary: big.desc,
        lede: pr.lede,
        facts: kvRows(pr.facts),
        scope_title: pr.scopeT,
        scope: pr.scope.map((item) => ({ item })),
        gallery_title: pr.galT,
        gallery: pr.gal.map((g, i) => ({
          caption: g.c,
          _media: img(g.img, g.c, T('projects', p.slug, locale, `gallery[${i}].image`))
        })),
        quote: pr.quote,
        quote_by: pr.quoteBy,
        cta_label: pr.cta,
        next_title: pr.nextT,
        featured: true,
        sort: order
      }
      img('img/factory-ru-1.png', mega.t, T('projects', p.slug, locale, 'image'))
    } else if (p.fromGrid !== undefined) {
      const it = pj.items[p.fromGrid]
      data = {
        title: it.t,
        card_tag: `${it.cat} · ${it.y}`,
        type_label: it.cat,
        year: it.y,
        area: it.m,
        city: it.city,
        summary: `${it.m} · ${it.city}`,
        featured: false,
        sort: order,
        next_title: res.pr.nextT,
        cta_label: res.pr.cta
      }
      img(it.img, it.t, T('projects', p.slug, locale, 'image'))
    } else {
      const mega = res.projects[p.fromMega]
      const small = p.fromHomeSmall !== undefined ? t.proj.small[p.fromHomeSmall] : null
      const year = (mega.m.match(/\d{4}/) ?? [''])[0]
      // The mega-menu meta is "<area or type> · <year>": a measure ("24,000 m²", "48 ha") is the area
      // and the card badge falls back to the sector term; a word ("Utilities") is the type label.
      const head = mega.m.split(' · ')[0]
      const headIsMeasure = /\d/.test(head)
      data = {
        title: small?.title ?? mega.t,
        card_tag: small?.tag ?? mega.m,
        type_label: small ? small.tag.split(' · ')[0] : headIsMeasure ? '' : head,
        year,
        area: headIsMeasure ? head : '',
        city: '',
        summary: small?.desc ?? mega.m,
        featured: p.fromHomeSmall !== undefined,
        sort: order,
        next_title: res.pr.nextT,
        cta_label: res.pr.cta
      }
      img(mega.img, mega.t, T('projects', p.slug, locale, 'image'))
    }
    push('projects', {
      id: idOf('projects', p.slug, locale),
      slug: p.slug,
      status: 'published',
      locale,
      ...(locale !== 'en' ? { translationOf: idOf('projects', p.slug, 'en') } : {}),
      data,
      taxonomies: { sector: [p.sector] }
    })
  }
})

// services (six from the Services page)
D.SV_EN.services.forEach((s, i) => {
  const slug = slugify(s.t)
  for (const locale of LOCALES) {
    const x = L[locale].sv.services[i]
    push('services', {
      id: idOf('services', slug, locale),
      slug,
      status: 'published',
      locale,
      ...(locale !== 'en' ? { translationOf: idOf('services', slug, 'en') } : {}),
      data: { title: x.t, description: x.d, includes: x.inc.map((item) => ({ item })), term: x.term, sort: i }
    })
  }
})

// posts
const POSTS = [
  {
    slug: slugify(D.EN.blog.feat.title),
    src: (l) => ({
      title: L[l].t.blog.feat.title,
      excerpt: L[l].t.blog.feat.desc,
      meta: L[l].t.blog.feat.meta,
      img: 'img/blog-feat-2.png'
    }),
    category: 'disclosures',
    featured: true,
    date: '12 Aug 2026'
  },
  {
    slug: slugify(D.EN.art.h1),
    art: true,
    category: 'engineering',
    date: '28 Jul 2026',
    img: 'img/art-hero-2.png'
  },
  { slug: slugify(D.EN.blog.posts[1].title), post: 1, category: 'company', date: '3 Jul 2026' },
  { slug: slugify(D.EN.blog.posts[2].title), post: 2, category: 'projects', date: '19 Jun 2026' },
  { slug: slugify(D.EN.blog.posts[3].title), post: 3, category: 'engineering', date: '2 Jun 2026' },
  { slug: slugify(D.EN.blog.side.latest[0].t), latest: 0, category: 'engineering', date: '21 May 2026' },
  { slug: slugify(D.EN.blog.side.latest[1].t), latest: 1, category: 'engineering', date: '9 May 2026' },
  { slug: slugify(D.EN.blog.side.latest[2].t), latest: 2, category: 'engineering', date: '27 Apr 2026' },
  { slug: slugify(D.EN.art.related[2].t), related: 2, category: 'projects', date: '15 Apr 2026' },
  // Disclosures come from the Investors table, which has no pictures; as posts they sit in the news
  // list next to illustrated ones, and a placeholder there is a defect (Lee, 2026-09-14: a missing
  // picture is a bug). They borrow source photos that fit the notice.
  {
    slug: slugify(D.IR_EN.disclosures[1].t),
    disc: 1,
    category: 'disclosures',
    date: '26 Jun 2026',
    img: 'img/team-crew.png'
  },
  {
    slug: slugify(D.IR_EN.disclosures[2].t),
    disc: 2,
    category: 'disclosures',
    date: '3 Jun 2026',
    img: 'img/factory-1.png'
  },
  {
    slug: slugify(D.IR_EN.disclosures[3].t),
    disc: 3,
    category: 'disclosures',
    date: '26 Jun 2026',
    img: 'img/proj-2.png'
  }
]
for (const p of POSTS) {
  for (const locale of LOCALES) {
    const { t, ir } = L[locale]
    let data, tags
    if (p.art) {
      const a = t.art
      const fig = (i) => ({
        _type: 'image',
        _key: key(),
        alt: a[`fig${i}`],
        caption: a[`fig${i}`],
        _media: img(`img/art-fig${i}.png`, a[`fig${i}`], null)
      })
      const contentBlocks = [
        block(a.p0),
        block(a.h2a, 'h2'),
        block(a.p1),
        block(a.quote, 'blockquote'),
        block(a.h2b, 'h2'),
        block(a.p2),
        ...a.bullets.map(bullet),
        block(a.h2c, 'h2'),
        block(a.p3),
        fig(1),
        fig(2),
        block(a.h2d, 'h2'),
        block(a.p4)
      ]
      contentBlocks.forEach((b, i) => {
        if (b._type === 'image') {
          media.get(b._media).targets.push(T('posts', p.slug, locale, `content[${i}].asset`))
          delete b._media
        }
      })
      data = {
        title: a.h1,
        short_title: a.bcTitle,
        lede: a.lede,
        excerpt: t.blog.posts[0].desc,
        caption: a.caption,
        author: a.author,
        author_role: a.meta.split(' · ')[0],
        date: isoDate(p.date),
        reading_time: readingMinutes(a.meta),
        content: contentBlocks,
        featured: false,
        downloads: a.downloads.map((d) => ({ title: d.t, format: d.f, url: '' })),
        toc: a.toc.map((label) => ({ label }))
      }
      img(
        typeof p.img === 'function' ? p.img(locale) : p.img,
        a.h1,
        T('posts', p.slug, locale, 'featured_image')
      )
      tags = tagSlugs
    } else {
      let title,
        excerpt,
        author = '',
        image = null
      if (p.src) {
        const s = p.src(locale)
        title = s.title
        excerpt = s.excerpt
        author = s.meta.split(' · ')[1]
        image = s.img
      } else if (p.post !== undefined) {
        const x = t.blog.posts[p.post]
        title = x.title
        excerpt = x.desc
        image = x.img
      } else if (p.latest !== undefined) {
        const x = t.blog.side.latest[p.latest]
        title = x.t
        excerpt = ''
        image = x.img
      } else if (p.related !== undefined) {
        const x = t.art.related[p.related]
        title = x.t
        excerpt = ''
        image = x.img
      } else if (p.disc !== undefined) {
        const x = ir.disclosures[p.disc]
        title = x.t
        excerpt = ''
        image = p.img
      }
      data = {
        title,
        short_title: title,
        excerpt,
        author,
        date: isoDate(p.date),
        reading_time: p.src ? readingMinutes(p.src(locale).meta) : 0,
        content: [block(excerpt || title)],
        featured: !!p.featured
      }
      if (image) img(image, title, T('posts', p.slug, locale, 'featured_image'))
    }
    push('posts', {
      id: idOf('posts', p.slug, locale),
      slug: p.slug,
      status: 'published',
      locale,
      ...(locale !== 'en' ? { translationOf: idOf('posts', p.slug, 'en') } : {}),
      data,
      taxonomies: { category: [p.category], ...(tags ? { tag: tags } : {}) }
    })
  }
}

// vacancies
D.CAR_EN.jobs.forEach((j, i) => {
  const slug = slugify(j.t)
  const dept = deptSlugs[D.CAR_EN.filters.slice(1).indexOf(j.dep)]
  for (const locale of LOCALES) {
    const x = L[locale].car.jobs[i]
    push('vacancies', {
      id: idOf('vacancies', slug, locale),
      slug,
      status: 'published',
      locale,
      ...(locale !== 'en' ? { translationOf: idOf('vacancies', slug, 'en') } : {}),
      data: { title: x.t, city: x.city, type: x.type, pay: x.pay, sort: i },
      taxonomies: { department: [dept] }
    })
  }
})

// home
singleton('home', 'home', (locale) => {
  const { t } = L[locale]
  img('img/hero-ru.png', t.slots.hero, T('home', 'home', locale, 'hero_image'))
  // G7: "Download company profile (PDF)" has no target in the source; the locale's corporate deck
  // is the one real file with that name. The importer writes its URL into hero_cta2_url.
  img(`decks/${locale}/corporate-2026.pdf`, t.hero.cta2, T('home', 'home', locale, 'hero_cta2_url'))
  img('img/team-crew.png', t.slots.team, T('home', 'home', locale, 'about_image'))
  return {
    title: locale === 'en' ? 'Home' : 'Главная',
    hero_badge: t.hero.badge,
    hero_title_a: t.hero.h1a,
    hero_title_b: t.hero.h1b,
    hero_text: t.hero.p,
    hero_cta1_label: t.hero.cta1,
    hero_cta1_url: prefix(locale, '/services'),
    hero_cta2_label: t.hero.cta2,
    hero_cta2_url: '', // G7: filled by the importer with the corporate deck media URL
    stats: statRows(t.stats),
    services_eyebrow: t.svc.eyebrow,
    services_title: t.svc.h2,
    services_all_label: t.svc.all,
    services_all_url: prefix(locale, '/services'),
    services_items: numberedRows(t.svc.items),
    projects_title: t.proj.h2,
    project_big: `$ref:${idOf('projects', 'elektra-lipetsk', locale)}`,
    project_small_1: `$ref:${idOf('projects', 'vorsino-phase-3', locale)}`,
    project_small_2: `$ref:${idOf('projects', 'obninsk-2-substation', locale)}`,
    why_eyebrow: t.why.eyebrow,
    why_title: t.why.h2,
    why_items: titleTextRows(t.why.items),
    band_title: t.band.h2,
    band_text: t.band.p,
    band_button: t.band.btn,
    band_url: prefix(locale, '/contact'),
    news_title: t.news.h2,
    news_all_label: t.news.all,
    clients_label: t.clients,
    client_logos: [1, 2, 3, 4, 5].map((i) => ({
      name: `Logo ${i}`,
      _media: img(`img/logo-ru-${i}.png`, 'Logo', T('home', 'home', locale, `client_logos[${i - 1}].logo`))
    }))
  }
})

singleton('about', 'about', (locale) => {
  const { ab, t } = L[locale]
  img('img/factory-ru-1.png', t.slots.project, T('about', 'about', locale, 'hero_image'))
  img('img/map-ru.png', t.slots.map, T('about', 'about', locale, 'map_image'))
  img('img/safety-1.png', ab.safeT, T('about', 'about', locale, 'safety_image'))
  return {
    title: ab.h1,
    breadcrumb: ab.bc,
    lede: ab.lede,
    stats_title: ab.statsT,
    stats: statRows(ab.stats),
    mission_title: ab.missT,
    mission_text: ab.missP,
    pillars: titleTextRows(ab.pillars),
    history_title: ab.histT,
    history: ab.hist.map((h) => ({ year: h.y, title: h.t, text: h.d })),
    geo_title: ab.geoT,
    geo_text: ab.geoP,
    geo_list: ab.geoList.map((g) => ({ city: g.c, role: g.r })),
    team_title: ab.teamT,
    team: ab.team.map((m, i) => ({
      name: m.n,
      role: m.r,
      text: m.d,
      _media: img('img/team-crew.png', t.slots.team, T('about', 'about', locale, `team[${i}].photo`))
    })),
    cert_title: ab.certT,
    certs: titleTextRows(ab.certs),
    safety_title: ab.safeT,
    safety_text: ab.safeP,
    cta_title: ab.ctaT,
    cta_text: ab.ctaP,
    cta_button: ab.ctaBtn,
    cta_url: prefix(locale, '/contact'),
    cta_alt_label: ab.ctaAlt,
    cta_alt_url: prefix(locale, '/projects')
  }
})

singleton('services_page', 'services', (locale) => {
  const { sv, pj } = L[locale]
  return {
    title: sv.h1,
    breadcrumb: sv.bc,
    lede: sv.lede,
    stats: statRows(sv.stats),
    services_title: sv.svT,
    includes_label: sv.incL,
    process_title: sv.procT,
    process: numberedRows(sv.proc),
    pricing_title: sv.pricT,
    pricing_text: sv.pricP,
    pricing: sv.pric.map((p) => ({ title: p.t, value: p.v, text: p.d })),
    cta_title: sv.ctaT,
    cta_text: sv.ctaP,
    cta_button: sv.ctaBtn,
    cta_url: prefix(locale, '/contact'),
    cta_alt_label: pj.bc,
    cta_alt_url: prefix(locale, '/projects')
  }
})

singleton('projects_page', 'projects', (locale) => {
  const { pj, sv } = L[locale]
  // The flagship panel shows its own picture (tp-pjp-feat, img/proj-big.png), not the project's card image.
  img('img/proj-big.png', pj.feat.t, T('projects_page', 'projects', locale, 'featured_image'))
  return {
    title: pj.h1,
    breadcrumb: pj.bc,
    lede: pj.lede,
    featured_label: pj.featLabel,
    featured_project: `$ref:${idOf('projects', 'elektra-lipetsk', locale)}`,
    featured_title: pj.feat.t,
    featured_text: pj.feat.d,
    featured_facts: kvRows(pj.feat.facts),
    featured_cta: pj.feat.cta,
    grid_title: pj.gridT,
    grid_text: pj.gridP,
    view_label: pj.view,
    sectors_title: pj.secT,
    sectors: pj.sectors.map((s, i) => ({ sector: sectorSlugs[i], title: s.t, count: s.n, text: s.d })),
    how_title: pj.howT,
    how: numberedRows(pj.how),
    cta_title: pj.ctaT,
    cta_text: pj.ctaP,
    cta_button: pj.ctaBtn,
    cta_url: prefix(locale, '/contact'),
    cta_alt_label: sv.bc,
    cta_alt_url: prefix(locale, '/services')
  }
})

singleton('news_page', 'news', (locale) => {
  const { t } = L[locale]
  const b = t.blog,
    a = t.art
  return {
    title: b.h1,
    breadcrumb: b.bc,
    lede: b.sub,
    count_label: b.count.replace(/\d+/, '{count}'),
    page_meta: b.pageMeta.replace(/\d+/, '{page}').replace(/\d+/, '{pages}').replace(/\d+/, '{perPage}'),
    featured_label: b.feat.label.split(' · ')[0],
    all_label: b.filters[0],
    sidebar_search_title: b.side.searchT,
    sidebar_search_placeholder: b.side.searchPh,
    categories_title: b.side.catT,
    latest_title: b.side.latestT,
    newsletter_title: b.side.nlT,
    newsletter_text: b.side.nlP,
    newsletter_placeholder: b.side.nlPh,
    newsletter_button: b.side.nlBtn,
    tags_label: a.tagsLabel,
    prev_label: a.prevLabel,
    next_label: a.nextLabel,
    related_title: a.relatedH,
    toc_title: a.tocT,
    downloads_title: a.dlT,
    aside_title: a.asideT,
    aside_text: a.asideP,
    aside_button: a.asideBtn,
    aside_url: prefix(locale, '/contact')
  }
})

singleton('careers', 'careers', (locale) => {
  const { car, t } = L[locale]
  img('img/team-crew.png', t.slots.team, T('careers', 'careers', locale, 'hero_image'))
  // D33: the canvas mocks "Show all 19 roles" and a "19 / Open roles" stat while it lists six
  // vacancies. The count must be the real one, so both strings become templates: `{n}` is filled
  // by the Careers view from the published `vacancies` collection. The RU noun stays in the form
  // the source used (genitive plural, right for 5-20); an editor adjusts the label if the count
  // moves into the 2-4 range.
  const mockCount = car.more.match(/\d+/)?.[0]
  return {
    title: car.h1,
    breadcrumb: car.bc,
    lede: car.lede,
    stats: statRows(car.stats).map((s) => (s.value === mockCount ? { ...s, value: '{n}' } : s)),
    open_title: car.openT,
    all_label: car.filters[0],
    apply_label: car.apply,
    more_label: car.more.replace(/\d+/, '{n}'),
    benefits_title: car.benT,
    benefits: titleTextRows(car.benefits),
    process_title: car.procT,
    steps: numberedRows(car.steps),
    life_title: car.lifeT,
    life: car.life.map((g, i) => ({
      caption: g.c,
      _media: img(g.img, g.c, T('careers', 'careers', locale, `life[${i}].image`))
    })),
    quote: car.quote,
    quote_by: car.quoteBy,
    cta_title: car.ctaT,
    cta_text: car.ctaP,
    cta_button: car.ctaBtn,
    cta_url: `mailto:${car.ctaMail}`,
    cta_mail: car.ctaMail
  }
})

singleton('investors', 'investors', (locale) => {
  const { ir, t } = L[locale]
  return {
    title: ir.h1,
    breadcrumb: ir.bc,
    ticker: ir.ticker,
    lede: ir.lede,
    quote: kvRows(ir.quote2),
    fin_title: ir.finT,
    fin_note: ir.finNote,
    fin_headers: ir.th.map((label) => ({ label })),
    fin_rows: ir.rows.map((r) => ({ metric: r.a, a: r.b, b: r.c, change: r.d })),
    reports_title: ir.repT,
    reports: ir.reports.map((r) => ({ title: r.t, format: r.f, date: r.d, url: '' })),
    disclosures_title: ir.discT,
    dividends_title: ir.divT,
    dividends_text: ir.divP,
    dividends: ir.div.map((d) => ({ period: d.y, value: d.v, status: d.s })),
    calendar_title: ir.calT,
    calendar: ir.cal.map((c) => ({ date: c.d, text: c.t })),
    governance_title: ir.govT,
    governance: ir.gov.map((label) => ({ label, url: '' })),
    contact_title: ir.contactT,
    contact_name: ir.contactName,
    contact_mail: ir.contactMail,
    contact_phone: ir.contactPhone,
    subscribe_placeholder: t.blog.side.nlPh,
    subscribe_button: ir.sub
  }
})

singleton('contact', 'contact', (locale) => {
  const { t } = L[locale]
  const c = t.ct
  img('img/map-ru.png', t.slots.map, T('contact', 'contact', locale, 'map_image'))
  return {
    title: c.h1,
    lede: c.sub,
    notice: c.notice,
    form: `quote-request-${locale}`,
    reset_label: c.reset,
    hq_title: c.hqT,
    hq_address_1: c.hqAddr1,
    hq_address_2: c.hqAddr2,
    // The source (Contact.html line 700) has the Russian string "Горячая линия" hardcoded in BOTH locale
    // markups — a slip in the mock, not a design intent. Translate for EN, keep the RU string as-is.
    hotline_label: locale === 'ru' ? 'Горячая линия' : 'Hotline',
    sales_label: c.sales,
    hours_label: c.hours,
    branches_title: c.branchT,
    branches: c.branches.map((b) => ({ city: b.city, address: b.addr })),
    social_title: c.socialT,
    social_text: c.socialP
  }
})

// D32: Terms and Privacy. The canvas drew only their titles, so this copy is Tracy's — generic
// legal SAMPLE TEXT in the Northgate demo voice, EN + RU, not legal advice. A customer replaces it
// with their own wording (in the admin, the `content` field of pages/terms and pages/privacy)
// before going live. Company facts (name, address, e-mails) come from the source strings so the
// pages agree with the footer and the contact page.
// A paragraph with one link mark: [before, linkText, after, href].
const linkedBlock = ([a, l, b, href]) => {
  const def = { _key: key(), _type: 'link', href }
  return { ...block(''), markDefs: [def], children: [span(a), { ...span(l), marks: [def._key] }, span(b)] }
}
const legalBlocks = (sections) =>
  sections.flatMap((sec) => [
    block(sec.h, 'h2'),
    ...sec.p.map((x) => (Array.isArray(x) ? linkedBlock(x) : block(x))),
    ...(sec.bullets ?? []).map(bullet)
  ])
const LEGAL = {
  terms: {
    en: {
      lede: 'These terms apply to the use of the Northgate Industrial website and the materials published on it. Please read them before using the site.',
      sections: [
        {
          h: '1. Use of the site',
          p: [
            `This website is operated by ${D.EN.ft.desc.split('.')[0]} (“Northgate”, “we”), ${D.EN.ft.legal2}. By using the site you accept these terms; if you do not agree with them, please do not use the site.`,
            'You may browse the site and download the documents we publish for your own information. You must not disrupt the site, probe it for vulnerabilities, or copy its content in bulk with automated tools.'
          ]
        },
        {
          h: '2. Content and intellectual property',
          p: [
            'Texts, drawings, photographs, project descriptions and the Northgate mark belong to Northgate or are used under licence. Short excerpts may be quoted with attribution and a link to the source page; any other reproduction requires our written consent.',
            'Project figures and dates describe completed work as of the date of publication. They are not a promise that a future project will be delivered on the same terms.'
          ]
        },
        {
          h: '3. Quotes and estimates',
          p: [
            'Figures in our published price guides, the online estimate and replies to the request form are indicative. A binding offer is made only in a signed contract, after a site survey and a review of your design documents.'
          ],
          bullets: [
            'An estimate is valid for 30 calendar days from the date it is issued.',
            'Prices exclude VAT unless stated otherwise.',
            'Changes to the scope, the site conditions or the design documents may change the price.'
          ]
        },
        {
          h: '4. Liability',
          p: [
            'We keep the site accurate and available, but we do not warrant that it is free of errors or interruptions. To the extent permitted by law, Northgate is not liable for loss arising from reliance on the site’s content or from its unavailability. Nothing in these terms limits liability that cannot be limited by law.'
          ]
        },
        {
          h: '5. Personal data',
          p: [
            [
              'How we handle personal data submitted through the request form, the newsletter and the careers page is described in our ',
              'Privacy policy',
              ', which forms part of these terms.',
              prefix('en', '/privacy')
            ]
          ]
        },
        {
          h: '6. Governing law and contact',
          p: [
            'These terms are governed by the law of the Russian Federation. Disputes are referred to the courts at the registered address of Northgate unless the law provides otherwise. We may update these terms; the date of the current version is shown in the page revision history.',
            `Questions about these terms: ${D.EN.ct.hqT.toLowerCase()}, ${D.EN.ct.hqAddr1}, ${D.EN.ct.hqAddr2}, or by e-mail at ${D.IR_EN.contactMail.replace('ir@', 'info@')}.`
          ]
        }
      ]
    },
    ru: {
      lede: 'Настоящие условия регулируют использование сайта «Норткейт Индастриал» и размещённых на нём материалов. Ознакомьтесь с ними перед использованием сайта.',
      sections: [
        {
          h: '1. Использование сайта',
          p: [
            `Сайт принадлежит ${D.RU.ft.desc.split('.')[0]} («Норткейт», «мы»), ${D.RU.ft.legal2}. Используя сайт, вы принимаете настоящие условия; если вы с ними не согласны, пожалуйста, не пользуйтесь сайтом.`,
            'Вы можете просматривать сайт и скачивать опубликованные документы для собственного ознакомления. Запрещено нарушать работу сайта, искать в нём уязвимости и массово копировать его содержимое автоматическими средствами.'
          ]
        },
        {
          h: '2. Содержание и интеллектуальная собственность',
          p: [
            'Тексты, чертежи, фотографии, описания объектов и знак «Норткейт» принадлежат компании или используются по лицензии. Короткие цитаты допускаются с указанием источника и ссылкой на страницу; иное воспроизведение требует нашего письменного согласия.',
            'Показатели и сроки объектов описывают завершённые работы на дату публикации и не являются обещанием, что будущий объект будет выполнен на тех же условиях.'
          ]
        },
        {
          h: '3. Сметы и оценки стоимости',
          p: [
            'Цифры в опубликованных прайс-листах, онлайн-оценке и ответах на запрос через форму носят ориентировочный характер. Обязательное предложение делается только в подписанном договоре — после выезда на площадку и изучения вашей проектной документации.'
          ],
          bullets: [
            'Смета действительна 30 календарных дней с даты выдачи.',
            'Цены указаны без НДС, если не оговорено иное.',
            'Изменение объёма работ, условий площадки или проектной документации может изменить стоимость.'
          ]
        },
        {
          h: '4. Ответственность',
          p: [
            'Мы поддерживаем точность и доступность сайта, но не гарантируем отсутствие ошибок и перерывов в работе. В пределах, допускаемых законом, «Норткейт» не отвечает за убытки, возникшие из-за использования информации с сайта или его недоступности. Настоящие условия не ограничивают ответственность, которая не может быть ограничена законом.'
          ]
        },
        {
          h: '5. Персональные данные',
          p: [
            [
              'Порядок обработки персональных данных, переданных через форму запроса, подписку на рассылку и страницу вакансий, описан в нашей ',
              'Политике конфиденциальности',
              ', которая является частью настоящих условий.',
              prefix('ru', '/privacy')
            ]
          ]
        },
        {
          h: '6. Применимое право и контакты',
          p: [
            'Настоящие условия регулируются законодательством Российской Федерации. Споры рассматриваются в суде по месту регистрации «Норткейт», если законом не предусмотрено иное. Мы можем обновлять условия; дата действующей редакции видна в истории изменений страницы.',
            `Вопросы по условиям: ${D.RU.ct.hqT.toLowerCase()}, ${D.RU.ct.hqAddr1}, ${D.RU.ct.hqAddr2}, или по электронной почте ${D.IR_RU.contactMail.replace('ir@', 'info@')}.`
          ]
        }
      ]
    }
  },
  privacy: {
    en: {
      lede: 'How Northgate Industrial collects and uses personal data received through this website, and the rights you have over it.',
      sections: [
        {
          h: '1. What we collect',
          p: [
            'We collect only what a request needs. The request form asks for your name, company, e-mail, phone and a description of the project, plus any drawings you attach. The newsletter form asks for an e-mail address. The careers page passes the role you chose to the contact form; a CV sent to our HR address is kept with the application.',
            'The site records the usual technical data of a visit — IP address, browser, pages viewed and the time of the visit — in server logs.'
          ]
        },
        {
          h: '2. Why we use it',
          p: ['We process this data to:'],
          bullets: [
            'answer a request for a quote or a site survey and prepare an estimate;',
            'send the newsletter you subscribed to, with an unsubscribe link in every issue;',
            'consider a job application and contact you about it;',
            'keep the site secure and understand which pages are used.'
          ]
        },
        {
          h: '3. How long we keep it',
          p: [
            'Request data is kept for the time needed to answer and, where a contract follows, for the life of the contract and the statutory retention period after it. Newsletter addresses are kept until you unsubscribe. CVs are kept for one year after the vacancy closes unless you ask us to delete them sooner. Server logs are kept for 90 days.'
          ]
        },
        {
          h: '4. Who we share it with',
          p: [
            'We do not sell personal data. It is shared only with the service providers that run our e-mail, hosting and newsletter delivery, under contracts that limit its use, and with authorities where the law requires it. Data is stored on servers in the Russian Federation.'
          ]
        },
        {
          h: '5. Your rights',
          p: ['Under Federal Law 152-FZ you may:'],
          bullets: [
            'ask what data we hold about you and receive a copy;',
            'have inaccurate data corrected;',
            'withdraw consent and ask us to delete your data, unless we must keep it by law;',
            'unsubscribe from the newsletter at any time using the link in the message.'
          ]
        },
        {
          h: '6. Contact',
          p: [
            `Requests about personal data go to ${D.IR_EN.contactMail.replace('ir@', 'privacy@')} or by post to ${D.EN.ct.hqAddr1}, ${D.EN.ct.hqAddr2}. We answer within 30 days. This policy may be updated; the current version is the one published on this page.`
          ]
        }
      ]
    },
    ru: {
      lede: 'Как «Норткейт Индастриал» собирает и использует персональные данные, полученные через этот сайт, и какие права у вас есть в отношении этих данных.',
      sections: [
        {
          h: '1. Какие данные мы собираем',
          p: [
            'Мы собираем только то, что нужно для ответа на обращение. Форма запроса просит указать имя, компанию, электронную почту, телефон и описание объекта, а также принимает приложенные чертежи. Форма подписки запрашивает адрес электронной почты. Страница вакансий передаёт выбранную должность в форму обращения; резюме, отправленное на адрес отдела кадров, хранится вместе с откликом.',
            'Сайт фиксирует обычные технические данные визита — IP-адрес, браузер, просмотренные страницы и время посещения — в журналах сервера.'
          ]
        },
        {
          h: '2. Для чего мы их используем',
          p: ['Мы обрабатываем данные, чтобы:'],
          bullets: [
            'ответить на запрос сметы или выезда на площадку и подготовить оценку;',
            'отправлять рассылку, на которую вы подписались, — в каждом письме есть ссылка для отписки;',
            'рассмотреть отклик на вакансию и связаться с вами;',
            'поддерживать безопасность сайта и понимать, какие страницы востребованы.'
          ]
        },
        {
          h: '3. Сколько мы их храним',
          p: [
            'Данные запроса хранятся столько, сколько нужно для ответа, а при заключении договора — в течение срока договора и установленного законом срока после него. Адреса рассылки хранятся до отписки. Резюме хранятся один год после закрытия вакансии, если вы не попросите удалить их раньше. Журналы сервера хранятся 90 дней.'
          ]
        },
        {
          h: '4. Кому мы их передаём',
          p: [
            'Мы не продаём персональные данные. Они передаются только подрядчикам, обеспечивающим работу почты, хостинга и доставки рассылки, по договорам, ограничивающим их использование, а также государственным органам в случаях, предусмотренных законом. Данные хранятся на серверах в Российской Федерации.'
          ]
        },
        {
          h: '5. Ваши права',
          p: ['В соответствии с Федеральным законом 152-ФЗ вы можете:'],
          bullets: [
            'запросить сведения о том, какие данные о вас мы храним, и получить их копию;',
            'потребовать исправить неточные данные;',
            'отозвать согласие и попросить удалить данные, если закон не обязывает нас их хранить;',
            'отписаться от рассылки в любой момент по ссылке в письме.'
          ]
        },
        {
          h: '6. Контакты',
          p: [
            `Обращения по персональным данным направляйте на ${D.IR_RU.contactMail.replace('ir@', 'privacy@')} или почтой по адресу: ${D.RU.ct.hqAddr1}, ${D.RU.ct.hqAddr2}. Мы отвечаем в течение 30 дней. Политика может обновляться; действующей является редакция, опубликованная на этой странице.`
          ]
        }
      ]
    }
  }
}

// generic pages: legal + kit
for (const [slug, template, buildSample, titles] of [
  ['terms', 'default', null, { en: D.EN.ft.legalLinks[0], ru: D.RU.ft.legalLinks[0] }],
  ['privacy', 'default', null, { en: D.EN.ft.legalLinks[1], ru: D.RU.ft.legalLinks[1] }],
  [
    'kit-newsletter',
    'kit-newsletter',
    (l) => L[l].res.nl,
    { en: D.EN.gd && D.RES_EN.nl.h1, ru: D.RES_RU.nl.h1 }
  ],
  ['kit-email', 'kit-email', (l) => L[l].res.em, { en: D.RES_EN.em.h1, ru: D.RES_RU.em.h1 }],
  [
    'kit-form',
    'kit-form',
    (l) => ({ ...L[l].res.fm, callPh: '+7 (___) ___-__-__' }),
    { en: D.RES_EN.fm.h1, ru: D.RES_RU.fm.h1 }
  ],
  ['kit-slides', 'kit-slides', (l) => L[l].res.dk, { en: D.RES_EN.dk.h1, ru: D.RES_RU.dk.h1 }],
  [
    'kit-style-guide',
    'kit-style-guide',
    (l) => ({
      ...L[l].t.gd,
      sample2: L[l].t.proj.h2,
      body: L[l].t.art.p0,
      eyebrow: L[l].t.svc.eyebrow,
      meta: L[l].t.art.meta
    }),
    { en: D.EN.gd.h1, ru: D.RU.gd.h1 }
  ]
]) {
  singleton('pages', slug, (locale) => {
    const sample = buildSample ? JSON.parse(JSON.stringify(buildSample(locale))) : undefined
    if (slug === 'kit-slides') {
      // Decks are real files: register as media, the importer replaces `href` with the media URL.
      sample.decks.forEach((d, i) => {
        d._media = img(d.href, d.t, T('pages', slug, locale, `sample.decks[${i}].href`))
        delete d.href
      })
      sample.slides.forEach((s, i) => {
        s.page = i + 1
      })
      // Slide thumbnails that carry a picture in the source (tp-sl-case, tp-sl-map).
      for (const [kind, file] of [
        ['case', 'img/factory-ru-1.png'],
        ['map', 'img/map-ru.png']
      ]) {
        const i = sample.slides.findIndex((s) => s.kind === kind)
        if (i >= 0)
          img(file, sample.slides[i].t ?? kind, T('pages', slug, locale, `sample.slides[${i}].image`))
      }
    }
    // Kit pictures the source draws through image-slots (tp-nl-hero, tp-gd-1/2/3): registered as
    // media targets so the importer fills `sample.image` / `sample.frames.*` after upload.
    if (slug === 'kit-newsletter')
      img('img/proj-ru-2.png', sample.leadT, T('pages', slug, locale, 'sample.image'))
    if (slug === 'kit-style-guide')
      for (const [key, file] of [
        ['ratio16', 'img/gd-1.png'],
        ['contain', 'img/gd-2.png'],
        ['avatar', 'img/gd-3.png']
      ])
        img(
          file,
          sample[key === 'ratio16' ? 'im1' : key === 'contain' ? 'im2' : 'im3'] ?? key,
          T('pages', slug, locale, `sample.frames.${key}`)
        )
    const legal = LEGAL[slug]?.[locale]
    return {
      title: titles[locale],
      lede: sample?.sub ?? legal?.lede ?? '',
      template,
      content: legal ? legalBlocks(legal.sections) : [],
      ...(sample ? { sample } : {})
    }
  })
}

// Strip the builder-only `_media` markers now that targets are registered.
function strip(v) {
  if (Array.isArray(v)) return v.map(strip)
  if (v && typeof v === 'object') {
    const o = {}
    for (const [k, x] of Object.entries(v)) if (k !== '_media') o[k] = strip(x)
    return o
  }
  return v
}
for (const list of Object.values(content)) for (const e of list) e.data = strip(e.data)

// ───────────────────────── menus ─────────────────────────
const menus = []
function menu(name, label, items) {
  for (const locale of LOCALES) {
    menus.push({
      id: `menu:${name}:${locale}`,
      name,
      label: label[locale] ?? label.en,
      locale,
      ...(locale !== 'en' ? { translationOf: `menu:${name}:en` } : {}),
      items: items(locale).map(([labelText, url]) => ({ type: 'custom', label: labelText, url }))
    })
  }
}
const NAV_PATHS = ['/', '/about', '/services', '/projects', '/news', '/contact']
menu('primary', { en: 'Primary navigation', ru: 'Главное меню' }, (l) =>
  L[l].t.nav.map((label, i) => [label, prefix(l, NAV_PATHS[i])])
)
menu('topbar', { en: 'Topbar links', ru: 'Верхняя панель' }, (l) => [
  [L[l].t.top.careers, prefix(l, '/careers')],
  [L[l].t.top.investors, prefix(l, '/investors')]
])
const KIT_PATHS = {
  newsletter: '/kit/newsletter',
  email: '/kit/email',
  form: '/kit/form',
  desk: '/kit/slides',
  guide: '/kit/style-guide',
  404: '/404'
}
// The source data (RES_RU.kit[].t) has these 6 labels in English on BOTH locales -- the mock never
// localised the mega-menu item names, only their descriptions (k.d). Plain Russian translations
// below: "Стайлгайд" is the RU source's own word for "Style guide" (RU.gd.h1), "Рассылка"/"Формы"/
// "Слайды" match the RU h1 of their own kit pages (RES_RU.nl.h1, .fm.h1, .dk.h1). "Письмо" for the
// email-kit item has no dedicated source word (that page's mega menu is data-driven) -- chosen to
// match RES_RU.em.h1 "Транзакционные письма" (transactional letters) and read distinctly from
// "Рассылка" (mass mailing) right above it. "404" is kept as-is: a status code, not a translation gap.
const KIT_LABELS_RU = {
  newsletter: 'Рассылка',
  email: 'Письмо',
  form: 'Формы',
  desk: 'Слайды',
  guide: 'Стайлгайд',
  404: '404'
}
menu('resources_kit', { en: 'Resources: marketing kit', ru: 'Ресурсы: маркетинг-кит' }, (l) =>
  L[l].res.kit.map((k) => [l === 'ru' ? KIT_LABELS_RU[k.page] : k.t, prefix(l, KIT_PATHS[k.page])])
)
// Footer column 1 links to the services page: the four labels are the home page's own service cards, not entries (content-gaps G9).
menu('footer_services', { en: 'Footer: services', ru: 'Подвал: услуги' }, (l) =>
  L[l].t.ft.c1.map((label) => [label, prefix(l, '/services')])
)
const COMPANY_PATHS = ['/about', '/projects', '/news', '/careers', '/investors']
menu('footer_company', { en: 'Footer: company', ru: 'Подвал: компания' }, (l) =>
  L[l].t.ft.c2.map((label, i) => [label, prefix(l, COMPANY_PATHS[i])])
)
const LEGAL_PATHS = ['/terms', '/privacy', '/sitemap']
menu('footer_legal', { en: 'Footer: legal', ru: 'Подвал: юридическое' }, (l) =>
  L[l].t.ft.legalLinks.map((label, i) => [label, prefix(l, LEGAL_PATHS[i])])
)

// ───────────────────────── assemble ─────────────────────────
const seed = {
  $schema: 'https://emdashcms.com/seed.schema.json',
  version: '1',
  defaultLocale: 'en',
  meta: {
    name: 'Northgate Industrial',
    description: 'Tracy EmDash template built from the Northgate Industrial design source (EN/RU).',
    author: 'Tracy'
  },
  settings: { title: 'Northgate Industrial', tagline: D.EN.brandSub, postsPerPage: 4 },
  collections,
  taxonomies,
  menus,
  redirects: [],
  widgetAreas: [],
  sections: [],
  content
}
writeFileSync(path.join(OUT, 'seed.json'), JSON.stringify(seed, null, '\t') + '\n')

// media map + copies
const mediaList = [...media.values()]
if (SOURCE_DIR) {
  mkdirSync(path.join(OUT, 'media'), { recursive: true })
  for (const m of mediaList) {
    const from = path.join(SOURCE_DIR, m.file)
    if (!existsSync(from)) throw new Error(`media missing in source: ${m.file}`)
    const to = path.join(OUT, 'media', m.file)
    mkdirSync(path.dirname(to), { recursive: true })
    copyFileSync(from, to)
    m.sha256 = sha(to)
    m.copied = `media/${m.file}`
  }
}
writeFileSync(
  path.join(OUT, 'media-map.json'),
  JSON.stringify(
    { generatedAt: new Date().toISOString(), source: SOURCE_DIR, items: mediaList },
    null,
    '\t'
  ) + '\n'
)

// field map: every field with its source key (documentation generated from the same code)
const fieldMap = collections.map((c) => ({
  collection: c.slug,
  routable: c.routable !== false,
  urlPattern: c.urlPattern ?? null,
  entriesPerLocale: (content[c.slug] ?? []).filter((e) => e.locale === 'en').length,
  fields: c.fields.map((x) => ({
    slug: x.slug,
    type: x.type,
    required: !!x.required,
    subFields: x.validation?.subFields?.map((s) => `${s.slug}:${s.type}`),
    options: x.validation?.options
  }))
}))
writeFileSync(
  path.join(OUT, 'field-map.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      collections: fieldMap,
      taxonomies: taxonomies
        .filter((t) => t.locale === 'en')
        .map((t) => ({ name: t.name, collections: t.collections, terms: t.terms.map((x) => x.slug) })),
      menus: menus.filter((m) => m.locale === 'en').map((m) => ({ name: m.name, items: m.items.length }))
    },
    null,
    '\t'
  ) + '\n'
)

const counts = Object.fromEntries(Object.entries(content).map(([k, v]) => [k, v.length]))
console.log(
  JSON.stringify({
    collections: collections.length,
    taxonomies: taxonomies.length,
    menus: menus.length,
    content: counts,
    media: mediaList.length,
    mediaTargets: mediaList.reduce((n, m) => n + m.targets.length, 0)
  })
)
