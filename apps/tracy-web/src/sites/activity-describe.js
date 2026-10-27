/**
 * WHAT A V2 EVENT CHANGED, AND HOW TO SAY IT — effects and description keys of Site changes V2
 * (plan `tasks/todo-site-changes-v2.md` §2.3, §2.5; contract D4). Pure functions: no database, no
 * model call. The client turns `{key, params}` into words in its own language.
 *
 * 🔒 SAY ONLY WHAT WAS RECORDED.
 *   - A resource is named by the title its SOURCE stored (a CMS log's `resource_title`, an EmDash
 *     write's `target.title` as its own answer had it). Any other Tracy write stores kind/id/field
 *     names only, so it reads "Updated article 551" — never a title looked up today and passed off
 *     as the historical one.
 *   - Without a result the description is the REQUEST (`isRequestOnly`), not a claim.
 *   - Units never mix: content and settings count RESOURCES (type + id) and, separately, operations
 *     with no id; files count paths; other actions count operations.
 *   - D4: a look edit by a file tool (`file-look`), its revert (`look-revert`), a WordPress look
 *     on the site's Additional CSS or its revert (`look-css`) and any read-only action are TECHNICAL — listed for the turn's detail, never content, files or other. The
 *     files such a tool wrote are counted from Git, once.
 */

/**
 * Resource types that are configuration (CMS settings, theme, extensions, core), not content.
 *
 * The CMS log types each collector actually emits (`apps/tracy-host/src/cms-log.js`):
 *   - WordPress hook (`tracy-access.php`): `option`, `theme_mods`, `theme`, `plugin`, `core` here;
 *     post types, `attachment`, `nav_menu` are content.
 *   - Joomla: the `PLG_ACTIONLOG_JOOMLA_TYPE_*` suffix, lower-cased — the whole list of Joomla 5's
 *     `plg_actionlog_joomla.ini`: `application_config`, `component_config` (a component's
 *     Options), `component`, `file`/`library`/`package`/`plugin`/`template`/`language` (extensions),
 *     `style` (a template style), `task` (a scheduled task), `link_redirect` (a redirect rule) here;
 *     `access_level`, `user`, `user_group`, `user_note` are other; `article`, `banner`,
 *     `banner_client`, `category`, `contact`, `field`, `link`, `media`, `menu`, `menu_item`,
 *     `module`, `newsfeed`, `tag` are content. A row with no such type falls back to the log's
 *     `type_title` or extension (`com_config.component` …): see {@link cmsGroup}.
 *   - EmDash: a collection slug or `media` — content.
 */
const SETTINGS_TYPES = new Set([
  'option',
  'options',
  'setting',
  'settings',
  'config',
  'configuration',
  'application_config',
  'component_config',
  'theme',
  'theme_mods',
  'template',
  'template_style',
  'style',
  'plugin',
  'core',
  'component',
  'extension',
  'file',
  'library',
  'package',
  'language',
  'task',
  'link_redirect',
  'site-settings',
  // A design system put on or taken off by the Design system door (`design-system.js`): a look, like a style.
  'design-system'
])
/** Resource types that are neither content nor settings (accounts, access). */
const OTHER_TYPES = new Set([
  'user',
  'users',
  'usergroup',
  'user_group',
  'user_note',
  'access',
  'access_level',
  'role'
])
/** Joomla extensions (`com_*`) whose log rows are configuration or accounts, by fallback type. */
const SETTINGS_EXTENSIONS = /^com_(config|installer|plugins|templates|languages|scheduler|redirect)(\.|$)/
const OTHER_EXTENSIONS = /^com_users(\.|$)/

/** `via` values a write arrives by that are technical, not a content change (D4). */
const TECHNICAL_VIA = new Set(['file-look', 'look-revert', 'look-css'])
/** An action that only reads (defensive: the doors record writes only, but a name says so). */
const READ_ONLY_ACTION = /(^|[._])(read|get|list|find|locate|describe|search|inspect|preview)$/

/** The verb of an action name: `content.update` → `update`, `content_update` → `update`. */
export function verbOf(action) {
  const name = String(action ?? '')
  const parts = name.split(/[._]/).filter(Boolean)
  return (parts[parts.length - 1] ?? name).slice(0, 40) || 'change'
}

/** Which group a write belongs to: `technical`, `settings`, `content` or `other`. */
export function writeGroup(w) {
  if (TECHNICAL_VIA.has(String(w.via ?? ''))) return 'technical'
  const action = String(w.action ?? '')
  if (READ_ONLY_ACTION.test(action)) return 'technical'
  const kind = typeof w.target?.kind === 'string' ? w.target.kind.toLowerCase() : null
  if (kind && SETTINGS_TYPES.has(kind)) return 'settings'
  if (kind && OTHER_TYPES.has(kind)) return 'other'
  if (/^(settings|config|site\.settings|options?)[._]/.test(action) || /(^|_)settings?(_|$)/.test(action))
    return 'settings'
  if (kind) return 'content'
  if (/^(content|menu|media|taxonomy|page|post|article|entry|entries)[._]/.test(action)) return 'content'
  return 'other'
}

