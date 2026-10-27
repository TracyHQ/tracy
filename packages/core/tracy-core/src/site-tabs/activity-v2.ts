/**
 * The pure half of Site changes V2 (plan `tasks/todo-site-changes-v2.md` §2–§4, contract
 * `tasks/evidence/site-changes-v2/contract.md` §3; drawn in `@tracy/design` › `Mockups/Site changes
 * V2`, approved 02/10): how one `ActivityItemV2` becomes the words of its four columns,
 * the scope line, the undo status, and whether an answer has the V2 shape at all. No React, and only
 * plain `.mjs` runtime imports, so `test/activity-v2.test.mjs` loads this file straight through
 * Node's type stripping.
 *
 * 🔒 SAY ONLY WHAT WAS RECORDED. Every sentence here is built from the server's `{key, params}`
 * and counts; nothing is looked up today and passed off as history, units are never summed across
 * kinds (resources, operations, files), and an area nobody tracks is never "0 files".
 */
import { decodeEntities, replaceMentions } from '../mention/index.mjs'
import { targetText } from '../turn-undo/index.mjs'
import type { ActivityEffectGroup, ActivityItemV2, ActivitySource, ActivityV2, ActorFaceShape } from './api'

/**
 * The ten Sources, in the order the filter lists them (plan §2.1; `design-system` 11/10/2026;
 * `setup` and `api` sweep 11/10/2026).
 */
export const SOURCES: readonly ActivitySource[] = [
  'chat',
  'comment',
  'design-system',
  'setup',
  'api',
  'cms-admin',
  'automatic',
  'deployment',
  'site-changes',
  'unknown'
]

/** The same `t` every tab takes; repeated here so this file needs no runtime import. */
export type Words = (key: string, params?: Record<string, string | number>) => string

/**
 * Whether an `/activity` answer has the V2 shape (`schemaVersion: 2`, items, counts, coverage). Any
 * other body is a read that failed: no field is read from it (plan §4.1, A19).
 */
export function isActivityV2(answer: unknown): answer is ActivityV2 {
  if (!answer || typeof answer !== 'object') return false
  const a = answer as { schemaVersion?: unknown; items?: unknown; counts?: unknown }
  return (
    a.schemaVersion === 2 &&
    Array.isArray(a.items) &&
    typeof a.counts === 'object' &&
    a.counts !== null &&
    typeof (a.counts as { all?: unknown }).all === 'number'
  )
}

/** A CMS's product name — data, not words to translate. */
export const CMS_LABEL: Record<string, string> = {
  wordpress: 'WordPress',
  joomla: 'Joomla',
  emdash: 'EmDash'
}

// ── By ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Who the By column names (plan §2.2). Each kind is drawn differently on purpose, so a CMS account
 * never looks like a Tracy seat: a seat is a round avatar, a CMS account a square tile with the
 * CMS's letter, a service a square tile with a cog, Unknown a dashed circle.
 */
export type ByModel =
  | { kind: 'seat'; name: string; email: string; face?: ActorFaceShape }
  | { kind: 'cms'; cms: string; name: string | null; id: string | null }
  | { kind: 'service'; name: string; id: string | null }
  | { kind: 'unknown' }

/** The By of an event: the requester when there is one, else whoever carried it out. */
export function byOf(item: Pick<ActivityItemV2, 'actor' | 'origin' | 'kind'>): ByModel {
  const a = item.actor
  if (a.type === 'unknown') return { kind: 'unknown' }
  const id = typeof a.id === 'string' ? a.id : null
  const name = typeof a.name === 'string' && a.name.trim() ? a.name.trim() : null
  // A Tracy deploy is Tracy updating itself on the site: By reads "Tracy" (option a).
  if (a.type === 'system' && id === 'service:tracy-deploy') return { kind: 'service', name: 'Tracy', id }
  if (a.type === 'system') return { kind: 'service', name: name ?? 'System', id }
  if (id?.startsWith('tracy:')) {
    const email = id.slice('tracy:'.length)
    // The seat's face as the server decided it (`personFace`); none → the letter on grey (`ActorFace`).
    const face = a.face ?? null
    return { kind: 'seat', name: name ?? email, email, ...(face !== null ? { face } : {}) }
  }
  // A person who is not a Tracy seat: the CMS's own account (`<cms>:<user id>`), or a CMS log row
  // that recorded a name and no id.
  const prefix = id && id.includes(':') ? id.slice(0, id.indexOf(':')) : null
  const cmsKey = item.origin.cms ?? (prefix && prefix in CMS_LABEL ? prefix : null)
  if (cmsKey || item.kind === 'cms-change') {
    return {
      kind: 'cms',
      cms: cmsKey ? (CMS_LABEL[cmsKey] ?? cmsKey) : 'CMS',
      name,
      id: id && id.includes(':') ? id.slice(id.indexOf(':') + 1) : id
    }
  }
  return name ? { kind: 'seat', name, email: '' } : { kind: 'unknown' }
}

/** The name the By column prints. */
export function byName(by: ByModel, t: Words): string {
  if (by.kind === 'seat' || by.kind === 'service') return by.name
  if (by.kind === 'cms') {
    if (by.name) return by.name
    return by.id ? t('event.by.cmsId', { cms: by.cms, id: by.id }) : t('event.unknown')
  }
  return t('event.unknown')
}

