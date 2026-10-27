/**
 * The host job contract of "Sync to live" (plan tasks/ke-hoach-sync-to-live.md §4 row 1), in one
 * place: the job kinds tracy-web files, the body each one carries, the stages a running job's
 * progress lines belong to, and how each phase's answer becomes what a person is shown. The host
 * side is `webroot-live-push.sh` and its contract `scripts/webroot/LIVE-PUSH-CONTRACT.md` in
 * `@tracy/fleet-operation`; a change of shape on either side is aligned HERE, not in `live-push.js`.
 *
 * Each phase answers on its last JSON line (`lastJson` of `live-sync.js`), contract §2–§5:
 *
 *   preview  {ok, state: 'ready' | 'nothing', items: [Item & {op, group}], unsupported: [{what, …, reason}],
 *             limit, overLimit, hasDeletes, hasPhp, itemsTotal, unsupportedTotal, sync}
 *            `group`: add | change | remove (records), files, settings, php (a PHP file: its own OK).
 *            or {ok: false, code: 'SYNC_NEEDS_ATTENTION', sync} when the Sync from live it runs first
 *            held records (a person decides in Sync from live first), or {ok: false, code}.
 *   apply    {ok, state: 'applied' | 'partial' | 'nothing', written, conflicts, failed, skipped, sync}
 *   undo     {ok, state: 'undone' | 'partial' | 'nothing', restored, kept, failed, sync}
 *
 *   Item = {id, kind, op, title, liveId, fields: {<name>: {before, after}}, path?, size?, warning?, conflict?}: `id`
 *   is the host's own name of the change, stable within a preview. A person is shown the field NAMES
 *   only, and of a file its name and size, never its bytes.
 *   An item with `conflict` (both sites changed it) is not written: the dialog lists it apart.
 *
 * One `site_push` row is one preview and the push of it: its id is both the `previewId` and the
 * `pushId` of the host (the two live in different folders there).
 */

/** The job kinds, one per phase. */
export const PUSH_KINDS = Object.freeze({
  preview: 'webroot-live-push-preview',
  apply: 'webroot-live-push-apply',
  undo: 'webroot-live-push-undo'
})

/** How long a preview may wait for its push; past it the Owner previews again (the copy moves on). */
export const PREVIEW_TTL_MS = 30 * 60_000
/**
 * At most this many changes go to the live site in one push (plan §3). The host applies the first
 * ones in dependency order and answers the rest `skipped: over-limit`; its own `limit` wins.
 */
export const PUSH_MAX_ITEMS = 200

/**
 * The stage a running phase's step belongs to (`==> [12s] <step>` lines, as webroot-sync.sh prints),
 * or null. The Publish tab's Sync to live flow draws one line per stage of the phase under way
 * (`@tracy/core` `site-tabs/publish/PushStep.tsx`). A step that starts `stage: <name>` names its
 * stage outright; the rest are matched on their words.
 */
const STAGE_OF = [
  [
    /^(sync from live|syncing|reading the live site|the live site (read|moved)|merging|putting the result)/i,
    'syncing'
  ],
  [/^(comparing|changeset|computing|listing)/i, 'comparing'],
  [/^(writing|pushing|checking the live|content\.|uploading)/i, 'writing'],
  [/^(re-?reading|after the push|sync after|syncing again)/i, 'settling'],
  [/^(undoing|putting back|restoring)/i, 'undoing']
]
/** The stages of each phase, in order. */
export const PHASE_STAGES = Object.freeze({
  preview: ['syncing', 'comparing'],
  apply: ['writing', 'settling'],
  undo: ['undoing', 'settling']
})

/** @param {string} step */
export function pushStageOf(step) {
  const explicit = /^stage:\s*([a-z]+)/.exec(step)
  if (explicit) return explicit[1]
  return STAGE_OF.find(([re]) => re.test(step))?.[1] ?? null
}

