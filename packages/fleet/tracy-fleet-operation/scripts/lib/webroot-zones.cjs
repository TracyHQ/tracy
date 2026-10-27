// src/shared/utils/webrootZonesCli.ts
const import_node_fs = require('node:fs')

// src/shared/utils/webrootZones.ts
const JOOMLA_CORE_COMPONENTS = /* @__PURE__ */ new Set([
  'com_actionlogs',
  'com_admin',
  'com_ajax',
  'com_associations',
  'com_banners',
  'com_cache',
  'com_categories',
  'com_checkin',
  'com_config',
  'com_contact',
  'com_content',
  'com_contenthistory',
  'com_cpanel',
  'com_fields',
  'com_finder',
  'com_guidedtours',
  'com_installer',
  'com_joomlaupdate',
  'com_languages',
  'com_login',
  'com_mails',
  'com_media',
  'com_menus',
  'com_messages',
  'com_modules',
  'com_newsfeeds',
  'com_plugins',
  'com_postinstall',
  'com_privacy',
  'com_redirect',
  'com_scheduler',
  'com_schemaorg',
  'com_tags',
  'com_templates',
  'com_users',
  'com_workflow',
  'com_wrapper'
])
const JOOMLA_CORE_MODULE_PREFIXES = [
  'mod_articles',
  'mod_banners',
  'mod_breadcrumbs',
  'mod_custom',
  'mod_feed',
  'mod_finder',
  'mod_footer',
  'mod_languages',
  'mod_latest',
  'mod_latestactions',
  'mod_login',
  'mod_logged',
  'mod_menu',
  'mod_messages',
  'mod_multilangstatus',
  'mod_popular',
  'mod_post_installation_messages',
  'mod_privacy_dashboard',
  'mod_privacy_status',
  'mod_quickicon',
  'mod_random_image',
  'mod_related_items',
  'mod_sampledata',
  'mod_stats',
  'mod_submenu',
  'mod_syndicate',
  'mod_tags_popular',
  'mod_tags_similar',
  'mod_title',
  'mod_toolbar',
  'mod_user',
  'mod_users_latest',
  'mod_version',
  'mod_whosonline',
  'mod_wrapper'
]
const JOOMLA_CORE_PLUGINS = /* @__PURE__ */ new Set([
  'actionlog/joomla',
  'api-authentication/basic',
  'api-authentication/token',
  'authentication/cookie',
  'authentication/joomla',
  'authentication/ldap',
  'behaviour/compat',
  'behaviour/taggable',
  'behaviour/versionable',
  'captcha/recaptcha',
  'captcha/recaptcha_invisible',
  'content/confirmconsent',
  'content/contact',
  'content/emailcloak',
  'content/fields',
  'content/finder',
  'content/joomla',
  'content/loadmodule',
  'content/pagebreak',
  'content/pagenavigation',
  'content/vote',
  'editors/codemirror',
  'editors/none',
  'editors/tinymce',
  'editors-xtd/article',
  'editors-xtd/contact',
  'editors-xtd/fields',
  'editors-xtd/image',
  'editors-xtd/menu',
  'editors-xtd/module',
  'editors-xtd/pagebreak',
  'editors-xtd/readmore',
  'extension/finder',
  'extension/joomla',
  'extension/namespacemap',
  'fields/calendar',
  'fields/checkboxes',
  'fields/color',
  'fields/editor',
  'fields/imagelist',
  'fields/integer',
  'fields/list',
  'fields/media',
  'fields/radio',
  'fields/sql',
  'fields/subform',
  'fields/text',
  'fields/textarea',
  'fields/url',
  'fields/user',
  'fields/usergrouplist',
  'filesystem/local',
  'finder/categories',
  'finder/contacts',
  'finder/content',
  'finder/newsfeeds',
  'finder/tags',
  'installer/folderinstaller',
  'installer/override',
  'installer/packageinstaller',
  'installer/urlinstaller',
  'installer/webinstaller',
  'media-action/crop',
  'media-action/resize',
  'media-action/rotate',
  'multifactorauth/email',
  'multifactorauth/fixed',
  'multifactorauth/totp',
  'multifactorauth/webauthn',
  'multifactorauth/yubikey',
  'privacy/actionlogs',
  'privacy/consents',
  'privacy/contact',
  'privacy/content',
  'privacy/message',
  'privacy/user',
  'quickicon/downloadkey',
  'quickicon/eos',
  'quickicon/extensionupdate',
  'quickicon/joomlaupdate',
  'quickicon/overridecheck',
  'quickicon/phpversioncheck',
  'quickicon/privacycheck',
  'sampledata/blog',
  'sampledata/multilang',
  'schemaorg/article',
  'schemaorg/blogposting',
  'schemaorg/book',
  'schemaorg/custom',
  'schemaorg/event',
  'schemaorg/jobposting',
  'schemaorg/organization',
  'schemaorg/person',
  'schemaorg/recipe',
  'system/accessibility',
  'system/actionlogs',
  'system/cache',
  'system/debug',
  'system/fields',
  'system/guidedtours',
  'system/highlight',
  'system/httpheaders',
  'system/jooa11ychecker',
  'system/languagecode',
  'system/languagefilter',
  'system/log',
  'system/logout',
  'system/logrotation',
  'system/privacyconsent',
  'system/redirect',
  'system/remember',
  'system/schedulerunner',
  'system/schemaorg',
  'system/sef',
  'system/sessiongc',
  'system/shortcut',
  'system/skipto',
  'system/stats',
  'system/tasknotification',
  'system/updatenotification',
  'system/webauthn',
  'task/checkfiles',
  'task/demotasks',
  'task/deleteactionlogs',
  'task/globalcheckin',
  'task/privacyconsent',
  'task/requests',
  'task/rotatelogs',
  'task/sessiongc',
  'task/sitestatus',
  'task/updatenotification',
  'user/contactcreator',
  'user/joomla',
  'user/profile',
  'user/terms',
  'user/token',
  'webservices/banners',
  'webservices/config',
  'webservices/contact',
  'webservices/content',
  'webservices/installer',
  'webservices/languages',
  'webservices/media',
  'webservices/menus',
  'webservices/messages',
  'webservices/modules',
  'webservices/newsfeeds',
  'webservices/plugins',
  'webservices/privacy',
  'webservices/redirect',
  'webservices/tags',
  'webservices/templates',
  'webservices/users',
  'workflow/featuring',
  'workflow/notification',
  'workflow/publishing'
])
const JOOMLA_CORE_TEMPLATES = /* @__PURE__ */ new Set(['cassiopeia', 'atum', 'system'])
const WP_CORE_THEMES_PREFIX = /^twenty/
const keyOf = (type, key) => `${type} ${key.toLowerCase()}`
const indexCache = /* @__PURE__ */ new WeakMap()
function manifestIndex(manifest2) {
  const cached = indexCache.get(manifest2)
  if (cached) return cached
  const index = {
    platform: manifest2.platform,
    core: /* @__PURE__ */ new Set(),
    installed: /* @__PURE__ */ new Set()
  }
  for (const extension of manifest2.extensions ?? []) {
    if (!extension || typeof extension.element !== 'string' || typeof extension.type !== 'string') continue
    const name =
      extension.type === 'plugin' && extension.folder
        ? `${extension.folder}/${extension.element}`
        : extension.element
    const key = keyOf(extension.type, name)
    index.installed.add(key)
    if (extension.core === true) index.core.add(key)
  }
  indexCache.set(manifest2, index)
  return index
}
function manifestZone(index, type, name, thirdParty) {
  if (!index) return null
  const key = keyOf(type, name)
  if (index.core.has(key)) return 'core'
  if (index.installed.has(key)) return thirdParty
  return null
}
function isJoomlaCoreModule(name) {
  return JOOMLA_CORE_MODULE_PREFIXES.some((prefix) => name === prefix || name.startsWith(`${prefix}_`))
}
function classifyJoomla(rest, index) {
  const [head, second, third] = rest.split('/')
  if (head === 'images') return 'content'
  if (head === 'language') return 'content'
  const templateZone = (name) =>
    manifestZone(index, 'template', name, 'design') ?? (JOOMLA_CORE_TEMPLATES.has(name) ? 'core' : 'design')
  if (head === 'templates' && second) {
    return templateZone(second)
  }
  if (head === 'media' && second === 'templates' && third) {
    const template = rest.split('/')[3]
    if (!template) return 'core'
    return templateZone(template)
  }
  const extensionAt = (dir, name) => {
    if (dir === 'components' && name)
      return (
        manifestZone(index, 'component', name, 'addons') ??
        (JOOMLA_CORE_COMPONENTS.has(name) ? 'core' : 'addons')
      )
    if (dir === 'modules' && name)
      return manifestZone(index, 'module', name, 'addons') ?? (isJoomlaCoreModule(name) ? 'core' : 'addons')
    return null
  }
  const site = extensionAt(head, second)
  if (site) return site
  if (head === 'administrator') {
    if (second === 'language') return 'content'
    if (second === 'templates' && third) return templateZone(third)
    const admin = extensionAt(second, third)
    if (admin) return admin
    return 'core'
  }
  if (head === 'plugins') {
    const [, group, name] = rest.split('/')
    if (group && name)
      return (
        manifestZone(index, 'plugin', `${group}/${name}`, 'addons') ??
        (JOOMLA_CORE_PLUGINS.has(`${group}/${name}`) ? 'core' : 'addons')
      )
    return 'core'
  }
  if (head === 'media' && second) {
    const fromManifest =
      manifestZone(index, 'component', second, 'addons') ?? manifestZone(index, 'module', second, 'addons')
    if (fromManifest) return fromManifest
    if (JOOMLA_CORE_COMPONENTS.has(second) || isJoomlaCoreModule(second) || second === 'system') return 'core'
    if (second.startsWith('com_') || second.startsWith('mod_') || second.startsWith('plg_')) return 'addons'
    return 'core'
  }
  return 'core'
}
function classifyWordPress(rest, index) {
  const [head, second, third] = rest.split('/')
  if (head === 'wp-content') {
    if (second === 'uploads') return 'content'
    if (second === 'themes' && third)
      return (
        manifestZone(index, 'theme', third, 'design') ??
        (WP_CORE_THEMES_PREFIX.test(third) ? 'core' : 'design')
      )
    if ((second === 'plugins' || second === 'mu-plugins') && third) return 'addons'
    return 'core'
  }
  return 'core'
}
const SITE_SOURCE_CODE_PREFIX = 'SiteSourceCode/'
function classifyShopifyTheme(rest) {
  return rest.startsWith('locales/') ? 'content' : 'design'
}
function classifyWebrootPath(path, platform2, manifest2) {
  if (path.startsWith('SiteContent/') || path.startsWith('content/')) return 'content'
  if (path.startsWith(SITE_SOURCE_CODE_PREFIX)) {
    const code = path.slice(SITE_SOURCE_CODE_PREFIX.length)
    return code ? classifyShopifyTheme(code) : 'other'
  }
  if (!path.startsWith('webroot/')) return 'other'
  const rest = path.slice('webroot/'.length)
  if (!rest) return 'other'
  const index = manifest2 && platform2 && manifest2.platform === platform2 ? manifestIndex(manifest2) : null
  if (platform2 === 'wordpress') return classifyWordPress(rest, index)
  if (platform2 === 'joomla') return classifyJoomla(rest, index)
  return 'core'
}

// src/shared/utils/webrootZonesCli.ts
const args = process.argv.slice(2)
let manifest = null
if (args[0] === '--manifest') {
  const file = args[1]
  args.splice(0, 2)
  try {
    const parsed = JSON.parse((0, import_node_fs.readFileSync)(String(file), 'utf8'))
    if (parsed && typeof parsed.platform === 'string' && Array.isArray(parsed.extensions)) manifest = parsed
  } catch {}
}
const [platformArg, ...paths] = args
if (!platformArg || paths.length === 0) {
  console.error('usage: webroot-zones.cjs [--manifest <file>] <joomla|wordpress|-> <path...>')
  process.exit(2)
}
const platform = platformArg === 'joomla' || platformArg === 'wordpress' ? platformArg : null
for (const p of paths) {
  console.log(`${classifyWebrootPath(p, platform, manifest)}	${p}`)
}