/** The hover words for By: which system an identity belongs to, so two never read as one person. */
export function byTitle(by: ByModel, t: Words): string {
  if (by.kind === 'seat')
    return by.email ? t('event.by.seatTitle', { name: by.name, email: by.email }) : by.name
  if (by.kind === 'cms') return cmsAccount(by, t)
  if (by.kind === 'service') return by.name
  return t('event.unknown')
}

/** "WordPress account minh (ID 7)", with whichever half the CMS recorded. */
export function cmsAccount(by: Extract<ByModel, { kind: 'cms' }>, t: Words): string {
  if (by.name && by.id) return t('event.cmsAccount', { cms: by.cms, name: by.name, id: by.id })
  if (by.name) return t('event.cmsAccountNoId', { cms: by.cms, name: by.name })
  if (by.id) return t('event.cmsAccountIdOnly', { cms: by.cms, id: by.id })
  return t('event.unknown')
}

// ── Time ────────────────────────────────────────────────────────────────────────────────────────

/** The time a row shows and sorts under: when it happened, or — for a seal — when Tracy noticed. */
export function timeOf(item: Pick<ActivityItemV2, 'occurredAt' | 'detectedAt' | 'timeBasis'>): {
  basis: 'occurred' | 'detected'
  iso: string | null
} {
  if (item.timeBasis === 'detected') return { basis: 'detected', iso: item.detectedAt ?? item.occurredAt }
  return { basis: 'occurred', iso: item.occurredAt ?? item.detectedAt }
}

/** A run of events on one calendar day of the viewer's clock, newest first. */
export interface EventDay {
  key: string
  label: string
  items: ActivityItemV2[]
}

/** Split the server's newest-first events into days; an event with no time joins the day above it. */
export function eventDays(items: readonly ActivityItemV2[], label: (day: Date) => string): EventDay[] {
  const days: EventDay[] = []
  for (const item of items) {
    const iso = timeOf(item).iso
    const at = iso ? new Date(iso) : null
    const key =
      at && !Number.isNaN(at.getTime()) ? `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}` : null
    const last = days[days.length - 1]
    if (last && (key === null || last.key === key)) last.items.push(item)
    else if (key !== null && at) days.push({ key, label: label(at), items: [item] })
    else days.push({ key: `none-${days.length}`, label: '', items: [item] })
  }
  return days
}

// ── Units and the scope line ────────────────────────────────────────────────────────────────────

/** Resource types with a unit word of their own; any other counts as an item. */
const UNIT_OF: Record<string, string> = {
  page: 'page',
  pages: 'page',
  post: 'post',
  posts: 'post',
  article: 'article',
  articles: 'article',
  nav_menu: 'menu',
  menu: 'menu',
  menu_item: 'menu',
  wp_navigation: 'menu',
  attachment: 'media',
  media: 'media',
  image: 'media',
  category: 'category',
  term: 'category',
  taxonomy: 'category',
  product: 'product',
  entry: 'entry',
  entries: 'entry',
  wp_template: 'template',
  wp_template_part: 'template',
  template: 'template'
}

/** "1 page", "3 menus": `event.unit.<unit>.one|many`. */
export function unit(unitName: string, count: number, t: Words): string {
  return t(`event.unit.${unitName}.${count === 1 ? 'one' : 'many'}`, { count })
}

const unitOfType = (type: string | null): string => (type ? (UNIT_OF[type.toLowerCase()] ?? 'item') : 'item')

/** A group's resources by unit, in the order first met: "1 page", "2 menus". */
function resourceParts(group: ActivityEffectGroup, t: Words, settings: boolean): string[] {
  const parts: string[] = []
  if (settings) {
    if (group.resources.length > 0) parts.push(unit('setting', group.resources.length, t))
  } else {
    const byUnit = new Map<string, number>()
    for (const r of group.resources) {
      const u = unitOfType(r.type)
      byUnit.set(u, (byUnit.get(u) ?? 0) + 1)
    }
    for (const [u, n] of byUnit) parts.push(unit(u, n, t))
  }
  if (group.operations > 0)
    parts.push(unit(settings ? 'settingsAction' : 'contentAction', group.operations, t))
  return parts
}

/**
 * The words of what an event touched, one unit each: resources by type + id, operations that named
 * no id, files by path, other actions. Never summed across units (plan §2.5).
 */
export function scopeParts(item: Pick<ActivityItemV2, 'effects'>, t: Words): string[] {
  const e = item.effects
  const parts = [...resourceParts(e.content, t, false), ...resourceParts(e.settings, t, true)]
  if (e.files.state === 'recorded' && (e.files.count ?? 0) > 0)
    parts.push(unit('file', e.files.count ?? 0, t))
  if (e.other.operations > 0) parts.push(unit('otherAction', e.other.operations, t))
  return parts
}

/** "1 page · 2 files" under the Description; null when nothing was counted. */
export function scopeLine(item: Pick<ActivityItemV2, 'effects'>, t: Words): string | null {
  const parts = scopeParts(item, t)
  return parts.length ? parts.join(' · ') : null
}