/** Which group a CMS log row belongs to, by the resource type the CMS logged. */
export function cmsGroup(resourceType) {
  const type = String(resourceType ?? '').toLowerCase()
  if (SETTINGS_TYPES.has(type) || SETTINGS_EXTENSIONS.test(type)) return 'settings'
  if (OTHER_TYPES.has(type) || OTHER_EXTENSIONS.test(type)) return 'other'
  return 'content'
}

/** Collection slugs that are not plurals of a shorter word. */
const NOT_PLURAL = new Set(['news', 'series', 'media', 'status', 'press', 'campus'])

/**
 * The resource type a description names. EmDash logs a COLLECTION slug, plural by convention
 * (`posts`, `pages`): "Updated post “Launch”", not "Updated posts “Launch”". The slug is the
 * site's own word, so only a regular plural ending is taken off; the other CMSs log a type that is
 * already singular and keep it as it is.
 * @param {string|null|undefined} source the CMS log (`site_cms_change.source`)
 * @param {string|null|undefined} type
 * @returns {string|null}
 */
export function singularType(source, type) {
  if (typeof type !== 'string' || !type) return null
  if (source !== 'emdash-audit-log' || NOT_PLURAL.has(type.toLowerCase())) return type
  if (/[^aeiou]ies$/i.test(type)) return `${type.slice(0, -3)}y`
  if (/(ss|sh|ch|x|z)es$/i.test(type)) return type.slice(0, -2)
  if (/[^su]s$/i.test(type)) return type.slice(0, -1)
  return type
}

const emptyGroup = () => ({ resources: [], operations: 0 })

/**
 * @typedef {{type: string|null, id: string|null, title: string|null, ops: string[]}} EffectResource
 * @typedef {{resources: EffectResource[], operations: number}} EffectGroup
 * @typedef {{content: EffectGroup, settings: EffectGroup,
 *   files: {count: number|null, sha: string|null, state: FilesState},
 *   other: {operations: number, actions: string[]},
 *   coverage: {files: FilesState, content: 'recorded'|'not-recorded'}}} Effects
 * @typedef {'recorded'|'not-tracked'|'unread'|'not-linked'} FilesState
 */

/** Add one operation on `(type, id)` to a group: one resource per type + id, ops kept in order. */
function addTo(group, type, id, title, op) {
  if (id === null || id === undefined || id === '') {
    group.operations += 1
    return
  }
  const key = `${type ?? ''}\u0000${id}`
  let found = group.resources.find((r) => `${r.type ?? ''}\u0000${r.id}` === key)
  if (!found) {
    found = { type: type ?? null, id: String(id), title: title ?? null, ops: [] }
    group.resources.push(found)
  }
  if (!found.title && title) found.title = title
  if (!found.ops.includes(op)) found.ops.push(op)
}

/**
 * The effects of one event.
 * @param {{writes?: any[], cms?: any|null, files?: {count: number|null, sha: string|null}|null,
 *   fileHistory?: boolean, gitRead?: boolean, linked?: boolean}} input
 *   `writes`: `site_write` rows (refused already left out) as `{action, via, target, outcome}`;
 *   `cms`: one `site_cms_change` row; `files`: the moment's file count (`count: null` = not known);
 *   `linked: false`: the record has no commit at all (a CMS log row).
 * @returns {{effects: Effects, technical: {action: string, via: string, outcome: string}[]}}
 */