/** The body of a phase's host job (contract §1). The token travels here and nowhere else. */
export function jobBody(
  phase,
  { id, endpoint, token, deletes = false, php = false, baseFingerprint = null, byEmail, byName }
) {
  const by = byEmail ? { byEmail, byName: byName || byEmail } : {}
  if (phase === 'preview')
    return {
      kind: PUSH_KINDS.preview,
      previewId: id,
      endpoint,
      token,
      // The first-sync base Sync from live sends (`live-sync.js` start): the import's fingerprint.
      // tracy-web holds no signed import archive for a sync, so `baseWebrootUrl`/`baseDbUrl` are not sent.
      ...(baseFingerprint && typeof baseFingerprint === 'object' ? { baseFingerprint } : {}),
      ...by
    }
  // The Sync from live after an apply or an undo is not the Owner's to wait for: the host answers once
  // the writes are done (`sync: {state: 'later'}`) and tracy-web starts it, the lease handed over.
  if (phase === 'apply')
    return {
      kind: PUSH_KINDS.apply,
      previewId: id,
      pushId: id,
      confirm: { deletes: deletes === true, php: php === true },
      settle: 'later',
      endpoint,
      token,
      ...by
    }
  return { kind: PUSH_KINDS.undo, pushId: id, settle: 'later', endpoint, token, ...by }
}

/** The state a phase's answer settles its row in, or null for a failure. */
export function settledState(phase, said) {
  if (phase === 'preview') {
    if (said?.code === 'SYNC_NEEDS_ATTENTION' || said?.state === 'held') return 'held'
    return said?.ok === true && ['ready', 'nothing', 'previewed'].includes(said.state) ? 'previewed' : null
  }
  if (phase === 'apply')
    return said?.ok === true && ['applied', 'partial', 'nothing', 'pushed'].includes(said.state)
      ? 'pushed'
      : null
  return said?.ok === true && ['undone', 'partial', 'nothing'].includes(said.state) ? 'undone' : null
}

const str = (v, max = 200) => (v === null || v === undefined ? null : String(v).slice(0, max))

/** A word's name the dialog translates (`what`, `label`): letters, digits and `_` only, or nothing. */
const wordName = (v) => (typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(v) ? v : null)

/** What a change is and the fixed words of its title, by name (contract §2): the dialog says them. */
function wordsOf(raw) {
  const what = wordName(raw?.what)
  const label = wordName(raw?.label)
  return {
    ...(what ? { what } : {}),
    ...(label ? { label } : {}),
    ...(label && raw?.subject !== undefined && raw?.subject !== null ? { subject: str(raw.subject) } : {})
  }
}

/** One change as a person reads it: no values, the field names only, cut short. */
export function itemOf(raw) {
  const fields = Array.isArray(raw?.fields)
    ? raw.fields
    : raw?.fields && typeof raw.fields === 'object'
      ? Object.keys(raw.fields)
      : null
  const out = {
    id: String(raw?.id ?? ''),
    kind: str(raw?.kind, 60) ?? 'content',
    title: str(raw?.title),
    ...(raw?.liveId !== undefined && raw?.liveId !== null ? { liveId: str(raw.liveId, 40) } : {}),
    ...(fields ? { fields: fields.slice(0, 20).map((f) => String(f).slice(0, 80)) } : {}),
    ...wordsOf(raw)
  }
  if (raw?.op !== undefined) out.op = str(raw.op, 20)
  // A file: its size, never its bytes (and its path is its title).
  if (Number.isSafeInteger(raw?.size) && raw.size >= 0) out.size = raw.size
  if (raw?.reason !== undefined) out.reason = str(raw.reason, 80)
  // A parent theme's file (WordPress): an update of that theme replaces it, which the Owner is told.
  if (typeof raw?.warning === 'string') out.warning = str(raw.warning, 40)
  // Open in the live site's editor (`open-in-editor`): the administrator's display name the engine
  // gave, so the Owner knows whom to ask to close it.
  if (typeof raw?.lockedBy === 'string' && raw.lockedBy) out.lockedBy = str(raw.lockedBy, 80)
  const code = raw?.code ?? raw?.error
  if (code !== undefined) out.code = str(code, 80)
  return out
}
const items = (list) =>
  Array.isArray(list)
    ? list
        .slice(0, 1000)
        .map(itemOf)
        .filter((i) => i.id)
    : []