/** "a, b and c" in the viewer's words. */
export function joinList(parts: readonly string[], t: Words): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return t('event.join', { list: parts.slice(0, -1).join(', '), last: parts[parts.length - 1] ?? '' })
}

// ── Description ─────────────────────────────────────────────────────────────────────────────────

/** Ops with words of their own (`event.op.*`); aliases fold Tracy's write verbs onto them. */
const OPS = new Set([
  'create',
  'update',
  'delete',
  'publish',
  'unpublish',
  'trash',
  'archive',
  'install',
  'uninstall',
  'upload',
  'activate',
  'deactivate',
  'block',
  'unblock',
  'restore',
  'switch',
  'change'
])
const OP_ALIAS: Record<string, string> = {
  batch: 'update',
  edit: 'update',
  edited: 'update',
  save: 'update',
  modify: 'update',
  upgrade: 'update',
  add: 'create',
  insert: 'create',
  new: 'create',
  remove: 'delete',
  enable: 'activate',
  disable: 'deactivate'
}

/** The verb of an op in words: "Updated", "Published"; any op this list does not know reads "Changed". */
export function opWord(op: string | null | undefined, t: Words): string {
  return t(`event.op.${opKey(op)}`)
}

/** The key an op is looked up under: a known op, its alias, or `change`. */
function opKey(op: string | null | undefined): string {
  const raw = String(op ?? '').toLowerCase()
  return OPS.has(raw) ? raw : (OP_ALIAS[raw] ?? 'change')
}

/** A resource type in words: a few CMS types read badly as stored; the rest are the CMS's own words. */
export function typeWord(type: string | null, t: Words): string | null {
  if (!type) return null
  const u = UNIT_OF[type.toLowerCase()]
  if (u) return t(`event.type.${u}`)
  if (type === 'option' || type === 'options' || type === 'setting' || type === 'settings')
    return t('event.type.setting')
  // WordPress names installs by these; said in the reader's language, not the CMS's.
  if (type === 'theme' || type === 'plugin') return t(`event.type.${type}`)
  return type.replace(/_/g, ' ')
}

/**
 * Whether a resource id is a machine key a person cannot read or look up: a ULID (EmDash entries
 * and media), a UUID, or a long hex digest. A CMS's short ids (WordPress post 42, Joomla article
 * 2601) are what its own admin shows, so they stay.
 */
export function isOpaqueId(id: string): boolean {
  return (
    /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
    /^[0-9a-f]{20,}$/i.test(id)
  )
}

/**
 * "Updated page “About us”", "Updated article 551", "Updated setting". The target (type, then
 * name) is composed here — a titled one by `targetText`, word for word as the card under the chat
 * turn and the undo dialog name the same record; the line around it is ONE template per op (`event.line.*`, "Updated
 * {target}"), so each language orders the words and picks a form that agrees with any noun:
 * "Seite „About us“ aktualisiert", "Mise à jour : page « About us »". Until 02/10 the verb was
 * glued in front of the type, and a masculine participle before a feminine noun read
 * "Actualizado página" (the native reviewers' finding). No target at all reads the bare verb.
 */
export function resourceText(
  r: {
    type: string | null
    id: string | null
    title: string | null
    op?: string | null
    /** `tracy`: one of Tracy's own components on the site — said as Tracy's. */
    owner?: string | null
  },
  t: Words
): string {
  const type = typeWord(r.type, t)
  // E3.2 (dev e2e 04/10): an id nobody can read back in the CMS — an EmDash ULID, a UUID — is never
  // shown on its own; with no title recorded the row names the type alone ("Updated home"). A short
  // id the CMS admin shows (WordPress post 42, Joomla article 2601) is kept ONLY when no title was
  // recorded: council D1 (20/10/2026) names a titled record by its kind and title, never its id.
  const id = r.id && !isOpaqueId(r.id) ? r.id : null
  if (r.owner === 'tracy') {
    // Word order differs by language ("Tracy's plugin …" / "plugin … của Tracy"): whole templates.
    const op = opWord(r.op, t)
    const what = [type ?? t('event.type.item'), r.title ? null : id].filter(Boolean).join(' ')
    return r.title
      ? t('event.desc.tracyTitled', { op, type: type ?? t('event.type.item'), title: r.title })
      : t('event.desc.tracyTyped', { op, type: what })
  }
  // A titled record reads as the chat card names it (`targetText`: "article “Yêu chính mình”", or the
  // title alone for a kind too broad to name, WordPress's `post` and `term`), so one record never
  // has two names on one screen.
  if (r.title)
    return t(`event.line.${opKey(r.op)}`, {
      target: targetText({ kind: r.type, id: r.id, title: r.title }, t)
    })
  const name = id ? (type ? id : `${t('event.type.item')} ${id}`) : null
  const target = [type ?? (r.id && !name ? t('event.type.item') : null), name].filter(Boolean).join(' ')
  return target ? t(`event.line.${opKey(r.op)}`, { target }) : opWord(r.op, t)
}