export function effectsOf({
  writes = [],
  cms = null,
  files = null,
  fileHistory = true,
  gitRead = true,
  linked = true
}) {
  const filesState0 = linked ? 'linked' : 'not-linked'
  const content = emptyGroup()
  const settings = emptyGroup()
  const other = { operations: 0, actions: /** @type {string[]} */ ([]) }
  const technical = []
  for (const w of writes) {
    const group = writeGroup(w)
    if (group === 'technical') {
      technical.push({ action: String(w.action), via: String(w.via ?? 'apply'), outcome: String(w.outcome) })
      continue
    }
    if (group === 'other') {
      other.operations += 1
      if (!other.actions.includes(String(w.action))) other.actions.push(String(w.action))
      continue
    }
    const target = w.target && typeof w.target === 'object' ? w.target : {}
    const id = target.id === null || target.id === undefined ? null : String(target.id)
    // An EmDash write names its COLLECTION (`posts`), as EmDash's own log does: same singular.
    const kind =
      w.via === 'emdash-mcp' ? singularType('emdash-audit-log', target.kind) : (target.kind ?? null)
    // Dev e2e 04/10 (E3.2): the title the write's own answer carried (`tracy-site-tools` records it
    // with the write), so the row reads "Updated home “Home”", not a ULID. Never looked up later.
    const title = typeof target.title === 'string' && target.title ? target.title : null
    addTo(group === 'settings' ? settings : content, kind, id, title, verbOf(w.action))
  }
  if (cms) {
    const group = cmsGroup(cms.resource_type)
    const op = String(cms.op ?? 'change')
    if (group === 'other') {
      other.operations += 1
      if (!other.actions.includes(op)) other.actions.push(op)
    } else {
      addTo(
        group === 'settings' ? settings : content,
        singularType(cms.source, cms.resource_type),
        cms.resource_id ?? null,
        cms.resource_title ?? null,
        op
      )
    }
  }
  // 🔒 Never "0 files" for an area nobody tracks (EmDash), a history nobody could read, or a record
  // that is not linked to any commit (a CMS log row: its files, if any, are a separate event).
  const filesState = !fileHistory
    ? 'not-tracked'
    : filesState0 === 'not-linked'
      ? 'not-linked'
      : files && files.count !== null
        ? 'recorded'
        : gitRead
          ? 'recorded'
          : 'unread'
  const fileCount = filesState === 'recorded' ? (files?.count ?? 0) : null
  return {
    effects: {
      content,
      settings,
      files: { count: fileCount, sha: files?.sha ?? null, state: filesState },
      other,
      coverage: { files: filesState, content: writes.length || cms ? 'recorded' : 'not-recorded' }
    },
    technical
  }
}

const resourcesOf = (g) => g.resources.length
const anyOf = (g) => g.resources.length + g.operations

/**
 * The description of a turn or a group of writes, from its effects (plan §2.3 order).
 * @param {Effects} effects
 * @param {{technical?: any[], requestOnlyAllowed?: boolean}} [opts]
 * @returns {{key: string, params: Record<string, unknown>, isRequestOnly: boolean}}
 */
export function describeEffects(effects, { technical = [], requestOnlyAllowed = false } = {}) {
  const files = effects.files.count ?? 0
  const parts = {
    contentResources: resourcesOf(effects.content),
    contentOperations: effects.content.operations,
    settingsResources: resourcesOf(effects.settings),
    settingsOperations: effects.settings.operations,
    files,
    otherOperations: effects.other.operations
  }
  const kinds = [
    anyOf(effects.content) > 0,
    anyOf(effects.settings) > 0,
    files > 0,
    parts.otherOperations > 0
  ]
  const groups = kinds.filter(Boolean).length
  if (groups === 0) {
    if (requestOnlyAllowed) return { key: 'request', params: {}, isRequestOnly: true }
    if (technical.length > 0) return { key: 'files.look-edited', params: {}, isRequestOnly: false }
    return { key: 'change.recorded', params: {}, isRequestOnly: false }
  }
  if (groups === 1) {
    const only =
      anyOf(effects.content) > 0 ? effects.content : anyOf(effects.settings) > 0 ? effects.settings : null
    if (only && only.resources.length === 1 && only.operations === 0) {
      const r = only.resources[0]
      return {
        key: 'resource.op',
        params: { op: r.ops[r.ops.length - 1] ?? 'change', type: r.type, id: r.id, title: r.title },
        isRequestOnly: false
      }
    }
    if (files > 0) return { key: 'files.changed', params: { files }, isRequestOnly: false }
    // F-L4-4: operations with no resource id say which group they were — a settings-only event is
    // not a "content change".
    if (only && only.resources.length === 0)
      return {
        key: only === effects.settings ? 'settings.recorded' : 'change.recorded',
        params: { operations: only.operations },
        isRequestOnly: false
      }
    // Only account/access actions (never named by id here): not a content change either.
    if (!only && files === 0)
      return { key: 'other.recorded', params: { operations: parts.otherOperations }, isRequestOnly: false }
  }
  return { key: 'effects.summary', params: parts, isRequestOnly: false }
}

/** One CMS log row's description: the resource by the name the CMS stored, or the op alone. */
export function describeCms(cms) {
  const op = String(cms.op ?? 'change')
  // Tracy's own component on the site (`TRACY_OWNED`): the client says "Tracy's …" / "Tracy update".
  const owner = tracyOwned(cms) ? { owner: 'tracy' } : {}
  if (cms.resource_title || cms.resource_id)
    return {
      key: 'resource.op',
      params: {
        op,
        type: singularType(cms.source, cms.resource_type),
        id: cms.resource_id ?? null,
        title: cms.resource_title ?? null,
        ...owner
      },
      isRequestOnly: false
    }
  const group = cmsGroup(cms.resource_type)
  return {
    key:
      group === 'settings' ? 'settings.recorded' : group === 'other' ? 'other.recorded' : 'change.recorded',
    params: { op, ...owner },
    isRequestOnly: false
  }
}