/** The groups of a preview, in the dialog's order. */
export const PUSH_GROUPS = Object.freeze(['add', 'change', 'remove', 'files', 'settings', 'php'])

/** The group of a preview item: the host's own, else by its op. */
function groupOf(item) {
  if (PUSH_GROUPS.includes(item?.group)) return item.group
  if (item?.op === 'create' || item?.op === 'upload') return 'add'
  if (item?.op === 'delete') return 'remove'
  return 'change'
}

/** An unsupported change as a person reads it: what it is, and its name (contract §2 `unsupported`). */
function unsupportedOf(u) {
  const what = str(u?.what, 40) ?? 'other'
  const name =
    what === 'file'
      ? u.path
      : what === 'field'
        ? [u.title, u.field].filter(Boolean).join(' › ')
        : what === 'setting'
          ? [u.file, u.name].filter(Boolean).join(' › ')
          : what === 'table'
            ? [u.table, ...(Array.isArray(u.names) ? u.names.slice(0, 5) : [])].filter(Boolean).join(' · ')
            : (u?.title ?? u?.name ?? u?.path)
  return {
    kind: str(u?.kind, 60) ?? what,
    name: str(name) ?? '',
    reason: str(u?.reason ?? u?.change, 80),
    // Its kind already says what it is; the fixed words of its name ride along.
    ...wordsOf({ label: u?.label, subject: u?.subject }),
    ...(Number.isSafeInteger(u?.size) && u.size >= 0 ? { size: u.size } : {}),
    // `too-large`: the most the live site's door takes for one file (8 MiB media, 2 MiB template files).
    ...(Number.isSafeInteger(u?.limit) && u.limit > 0 ? { limit: u.limit } : {})
  }
}

/** A preview answer as the dialog groups it. */
export function previewOf(said) {
  const all = Array.isArray(said?.items) ? said.items : Array.isArray(said?.changes) ? said.changes : []
  // An item the Sync from live just kept Tracy's version of where the customer changed it on the live
  // site too (`conflict: changed-on-both`): the apply does not write it, so it is not in any group.
  const pushable = all.filter((c) => !c?.conflict)
  const by = (group) => items(pushable.filter((c) => groupOf(c) === group))
  const unsupported = (Array.isArray(said?.unsupported) ? said.unsupported : [])
    .slice(0, 300)
    .map(unsupportedOf)
  const add = by('add')
  const change = by('change')
  const remove = by('remove')
  const files = by('files')
  const settings = by('settings')
  const php = by('php')
  const total = (v, fallback) => (Number.isSafeInteger(v) && v >= fallback ? v : fallback)
  return {
    // Which CMS: the switches a reason names are called differently on each (Options › Template files,
    // Settings › Claude Cowork › Theme files).
    ...(said?.platform === 'joomla' || said?.platform === 'wordpress' ? { platform: said.platform } : {}),
    add,
    change,
    remove,
    files,
    settings,
    php,
    unsupported,
    // The places the live site changed since the last sync that the push leaves alone.
    liveChanged: [
      ...items(all.filter((c) => c?.conflict).map((c) => ({ ...c, reason: c.conflict.reason ?? null }))),
      ...items(said?.liveChanged)
    ],
    held: Array.isArray(said?.sync?.held) ? said.sync.held.length : 0,
    limit: Number.isSafeInteger(said?.limit) && said.limit > 0 ? said.limit : PUSH_MAX_ITEMS,
    itemsTotal: total(
      said?.itemsTotal,
      add.length + change.length + remove.length + files.length + settings.length + php.length
    ),
    unsupportedTotal: total(said?.unsupportedTotal, unsupported.length)
  }
}

/** An apply answer: what reached the live site, what was left as it was and why. */
export function resultOf(said) {
  return {
    pushed: items(said?.written ?? said?.pushed),
    conflicts: items(said?.conflicts),
    failed: items(said?.failed),
    skipped: items(said?.skipped)
  }
}

/** An undo answer: what was put back, what the live site changed since and was left. */
export function undoOf(said) {
  return {
    restored: items(said?.restored),
    conflicts: items(said?.kept ?? said?.conflicts),
    failed: items(said?.failed)
  }
}