/** The Description of an event: its result, or the request labelled as such (plan §2.3). */
export function describe(
  item: Pick<ActivityItemV2, 'description' | 'request' | 'effects'>,
  t: Words
): { text: string; isRequest: boolean } {
  const { key, params } = item.description
  const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const s = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
  // `string`: a newer server's keys (`settings.recorded`, `other.recorded`) may reach this client
  // before `ActivityDescriptionKey` in `api.ts` names them.
  switch (key as string) {
    case 'resource.op':
      return {
        text: resourceText(
          {
            op: s(params.op),
            type: s(params.type),
            id: typeof params.id === 'number' ? String(params.id) : s(params.id),
            title: s(params.title),
            owner: s(params.owner)
          },
          t
        ),
        isRequest: false
      }
    case 'effects.summary': {
      const parts = scopeParts(item, t)
      return {
        text: parts.length
          ? t('event.desc.summary', { parts: joinList(parts, t) })
          : t('event.desc.recorded'),
        isRequest: false
      }
    }
    case 'files.changed': {
      const files = n(params.files)
      return {
        text:
          files === null
            ? t('event.desc.filesChangedNoCount')
            : t(`event.desc.filesChanged.${files === 1 ? 'one' : 'many'}`, { count: files }),
        isRequest: false
      }
    }
    case 'files.changed-source-unknown':
      return { text: t('event.desc.filesSourceUnknown'), isRequest: false }
    case 'files.look-edited':
      return { text: t('event.desc.technicalOnly'), isRequest: false }
    case 'change.recorded':
      return {
        text: params.owner === 'tracy' ? t('event.desc.recordedTracy') : t('event.desc.recorded'),
        isRequest: false
      }
    // A settings operation that named no setting: said as settings, never as content.
    case 'settings.recorded':
      return {
        text:
          params.owner === 'tracy' ? t('event.desc.settingsRecordedTracy') : t('event.desc.settingsRecorded'),
        isRequest: false
      }
    // Accounts and access (the `other` group): no kind is made up for it.
    case 'other.recorded':
      return {
        text: params.owner === 'tracy' ? t('event.desc.recordedTracy') : t('event.desc.otherRecorded'),
        isRequest: false
      }
    // A Tracy update (option a): Tracy keeping its own parts of the site current.
    case 'deploy.updated':
      return {
        text:
          params.component === 'connector'
            ? t('event.desc.deployConnector')
            : t('event.desc.deployComponent'),
        isRequest: false
      }
    case 'deploy.files':
      return { text: t('event.desc.deployFiles'), isRequest: false }
    case 'deployment': {
      const files = n(params.files)
      return {
        text:
          files === null
            ? t('event.desc.filesChangedNoCount')
            : t(`event.desc.filesChanged.${files === 1 ? 'one' : 'many'}`, { count: files }),
        isRequest: false
      }
    }
    case 'housekeeping':
      return { text: t('event.desc.housekeeping'), isRequest: false }
    // The Design system button (walkthrough 11/10/2026, bug 4): apply, switch and undo read apart.
    case 'design-system.apply':
      return { text: t('event.desc.dsApplied', { name: s(params.name) ?? '' }), isRequest: false }
    case 'design-system.switch':
      return {
        text: t('event.desc.dsSwitched', { name: s(params.name) ?? '', from: s(params.from) ?? '' }),
        isRequest: false
      }
    case 'design-system.undo':
      return { text: t('event.desc.dsUndone', { name: s(params.name) ?? '' }), isRequest: false }
    case 'design-system.unsure':
      return { text: t('event.desc.dsUnsure', { name: s(params.name) ?? '' }), isRequest: false }
    // A revert made on its own (a seat key's `/v1` revert): what it took back, by apply id.
    case 'apply.revert': {
      const applyId = s(params.applyId)
      return {
        text: applyId ? t('event.desc.reverted', { applyId }) : t('event.desc.revertedUnnamed'),
        isRequest: false
      }
    }
    case 'site-changes.undo': {
      const files = n(params.files)
      const target = s(params.target) ?? ''
      return {
        text:
          files === null
            ? t('event.desc.undoNoCount', { sha: target.slice(0, 7) })
            : t(`event.desc.undo.${files === 1 ? 'one' : 'many'}`, { count: files }),
        isRequest: false
      }
    }
    // E6.5: a reset to a backup names the backup ("…back to Backup 2"), as the Everything row does;
    // a reset to a moment that is no backup (or a server that did not say) names its commit.
    case 'site-changes.reset': {
      const version = n(params.version)
      return {
        text:
          version === null
            ? t('event.desc.reset', { sha: (s(params.target) ?? '').slice(0, 7) })
            : t('event.desc.resetBackup', { version }),
        isRequest: false
      }
    }
    // ADR 0024: files AND database back to a backup, by its number when the server knows it.
    case 'site-changes.restore-everything': {
      const version = n(params.version)
      return {
        text:
          version === null
            ? t('event.desc.restoreEverythingCommit', { sha: (s(params.target) ?? '').slice(0, 7) })
            : t('event.desc.restoreEverything', { version }),
        isRequest: false
      }
    }
    // Sync to live: what the Owner sent to the live site, or put back there (counts only).
    case 'site-changes.sync-to-live': {
      const count = n(params.count)
      return {
        text:
          count === null
            ? t('event.desc.syncToLiveNoCount')
            : t(`event.desc.syncToLive.${count === 1 ? 'one' : 'many'}`, { count }),
        isRequest: false
      }
    }
    case 'site-changes.sync-to-live-undo':
      return { text: t('event.desc.syncToLiveUndo'), isRequest: false }
    case 'request': {
      const text = item.request.text ? readableRequest(item.request.text).trim() : ''
      return text ? { text, isRequest: true } : { text: t('event.desc.recorded'), isRequest: false }
    }
    default: {
      // A key a newer server added: the request if there is one, else the plain fallback — never blank.
      const request = item.request.text ? readableRequest(item.request.text).trim() : ''
      return request
        ? { text: request, isRequest: true }
        : { text: t('event.desc.recorded'), isRequest: false }
    }
  }
}

