/**
 * What a change of Sync from live or Sync to live is called, in the Owner's words: the kind of record
 * (a page, a menu item, a setting), the fields it changed (title, content, address) and the fixed words
 * of a setting's name (Tagline, Additional CSS). The host names them (`what`, `label`, the columns of
 * its tables); the screen says them in the interface language. A name it does not know is shown as
 * the host gave it — a plugin's own post type ("product") is that plugin's word — except a column,
 * which says "other details" rather than a table's spelling (dev, 27/10/2026: "post · post_title").
 */
import type { Translate } from '../../team/translate'

/** A map's own entry only: a name like `constructor` is no word of ours. */
const own = (map: Record<string, string>, name: string): string | undefined =>
  Object.hasOwn(map, name) ? map[name] : undefined

/** The kinds of change the dialog names (`push.what.<name>`). */
const WHAT = new Set([
  'page',
  'post',
  'article',
  'category',
  'tag',
  'menuItem',
  'menu',
  'module',
  'customField',
  'redirect',
  'setting',
  'templatePart',
  'template',
  'navigation',
  'pattern',
  'pageDetail',
  'media',
  'file',
  'user',
  'comment'
])

/** An engine kind, an unsupported change's `what`, or a table (prefix off) → the kind it is. */
const KIND_WHAT: Record<string, string> = {
  option: 'setting',
  optionOther: 'setting',
  themeMods: 'setting',
  templateStyle: 'setting',
  siteIdentity: 'setting',
  templateSettings: 'setting',
  setting: 'setting',
  field: 'setting',
  table: 'setting',
  postmeta: 'pageDetail',
  term: 'category',
  moduleAssignment: 'module',
  fieldValue: 'customField',
  menutype: 'menu',
  attachment: 'media',
  record: 'post',
  // Tables, as Sync from live names where it kept Tracy's version (Joomla, WordPress).
  content: 'article',
  categories: 'category',
  tags: 'tag',
  menu: 'menuItem',
  menu_types: 'menu',
  modules: 'module',
  modules_menu: 'module',
  fields_values: 'customField',
  redirect_links: 'redirect',
  template_styles: 'setting',
  extensions: 'setting',
  users: 'user',
  posts: 'post',
  terms: 'category',
  term_taxonomy: 'category',
  term_relationships: 'category',
  options: 'setting',
  usermeta: 'user',
  comments: 'comment'
}

/** What a change is, in words: the host's `what`, else its kind; a name it does not know, as is. */
export function whatText(
  what: string | null | undefined,
  kind: string | null | undefined,
  t: Translate
): string {
  const name =
    what && WHAT.has(what) ? what : kind && WHAT.has(kind) ? kind : kind ? own(KIND_WHAT, kind) : undefined
  return name ? t(`push.what.${name}`) : (kind ?? '')
}

/** A column (or a setting's key) → the field it is (`push.field.<name>`). */
const FIELD: Record<string, string> = {
  title: 'title',
  post_title: 'title',
  name: 'title',
  introtext: 'content',
  fulltext: 'content',
  post_content: 'content',
  content: 'content',
  description: 'content',
  post_excerpt: 'excerpt',
  state: 'status',
  published: 'status',
  post_status: 'status',
  alias: 'address',
  post_name: 'address',
  slug: 'address',
  link: 'address',
  url: 'address',
  catid: 'category',
  categories: 'category',
  parent: 'place',
  parent_id: 'place',
  post_parent: 'place',
  tags: 'tags',
  ordering: 'order',
  menu_order: 'order',
  position: 'position',
  publish_up: 'date',
  publish_down: 'date',
  post_date: 'date',
  params: 'settings',
  attribs: 'settings',
  metadata: 'settings',
  urls: 'settings',
  showtitle: 'settings',
  template_style_id: 'settings',
  home: 'settings',
  browserNav: 'settings',
  type: 'settings',
  object: 'settings',
  object_id: 'settings',
  module: 'settings',
  images: 'images',
  metakey: 'seo',
  metadesc: 'seo',
  MetaDesc: 'seo',
  'Site Meta Description': 'seo',
  language: 'language',
  access: 'access',
  featured: 'featured',
  note: 'note',
  menuids: 'pages',
  value: 'value',
  option_value: 'value',
  meta_value: 'value',
  area: 'area',
  file: 'file',
  path: 'file',
  sitename: 'siteName',
  'Site Name': 'siteName',
  site_name: 'siteName',
  sitename_pagetitles: 'siteNameInTitles',
  'Site Name in Page Titles': 'siteNameInTitles',
  site_slogan: 'slogan',
  site_logo: 'logo',
  site_logo_small: 'logo',
  site_logo_dark: 'logo',
  site_logo_dark_small: 'logo',
  site_logo_2: 'logo',
  other_faviconFile: 'favicon',
  other_shareImage: 'shareImage',
  other_glyphFaces: 'fonts'
}

/** One field in words; a column the screen does not know is "other details". */
export function fieldText(column: string, t: Translate): string {
  return t(`push.field.${own(FIELD, column) ?? 'other'}`)
}

/** The fields a change touched, in words, each once, in the order first named. */
export function fieldsText(columns: readonly string[], t: Translate): string {
  return [...new Set(columns.map((c) => fieldText(c, t)))].join(', ')
}

/** The fixed words of a title the host names (`push.label.<name>`): its options' labels and more. */
const LABEL = new Set([
  'blogname',
  'blogdescription',
  'date_format',
  'time_format',
  'start_of_week',
  'posts_per_page',
  'show_on_front',
  'page_on_front',
  'page_for_posts',
  'site_icon',
  'timezone_string',
  'gmt_offset',
  'posts_per_rss',
  'rss_use_excerpt',
  'default_comment_status',
  'default_ping_status',
  'comment_registration',
  'comments_per_page',
  'page_comments',
  'thread_comments',
  'permalink_structure',
  'category_base',
  'tag_base',
  'additionalCss',
  'customizer',
  'templateStyle',
  'styles',
  'globalConfiguration'
])

/** A title in words: its fixed words translated and its subject after them, else the host's title. */
export function labelText(
  label: string | null | undefined,
  subject: string | null | undefined,
  title: string | null | undefined,
  t: Translate
): string | null {
  if (!label || !LABEL.has(label)) return title?.trim() || null
  const words = t(`push.label.${label}`)
  return subject?.trim() ? `${words} · ${subject.trim()}` : words
}