/**
 * What Tracy itself puts on a customer's site, as the CMS's OWN log names it — read off real rows,
 * never guessed from a name that merely looks like Tracy's (02/10, "Tracy update"):
 *   - WordPress hook (`tracy_admin_log`): the plugin `claude-cowork/claude-cowork.php` (resource id;
 *     its title varies: "Tracy Claude Cowork" on stand scv2wp, "Claude Cowork" in older builds).
 *   - Joomla action log (`message.name`, the collector's resource title): the package "Joomla Claude
 *     Cowork", component "COM_CLAUDECOWORK", plugins `plg_system_claudecoworkapi`,
 *     `plg_system_claudecoworkupdate`, and Tracy's sign-in plugins `plg_system_tracyaccess`,
 *     `plg_system_tracyidentity` (stand scv2jo `ng_extensions` + `ng_action_logs`, 02/10; fixture
 *     `joomla-e3sj0330.json`).
 *   - EmDash's audit log records content only: nothing of Tracy's appears there.
 * Only the owner is added (`params.owner`); Source, By and counts do not change.
 */
export const TRACY_OWNED = Object.freeze({
  'wordpress-tracy-log': Object.freeze({ type: 'plugin', idPrefixes: Object.freeze(['claude-cowork/']) }),
  'joomla-action-log': Object.freeze({
    titles: Object.freeze([
      'Joomla Claude Cowork',
      'COM_CLAUDECOWORK',
      'plg_system_claudecoworkapi',
      'plg_system_claudecoworkupdate',
      'plg_system_tracyaccess',
      'plg_system_tracyidentity'
    ])
  })
})

/** Whether a CMS log row is about one of Tracy's own components ({@link TRACY_OWNED}). */
export function tracyOwned(cms) {
  if (cms.source === 'wordpress-tracy-log') {
    const rule = TRACY_OWNED['wordpress-tracy-log']
    return (
      cms.resource_type === rule.type &&
      typeof cms.resource_id === 'string' &&
      rule.idPrefixes.some((p) => cms.resource_id.startsWith(p))
    )
  }
  if (cms.source === 'joomla-action-log')
    return (
      typeof cms.resource_title === 'string' &&
      TRACY_OWNED['joomla-action-log'].titles.includes(cms.resource_title)
    )
  return false
}

/**
 * The Tracy component a deploy commit updated, by the file name its subject names
 * (`outside Tracy: deploy <tag> updated <file>`, written by `webroot-git.sh` `deploy_prepare` for
 * the resync of `scripts/tools/resync-access-plugin.sh`). The only file Tracy deploys today is the
 * WordPress connector, `wp-content/mu-plugins/tracy-access.php`.
 */
const DEPLOY_COMPONENTS = Object.freeze({ 'tracy-access.php': 'connector' })

/**
 * A Tracy deploy's description: `deploy.updated {component, files, tag, owner: 'tracy'}` when the
 * file names a component of Tracy's; otherwise `deploy.files {files, tag}` — never a guess.
 * @param {{tag: string|null, file: string|null, files: number|null}} deploy
 */
export function describeDeploy({ tag, file, files }) {
  const base = typeof file === 'string' ? (file.split('/').pop() ?? '') : ''
  const component = Object.hasOwn(DEPLOY_COMPONENTS, base) ? DEPLOY_COMPONENTS[base] : null
  if (component)
    return {
      key: 'deploy.updated',
      params: { component, files, tag: tag ?? null, owner: 'tracy' },
      isRequestOnly: false
    }
  return { key: 'deploy.files', params: { files, tag: tag ?? null }, isRequestOnly: false }
}

/**
 * Tracy's Cowork package updating itself on the site (a seal `isCoworkUpdateSeal` reads): the
 * `deploy.updated` of a component of Tracy's, with no deploy tag — nothing deployed it but the
 * package's own updater.
 * @param {number|null} files
 */
export function describeCoworkUpdate(files) {
  return {
    key: 'deploy.updated',
    params: { component: 'cowork', files, tag: null, owner: 'tracy' },
    isRequestOnly: false
  }
}

/**
 * The stored request's completeness. `request_state` is written by the turn door from V2 on;
 * a legacy row (null) is `unknown` — a 200-character title is a hint, not proof (plan §2.3).
 * @param {string|null|undefined} state
 * @returns {'full'|'truncated'|'unknown'}
 */
export function requestStateOf(state) {
  return state === 'full' || state === 'truncated' ? state : 'unknown'
}