/** How long a request may be as a row's title before it is cut (the row truncates on screen too). */
const REQUEST_TITLE_MAX = 90

/**
 * A Chat row's title (06/10/2026, `plan-verified.html` door d3): the person's own request, in
 * one line, cut at {@link REQUEST_TITLE_MAX} — the result ("Updated post 42") moves to the line
 * under it. Null for every other row, and for a chat turn that kept no words: it keeps today's
 * Description.
 */
export function requestTitleOf(
  item: Pick<ActivityItemV2, 'kind' | 'origin' | 'request'>,
  max = REQUEST_TITLE_MAX
): string | null {
  if (item.kind !== 'turn' || item.origin.source !== 'chat' || !item.request.text) return null
  const lines = readableRequest(item.request.text)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const first = lines[0] ?? ''
  if (first === '') return null
  const short = first.length > max ? first.slice(0, max - 1).trimEnd() : first
  // Cut here, cut when it was stored, or more lines after the first: the title says it goes on.
  const cut = short !== first || item.request.state === 'truncated' || lines.length > 1
  return cut && !endsInEllipsis(short) ? `${short}…` : short
}

// ── Undo ────────────────────────────────────────────────────────────────────────────────────────

/**
 * What an undo did to this event, in words that claim nothing about its content (plan §3.3): the
 * files part, and — when the undo left parts of the event in place — which. Null when not undone.
 *
 * A chat turn the undo engine took back (`undone`, from the chat card, the Site changes row or the
 * preview's Undo) says "Undone", or "Partly undone" when part of it stayed: the engine puts back the
 * content as well as the files, so the files-only words below would understate it. ONE label: it
 * takes the place of the files status, never stands beside it (toolbar contract §4).
 */
export function undoStatus(
  item: Pick<ActivityItemV2, 'reversal'> & Pick<Partial<ActivityItemV2>, 'undone'>,
  t: Words
): string | null {
  if (item.undone) return t(item.undone.complete ? 'event.status.undone' : 'event.status.partlyUndone')
  const r = item.reversal
  if (r.state === 'undone') return t('event.status.filesUndone')
  if (r.state !== 'partially-undone') return null
  const parts = r.partsNotReversed ?? []
  const someFiles = parts.includes('other-moments') || parts.includes('unknown-moments')
  const content = parts.includes('content') || parts.includes('other')
  const settings = parts.includes('settings')
  const head = someFiles ? t('event.status.someFilesUndone') : t('event.status.filesPart')
  const tail =
    content && settings
      ? t('event.status.contentSettingsNot')
      : content
        ? t('event.status.contentNot')
        : settings
          ? t('event.status.settingsNot')
          : someFiles
            ? t('event.status.otherCommitsNot')
            : null
  return tail ? `${head} · ${tail}` : head
}

/** The commit an Undo file changes of this event targets, when the server allows one. */
export const undoTarget = (item: Pick<ActivityItemV2, 'capabilities' | 'effects'>): string | null =>
  item.capabilities.canUndoFiles && item.effects.files.sha ? item.effects.files.sha : null

/**
 * Why no Undo is offered, in words, or null when nothing needs saying (it is an undo itself, it
 * was undone already — the status says so — or it changed nothing).
 */
export function noUndoReason(
  item: Pick<ActivityItemV2, 'capabilities' | 'effects' | 'reversal'> & {
    origin?: Pick<ActivityItemV2['origin'], 'source'>
  },
  cms: string,
  t: Words
): string | null {
  if (undoTarget(item) !== null || item.reversal.state !== 'none') return null
  const reasons = item.capabilities.reasons
  if (reasons.includes('forbidden')) return t('event.noUndo.forbidden')
  // What the event changed comes first: on a site with no file history (EmDash) a content edit is
  // still "content can't be undone from here", not a sentence about files it never touched.
  const e = item.effects
  const content = e.content.resources.length + e.content.operations > 0
  const settings = e.settings.resources.length + e.settings.operations > 0
  if (content && settings) return t('event.noUndo.contentSettings')
  if (content) return t('event.noUndo.contentOnly')
  if (settings) return t('event.noUndo.settingsOnly')
  if (reasons.includes('no-file-history')) return t('event.noUndo.untracked', { cms })
  // A Tracy update (Source `deployment`) is Tracy's own change: "changes Tracy didn't make" would
  // be false right beside it (stand re-verify 02/10).
  if (item.origin?.source === 'deployment') return t('event.noUndo.tracyUpdate')
  if (reasons.includes('outside')) return t('event.noUndo.outside')
  return null
}

/**
 * The answer of `POST /restore` (Site changes V2, contract §3, D3) as one outcome. `unknown` covers
 * every answer that does not PROVE what happened — a lost reply, a timeout, a server error after
 * the press reached it — and is never worded "nothing was changed".
 */
export type UndoOutcome =
  | { status: 'succeeded'; operationId: string | null; files: number | null }
  | { status: 'succeeded_noop'; operationId: string | null }
  | { status: 'unknown'; operationId: string | null }
  | { status: 'conflict'; files: string[] }
  | { status: 'not-undoable' }
  | { status: 'forbidden' }
  | { status: 'rate-limited' }
  | { status: 'failed'; operationId: string | null }

/** `httpStatus` null: no answer at all (the request may have reached the server). */
export function undoOutcomeOf(httpStatus: number | null, body: unknown): UndoOutcome {
  const b = (body && typeof body === 'object' ? body : {}) as {
    ok?: unknown
    code?: unknown
    status?: unknown
    operationId?: unknown
    files?: unknown
    reason?: unknown
  }
  const operationId = typeof b.operationId === 'string' ? b.operationId : null
  if (httpStatus === null) return { status: 'unknown', operationId }
  if (httpStatus >= 200 && httpStatus < 300 && httpStatus !== 202 && b.ok === true) {
    if (b.status === 'succeeded_noop') return { status: 'succeeded_noop', operationId }
    if (b.status === 'unknown' || b.status === 'pending') return { status: 'unknown', operationId }
    return { status: 'succeeded', operationId, files: typeof b.files === 'number' ? b.files : null }
  }
  if (b.status === 'unknown' || b.status === 'pending' || httpStatus === 202)
    return { status: 'unknown', operationId }
  if (httpStatus === 409 && b.code === 'CONFLICT')
    return { status: 'conflict', files: Array.isArray(b.files) ? b.files.map(String) : [] }
  if (httpStatus === 409 && b.code === 'NOT_UNDOABLE') return { status: 'not-undoable' }
  if (httpStatus === 403 && b.code === 'FORBIDDEN_WRITE') return { status: 'forbidden' }
  if (httpStatus === 429) return { status: 'rate-limited' }
  if (b.status === 'failed') return { status: 'failed', operationId }
  // An older server names no status: a timeout may still have run; a 5xx may come after the host
  // was asked. Only a refusal before anything ran (4xx) is a plain failure.
  if (b.reason === 'timeout' || httpStatus >= 500) return { status: 'unknown', operationId }
  return { status: 'failed', operationId }
}

/** A key naming one press, for `idemKey` (`[A-Za-z0-9._:-]{8,128}`). Works off a secure context too. */
export function newIdemKey(random: (bytes: Uint8Array) => Uint8Array): string {
  const bytes = random(new Uint8Array(16))
  return `undo-${[...bytes].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

// ── Links between an undo and what it undid ─────────────────────────────────────────────────────

/** Two sha spellings name one commit when one is a prefix of the other (short shas from a subject). */
const sameCommit = (a: string | null | undefined, b: string | null | undefined): boolean =>
  Boolean(a && b && a.length >= 7 && b.length >= 7 && (a.startsWith(b) || b.startsWith(a)))

/** The event an undo/reset targeted, among those loaded. */
export function targetEventOf(
  undo: Pick<ActivityItemV2, 'evidence'>,
  items: readonly ActivityItemV2[]
): ActivityItemV2 | null {
  const target = undo.evidence.targetSha
  if (!target) return null
  return (
    items.find(
      (i) =>
        i.reversal.state !== 'not-applicable' &&
        (sameCommit(i.effects.files.sha, target) || sameCommit(i.evidence.commitSha, target))
    ) ?? null
  )
}

/** The undo event that took this one back, among those loaded. */
export function undoEventOf(
  item: Pick<ActivityItemV2, 'reversal'>,
  items: readonly ActivityItemV2[]
): ActivityItemV2 | null {
  const link = item.reversal.link
  if (!link) return null
  return (
    items.find((i) =>
      link.kind === 'operation'
        ? i.kind === 'operation' && i.id === link.id
        : i.reversal.state === 'not-applicable' &&
          (i.id === link.id || sameCommit(i.evidence.commitSha, link.id))
    ) ?? null
  )
}

/** Whether a turn's record may be off: an amber mark beside the Description, explained opened. */
export const isFlaggedV2 = (item: Pick<ActivityItemV2, 'flags' | 'state'>): boolean =>
  item.state === 'stale' || item.flags?.unsealedStart === true || item.flags?.concurrent === true

// ── Requests recorded with mention markup ───────────────────────────────────────────────────────

/**
 * A recorded request as a person reads it. Until 03/10/2026 the host cut a `tracy-element` block
 * from the person's words only when it stood on lines of its own, so a request recorded before then
 * may still carry one mid-line, squeezed onto one line ("```tracy-element <mentioned-element url=…
 * selector="#a &gt; div"…", 03/10). The host now says each block in the chip's words when it
 * records (`personWords` with `mentions: 'label'`); this reads the older rows by the same rule
 * (`replaceMentions`, `@tracy/core/mention`), decodes entities and collapses spaces in each line.
 * A request without a block is returned exactly as it was.
 */
export function readableRequest(text: string): string {
  if (!text.includes('```tracy-element') && !text.includes('```tracy-page')) return text
  return decodeEntities(replaceMentions(text, (words) => ` ${words} `))
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

// ── Backup notes (ADR 0024; 02/10: notes for a person) ─────────────────────────────────────

/** A request said in one line for a person: its first line, at most 80 characters. */
const oneLine = (text: string): string => {
  const first = text.trim().split(/\r?\n/)[0]?.trim() ?? ''
  return first.length > 80 ? `${first.slice(0, 79).trimEnd()}…` : first
}

/**
 * The notes "Create a backup" starts with (02/10): for a PERSON to read — one line per change
 * since the last backup, in the words Site changes shows (the recorded result, its Source and who),
 * oldest first. A raw request appears only when a change recorded no result, cut to one short line;
 * the same line repeated is said once with a count; past `max` lines, "…and N more changes".
 * @param items - the changes since the last backup, newest first (the list's order).
 */
export function draftBackupNotes(
  items: readonly ActivityItemV2[],
  t: Words,
  { max = 10 }: { max?: number } = {}
): string {
  const groups = new Map<string, number>()
  for (const item of [...items].reverse()) {
    const words = describe(item, t)
    const text = words.isRequest ? oneLine(words.text) : words.text
    if (!text) continue
    const by = byOf(item)
    const source = t(`event.source.${item.origin.source}`)
    const who = by.kind === 'unknown' ? null : byName(by, t)
    const line = `${text} — ${who && who !== source ? `${source}, ${who}` : source}`
    groups.set(line, (groups.get(line) ?? 0) + 1)
  }
  const lines = [...groups.entries()]
  const shown = lines.slice(0, max).map(([line, n]) => `· ${line}${n > 1 ? ` ×${n}` : ''}`)
  const rest = lines.slice(max).reduce((sum, [, n]) => sum + n, 0)
  if (rest > 0) shown.push(t(`backup.draftMore.${rest === 1 ? 'one' : 'many'}`, { count: rest }))
  return shown.join('\n')
}

/** The changes a new backup would keep: the events newer than the newest backup (all of them before one). */
export function changesSince(
  items: readonly ActivityItemV2[],
  latest: { at: number | null } | null
): ActivityItemV2[] {
  if (latest === null || latest.at === null) return [...items]
  const since = latest.at
  return items.filter((i) => {
    const iso = i.occurredAt ?? i.detectedAt
    const at = iso ? Math.floor(Date.parse(iso) / 1000) : null
    return at === null || Number.isNaN(at) || at > since
  })
}
// ── Site changes badge (plan `tasks/todo-site-changes-badge-count.md`) ─────────────────────────

/**
 * The window event the Site changes tab sends once it marked the site's changes seen (`PUT
 * …/activity/seen` answered): `detail: {siteKey, seenAt}`. The start screen's card (another plugin,
 * another bundle — a module singleton would not be shared) drops its count to 0 on it and reads again.
 */
export const CHANGES_SEEN_EVENT = 'tracy:changes-seen'

/** The key a row is lit under: its kind and id (`ChangesView` `key`). */
export const rowKey = (item: Pick<ActivityItemV2, 'kind' | 'id'>): string => `${item.kind}:${item.id}`

/**
 * The rows lit in this open of the tab: every row the server flagged `unseen` in any answer so far
 * (the first page, a refresh, a page more), added to `prev`. The server decides with the badge's own
 * rule (`unseenOf`), so the list lights exactly the rows the card counted; the set only grows while
 * the tab is open, because the watermark moves the moment the list is drawn and a refresh would
 * otherwise put out what the person has not finished reading. Returns `prev` itself when nothing new.
 */
export function litKeys(
  items: readonly Pick<ActivityItemV2, 'kind' | 'id' | 'unseen'>[],
  prev: ReadonlySet<string>
): ReadonlySet<string> {
  let next: Set<string> | null = null
  for (const item of items) {
    if (item.unseen !== true) continue
    const k = rowKey(item)
    if (prev.has(k)) continue
    if (next === null) next = new Set(prev)
    next.add(k)
  }
  return next ?? prev
}

/** How many rows of a page are lit ({@link litKeys}): the "N new since you last looked" divider. */
export function unreadCount(
  items: readonly Pick<ActivityItemV2, 'kind' | 'id'>[],
  lit: ReadonlySet<string>
): number {
  return items.filter((i) => lit.has(rowKey(i))).length
}

/**
 * The round count's text on a start card: nothing at 0, the number to 9, `9+` above (plan §2.7 —
 * past nine the exact number no longer changes what the person does, and the card stays one line).
 */
export function badgeText(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return ''
  return count > 9 ? '9+' : String(Math.floor(count))
}

/** Whether a stored text already ends in an ellipsis: a cut text then gets no second " …". */
export const endsInEllipsis = (text: string): boolean => /(…|\.\.\.)\s*$/.test(text)

// ── Open conversation, Tracy replied (plan `tasks/todo-open-conversation.md` A, C) ─────────────

/** The chat a Chat or Comment row came from, when the server named it. */
export type ConversationRef = NonNullable<ActivityItemV2['conversation']>

/** The conversation behind a row: Chat and Comment turns only, and only with a session id. */
export function conversationOf(
  item: Pick<ActivityItemV2, 'origin'> & { conversation?: ActivityItemV2['conversation'] }
): ConversationRef | null {
  const c = item.conversation
  if (!c || typeof c.sessionId !== 'string' || !c.sessionId) return null
  return item.origin.source === 'chat' || item.origin.source === 'comment' ? c : null
}

/**
 * The address "Open conversation" opens in a new window: the site page on that session, its
 * Browser tab in Edit, and — when the prompt's message id was kept — the message to scroll to.
 */
export function conversationLink(siteKey: string, c: ConversationRef): string {
  const query = new URLSearchParams({ open: 'browser', mode: 'edit' })
  if (c.promptMessageId) query.set('tracy-msg', c.promptMessageId)
  return `/${encodeURIComponent(siteKey)}/s/${encodeURIComponent(c.sessionId)}?${query.toString()}`
}

/** What Tracy said at the end of the turn, as the turn record stored it (C). */
export interface Reply {
  text: string
  /** `truncated`: cut when saved; `interrupted`: the turn stopped before Tracy finished its reply. */
  state: 'full' | 'truncated' | 'interrupted'
}

/**
 * The stored reply of a turn, or null — a turn recorded before replies were kept, an older server,
 * or anything that is not the shape (read defensively: the field is newer than the type here).
 */
export function replyOf(item: object): Reply | null {
  const r = (item as { reply?: unknown }).reply
  if (!r || typeof r !== 'object') return null
  const { text, state } = r as { text?: unknown; state?: unknown }
  if (typeof text !== 'string' || !text.trim()) return null
  return { text, state: state === 'truncated' || state === 'interrupted' ? state : 'full' }
}

// ── Open comment (02/10: land on the comment itself) ──────────────────────────────────────

/** The fields of a Comment row's comment this file reads; `id` and `deleted` are newer than `api.ts`. */
export interface CommentRef {
  url: string
  /** `site_comment.id` of the comment the request was sent from; absent from an older server. */
  id?: string | null
  /** The comment was deleted since: its row keeps who and where, and offers no link. */
  deleted?: boolean
}

/** Parameters of a page address that are Tracy's own and never part of a link. */
const LINK_DROPPED = ['tracy_preview', 'tracy_reload']

/**
 * Where "Open comment" goes, or null when there is nothing to open (the comment was deleted).
 *
 * With the comment's id: the Tracy page in Edit on the comment's page, `comment=<id>` — the
 * Browser tab's own deep link (rule 6 of `dsh-better-sidebar`, `commentDeepLink`), which scrolls
 * to the pin and opens its thread. Without one (an older server, a request sent with no comment
 * row): the page itself, as before.
 */
export function commentLink(siteKey: string, comment: CommentRef): string | null {
  if (comment.deleted === true) return null
  const id = typeof comment.id === 'string' && comment.id ? comment.id : null
  if (!comment.url) return null
  if (id === null) return comment.url
  let parsed: URL
  try {
    parsed = new URL(comment.url)
  } catch {
    return comment.url
  }
  for (const name of LINK_DROPPED) parsed.searchParams.delete(name)
  // The Browser tab's own `mode` on a recorded address is a view setting, not part of the page.
  const kept = parsed.searchParams.getAll('mode').filter((m) => m !== 'edit' && m !== 'interactive')
  parsed.searchParams.delete('mode')
  for (const m of kept) parsed.searchParams.append('mode', m)
  const query = new URLSearchParams({
    open: 'browser',
    page: `${parsed.pathname}${parsed.search}`,
    mode: 'edit',
    comment: id
  })
  return `/${encodeURIComponent(siteKey)}/?${query.toString()}`
}

/**
 * What the arrow beside a row's Source opens (02/10), or null for no arrow: the reader's own
 * chat (scrolled to its message), or a Comment row's comment while it still exists. Every other
 * row — another person's chat, a deleted comment, any other Source — has none.
 */
export function quickOpenOf(
  siteKey: string,
  item: Pick<ActivityItemV2, 'origin'> & {
    conversation?: ActivityItemV2['conversation']
    comment?: CommentRef
  }
): { kind: 'chat' | 'comment'; href: string } | null {
  if (item.origin.source === 'chat') {
    const c = conversationOf(item)
    return c?.mine ? { kind: 'chat', href: conversationLink(siteKey, c) } : null
  }
  if (item.origin.source === 'comment' && item.comment) {
    const href = commentLink(siteKey, item.comment)
    return href === null ? null : { kind: 'comment', href }
  }
  return null
}

/**
 * Whether a cut reply still needs the " …" the list adds: not when the stored text already ends in
 * an ellipsis (the turn record cuts with "…"), which would read "is… …" (wave r1 B2).
 */
export const replyNeedsEllipsis = (reply: Reply): boolean =>
  reply.state === 'truncated' && !/(…|\.\.\.)\s*$/.test(reply.text)
