#!/usr/bin/env node
// Reconcile a running EmDash site with a template's seed: text content, media and forms, through
// the site's admin API with the agent token. Every write is recorded in a receipt so a re-run
// creates nothing twice, an interrupted run resumes, and anything an editor touched is left alone
// and reported instead of overwritten.
//
//   node tools/seed-apply.mjs <status|schema|adopt|content|media|forms|all> [options]
//     --site <origin>        default http://127.0.0.1:4360 (or $TEMPLATE_SITE)
//     --token-file <path>    default data/tracy-agent.token (ec_pat_ token from tools/mint-admin.cjs)
//     --seed <dir>           default seed/ (seed.json, media-map.json, media/)
//     --config <file>        default template.config.json (identity, locales, content order, form bindings)
//     --receipts <file>      default data/seed-receipts.json
//     --dry-run              plan only, write nothing
//     --force                resolve CONFLICTS (seed changed AND editor changed / draft) in the seed's favour
//     --force-all            also reset entries the editor changed while the seed did not (`editor` state)
//     --only <coll[,coll]>   limit content to some collections
//
// Exit codes: 0 done · 1 API/tool failure · 3 finished with conflicts/skips that need a decision
//
// Ownership model. Stable key = `<collection>/<slug>/<locale>`; receipts hold {id, rev, seedHash}
// of OUR last write. Live `_rev` != receipt rev means someone else wrote since: the entry is
// editor-owned until a human says otherwise (`--force`). Entries with no receipt are "untracked":
// `adopt` claims them WITHOUT writing when their live data already equals the seed (a site whose
// first-run setup applied this same seed); anything else stays untracked and is reported.
//
// Drafts. A privileged GET overlays the pending draft into `item.data`; the public site serves
// `liveData`. Media/form repairs therefore patch `liveData` only, and only when the entry has no
// pending draft (`draftRevisionId`) and no editor divergence -- otherwise they skip and report, so
// an image fix can never publish someone's unfinished text.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const command = args[0]
const opt = (name, dflt) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : dflt
}
const flag = (name) => args.includes(name)
const COMMANDS = ['status', 'schema', 'adopt', 'content', 'media', 'forms', 'all']
if (!COMMANDS.includes(command ?? '')) {
  console.error(
    `usage: seed-apply.mjs <${COMMANDS.join('|')}> [--site url] [--token-file f] [--seed dir] [--config f] [--dry-run] [--force] [--only coll]`
  )
  process.exit(2)
}
const SITE = opt('--site', process.env.TEMPLATE_SITE ?? 'http://127.0.0.1:4360').replace(/\/+$/, '')
const TOKEN_FILE = opt('--token-file', 'data/tracy-agent.token')
const SEED_DIR = opt('--seed', 'seed')
const CONFIG_FILE = opt('--config', 'template.config.json')
const RECEIPTS_FILE = opt('--receipts', 'data/seed-receipts.json')
const DRY = flag('--dry-run')
const FORCE_ALL = flag('--force-all')
const FORCE = flag('--force') || FORCE_ALL
const ONLY = (opt('--only', '') || '').split(',').filter(Boolean)

const token = existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : ''
if (!/^ec_pat_[A-Za-z0-9_-]{16,}$/.test(token)) {
  console.error(`no agent token at ${TOKEN_FILE} (mint one with tools/mint-admin.cjs)`)
  process.exit(1)
}
const config = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) : {}
const seed = JSON.parse(readFileSync(path.join(SEED_DIR, 'seed.json'), 'utf8'))
// EmDash ≥0.41: a reference field naming a target collection (or a relation) is bound to a relation.
// Its value is not in `data`: writes carry it under `references` (arrays of entry ids; a bound key in
// `data` is refused), and a single-entry read returns it under `item.references[slug].children`. The
// seed keeps writing `$ref:` in data; the selection belongs to the translation group, so it is
// compared as `collection:slug` keys, the same in every locale.
const BOUND_REFS = new Map(
  (seed.collections ?? []).map((c) => [
    c.slug,
    new Set(
      c.fields
        .filter((f) => f.type === 'reference' && (f.validation?.targetCollection || f.validation?.relation))
        .map((f) => f.slug)
    )
  ])
)
const boundRefs = (collection) => BOUND_REFS.get(collection) ?? new Set()
/** Resolved seed data as the write body wants it: columns in `data`, selections in `references`. */
function splitRefs(collection, data) {
  const bound = boundRefs(collection)
  if (!bound.size) return { data, references: undefined }
  const columns = {}
  const references = {}
  for (const [k, v] of Object.entries(data)) {
    if (bound.has(k)) references[k] = (Array.isArray(v) ? v : [v]).filter((x) => typeof x === 'string' && x)
    else columns[k] = v
  }
  return { data: columns, references }
}
/** Resolved seed data with each bound selection as the `collection:slug` keys its `$ref:`s name. */
function comparable(e, data) {
  const bound = boundRefs(e.collection)
  if (!bound.size) return data
  const out = { ...data }
  for (const k of bound)
    if (k in out)
      out[k] = (Array.isArray(e.data[k]) ? e.data[k] : [e.data[k]])
        .filter((x) => typeof x === 'string' && x.startsWith('$ref:'))
        .map((x) => x.slice(5).split(':').slice(0, 2).join(':'))
  return out
}
const LOCALES = config.locales ?? [
  ...new Set(
    Object.values(seed.content ?? {})
      .flat()
      .map((e) => e.locale ?? seed.defaultLocale ?? 'en')
  )
]
const mediaMapFile = path.join(SEED_DIR, 'media-map.json')
const mediaMap = existsSync(mediaMapFile) ? JSON.parse(readFileSync(mediaMapFile, 'utf8')) : { items: [] }
const FORMS_FILE = opt('--forms', config.forms?.file ?? 'tools/forms.json')
const receipts = existsSync(RECEIPTS_FILE)
  ? JSON.parse(readFileSync(RECEIPTS_FILE, 'utf8'))
  : { version: 2, site: SITE, entries: {}, media: {}, forms: {}, runs: [] }
receipts.entries ??= {}
receipts.media ??= {}
receipts.forms ??= {}
const run = {
  id: new Date().toISOString().replace(/[:.]/g, '-'),
  command,
  dryRun: DRY,
  force: FORCE,
  startedAt: new Date().toISOString(),
  ops: [],
  conflicts: []
}
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const stableHash = (v) => sha256(JSON.stringify(v))
function saveReceipts() {
  if (DRY) return
  receipts.site = SITE
  const record = {
    id: run.id,
    command,
    force: FORCE,
    forceAll: FORCE_ALL,
    startedAt: run.startedAt,
    updatedAt: new Date().toISOString(),
    finished: run.finished === true,
    ops: run.ops.length,
    conflicts: run.conflicts.length
  }
  const runs = (receipts.runs ?? []).filter((r) => r.id !== run.id)
  receipts.runs = [...runs.slice(-19), record]
  mkdirSync(path.dirname(RECEIPTS_FILE), { recursive: true })
  writeFileSync(RECEIPTS_FILE, JSON.stringify(receipts, null, '\t') + '\n')
}
function op(kind, key, detail = {}) {
  run.ops.push({ kind, key, ...detail })
  console.log(`${DRY ? 'plan' : 'did '} ${kind.padEnd(9)} ${key}${detail.note ? `  (${detail.note})` : ''}`)
}
function conflict(key, reason, extra = {}) {
  run.conflicts.push({ key, reason, ...extra })
  op('conflict', key, { note: reason })
}

// ───────────────────────── API ─────────────────────────
const H = { authorization: `Bearer ${token}`, 'X-EmDash-Request': '1', accept: 'application/json' }
async function api(method, route, body, extraHeaders = {}) {
  const isBytes = body instanceof Uint8Array
  const res = await fetch(`${SITE}${route}`, {
    method,
    headers: {
      ...H,
      ...(body !== undefined && !isBytes ? { 'content-type': 'application/json' } : {}),
      ...extraHeaders
    },
    body: body === undefined ? undefined : isBytes ? body : JSON.stringify(body)
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  if (!res.ok || (json && json.success === false)) {
    const err = new Error(
      `${method} ${route} -> ${res.status} ${json?.error?.code ?? ''} ${json?.error?.message ?? text.slice(0, 160)}`
    )
    err.status = res.status
    err.code = json?.error?.code
    throw err
  }
  return json?.data ?? json
}
const keyOf = (collection, slug, locale) => `${collection}/${slug}/${locale}`
/** One entry as the site holds it: draft-overlaid `data`, public `live`, revision token, draft flag. */
async function getEntry(collection, slug, locale) {
  try {
    const d = await api(
      'GET',
      `/_emdash/api/content/${collection}/${encodeURIComponent(slug)}?locale=${locale}`
    )
    const item = d.item ?? d
    // Selections stay out of `live`: writes build their `data` from it, and a bound key there is refused.
    const refs = {}
    for (const [k, ref] of Object.entries(item.references ?? {}))
      refs[k] = (ref?.children ?? []).map((x) => `${x.collection}:${x.slug}`)
    return {
      item,
      rev: d._rev,
      live: item.liveData ?? item.data ?? {},
      refs,
      hasDraft: !!item.draftRevisionId,
      status: item.status
    }
  } catch (e) {
    if (e.status === 404) return null
    throw e
  }
}
async function publish(collection, id, locale) {
  const pub = await api('POST', `/_emdash/api/content/${collection}/${id}/publish?locale=${locale}`, {})
  return pub._rev
}

// ───────────────────────── seed content, resolved ─────────────────────────
function seedEntries() {
  const order = config.contentOrder ?? []
  const colls = [
    ...order.filter((c) => seed.content?.[c]),
    ...Object.keys(seed.content ?? {}).filter((c) => !order.includes(c))
  ]
  const out = []
  for (const c of colls)
    for (const e of seed.content[c])
      out.push({ collection: c, ...e, key: keyOf(c, e.slug, e.locale ?? seed.defaultLocale ?? 'en') })
  return out
}
async function resolveRefs(value) {
  if (typeof value === 'string' && value.startsWith('$ref:')) {
    const [collection, slug, locale] = value.slice(5).split(':')
    const k = keyOf(collection, slug, locale)
    if (receipts.entries[k]?.id) return receipts.entries[k].id
    const live = await getEntry(collection, slug, locale)
    if (live) return live.item.id
    throw new Error(`unresolved reference ${value}`)
  }
  if (Array.isArray(value)) return Promise.all(value.map(resolveRefs))
  if (value && typeof value === 'object') {
    const o = {}
    for (const [k, v] of Object.entries(value)) o[k] = await resolveRefs(v)
    return o
  }
  return value
}
const getPath = (obj, p) =>
  p
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .reduce((o, s) => (o == null ? undefined : o[s]), obj)
function setPath(obj, p, value) {
  const parts = p.replace(/\[(\d+)\]/g, '.$1').split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const s = parts[i]
    if (cur[s] == null) cur[s] = /^\d+$/.test(parts[i + 1]) ? [] : {}
    cur = cur[s]
  }
  const last = parts[parts.length - 1]
  if (JSON.stringify(cur[last]) === JSON.stringify(value)) return false
  cur[last] = value
  return true
}
/** Paths the importer owns on this entry (from the media map) plus image/file fields of the collection. */
function importerPaths(collection, slug, locale) {
  const paths = new Set()
  for (const m of mediaMap.items ?? [])
    for (const t of m.targets ?? [])
      if (t.collection === collection && t.slug === slug && t.locale === locale) paths.add(t.path)
  for (const f of seed.collections?.find((c) => c.slug === collection)?.fields ?? [])
    if (f.type === 'image' || f.type === 'file') paths.add(f.slug)
  return [...paths]
}
/** Seed data with the importer-owned values the seed leaves empty taken from the live entry. */
function withLiveMedia(seedData, live, collection, slug, locale) {
  const out = JSON.parse(JSON.stringify(seedData))
  for (const p of importerPaths(collection, slug, locale)) {
    const mine = getPath(out, p)
    const theirs = getPath(live, p)
    if ((mine == null || mine === '') && theirs != null && theirs !== '') setPath(out, p, theirs)
  }
  // Repeater/portable-text rows the seed wrote without their image sub-values.
  for (const f of seed.collections?.find((c) => c.slug === collection)?.fields ?? []) {
    if (f.type === 'repeater' && Array.isArray(out[f.slug]) && Array.isArray(live?.[f.slug])) {
      const imgSubs = (f.validation?.subFields ?? []).filter((s) => s.type === 'image').map((s) => s.slug)
      out[f.slug] = out[f.slug].map((row, i) => {
        const l = live[f.slug][i]
        if (!l) return row
        const r = { ...row }
        for (const s of imgSubs) if (r[s] == null && l[s]) r[s] = l[s]
        return r
      })
    }
    if (f.type === 'portableText' && Array.isArray(out[f.slug]) && Array.isArray(live?.[f.slug])) {
      // An image block's asset and what the upload derived (size, blurhash…) is importer-owned: the
      // seed's own keys (text, alt, caption) win, the live block fills the rest.
      out[f.slug] = out[f.slug].map((b, i) => {
        const l = live[f.slug][i]
        return b?._type === 'image' && l?._type === 'image' && l.asset ? { ...l, ...b } : b
      })
    }
  }
  return out
}
// SQLite hands booleans back as 0/1 and optional fields as null; compare values by meaning.
const canon = (v) =>
  JSON.stringify(v, (_, x) => (x === true ? 1 : x === false ? 0 : x === undefined ? null : x)) ?? 'null'
/** Keys where the live entry differs from the seed (ignoring importer-owned paths); empty = match. */
function seedDiff(seedData, live, collection, slug, locale) {
  const merged = withLiveMedia(seedData, live, collection, slug, locale)
  return Object.entries(merged)
    .filter(([k, v]) => canon(v ?? null) !== canon(live?.[k] ?? null))
    .map(([k]) => k)
}
/** Does the live entry already carry exactly the seed's content (ignoring importer-owned paths)? */
const liveMatchesSeed = (...a) => seedDiff(...a).length === 0

// ───────────────────────── schema ─────────────────────────
const FIELD_KEYS = [
  'label',
  'type',
  'required',
  'unique',
  'validation',
  'widget',
  'options',
  'searchable',
  'indexed'
]
const norm = (v) => JSON.stringify(v ?? null)
async function schema() {
  for (const c of seed.collections ?? []) {
    let live
    try {
      live = await api('GET', `/_emdash/api/schema/collections/${c.slug}/fields`)
    } catch (e) {
      if (e.status === 404) {
        op('missing', `collection:${c.slug}`, {
          note: 'create it with `emdash seed --no-content --on-conflict skip`'
        })
        continue
      }
      throw e
    }
    const liveFields = new Map((live.items ?? []).map((f) => [f.slug, f]))
    try {
      const coll = (await api('GET', `/_emdash/api/schema/collections/${c.slug}`)).item
      const wantC = {
        label: c.label,
        labelSingular: c.labelSingular,
        urlPattern: c.urlPattern ?? null,
        routable: c.routable !== false,
        hidden: !!c.hidden,
        sortOrder: c.sortOrder ?? null
      }
      const diffC = Object.keys(wantC).filter(
        (k) => norm(wantC[k]) !== norm(coll?.[k]) && !(k === 'labelSingular' && wantC[k] === undefined)
      )
      if (diffC.length) {
        if (!DRY)
          await api(
            'PUT',
            `/_emdash/api/schema/collections/${c.slug}`,
            Object.fromEntries(diffC.map((k) => [k, wantC[k]]))
          )
        op('coll~', c.slug, { note: diffC.join(',') })
      }
    } catch (e) {
      op('skip', `collection:${c.slug}`, { note: e.message.slice(0, 120) })
    }
    for (const [i, f] of c.fields.entries()) {
      const want = {
        label: f.label,
        type: f.type,
        required: !!f.required,
        unique: !!f.unique,
        validation: f.validation ?? null,
        widget: f.widget,
        options: f.options,
        searchable: !!f.searchable,
        indexed: !!f.indexed
      }
      let have = liveFields.get(f.slug)
      if (have && f.type === 'reference' && have.validation?.relation && !f.validation?.relation) {
        // Binding a reference field stores its relation's slug and side, server-assigned; a field
        // an update bound keeps its old `options.collection` too. Neither is drift from the seed.
        const validation = { ...have.validation }
        delete validation.relation
        delete validation.relationSide
        have = { ...have, validation, options: f.options === undefined ? undefined : have.options }
      }
      if (!have) {
        if (!DRY)
          await api('POST', `/_emdash/api/schema/collections/${c.slug}/fields`, {
            slug: f.slug,
            ...want,
            defaultValue: f.defaultValue,
            sortOrder: i
          })
        op('field+', `${c.slug}.${f.slug}`)
        continue
      }
      const diff = FIELD_KEYS.filter(
        (k) =>
          norm(want[k]) !== norm(have[k]) &&
          !(k === 'validation' && want[k] === null && have[k] === undefined) &&
          !(k === 'widget' && want[k] === undefined) &&
          !(k === 'options' && want[k] === undefined && have[k] == null)
      )
      if (!diff.length) continue
      if (!DRY)
        await api(
          'PUT',
          `/_emdash/api/schema/collections/${c.slug}/fields/${f.slug}`,
          Object.fromEntries(diff.map((k) => [k, want[k]]))
        )
      op('field~', `${c.slug}.${f.slug}`, { note: diff.join(',') })
    }
    for (const slug of liveFields.keys())
      if (!c.fields.some((f) => f.slug === slug))
        op('orphan', `${c.slug}.${slug}`, { note: 'field on the site but not in the seed; left alone' })
  }
}

// ───────────────────────── adopt / content ─────────────────────────
/** Claim untracked entries whose live content equals the seed; never writes to the site. */
async function adopt() {
  let untracked = 0
  for (const e of seedEntries()) {
    if (ONLY.length && !ONLY.includes(e.collection)) continue
    const locale = e.locale ?? 'en'
    const live = await getEntry(e.collection, e.slug, locale)
    if (!live) {
      op('missing', e.key)
      continue
    }
    const rec = receipts.entries[e.key]
    // Tracked and in step: nothing to adopt. Tracked but the site moved on (an editor saved, or a draft
    // was discarded, bumping `_rev`): re-claim it only if the public data still equals the seed.
    if (rec?.seedHash && rec.rev === live.rev) continue
    const data = await resolveRefs(e.data)
    if (live.hasDraft) {
      untracked++
      op('untracked', e.key, { note: 'pending draft; not adopted' })
      continue
    }
    const diff = seedDiff(comparable(e, data), { ...live.live, ...live.refs }, e.collection, e.slug, locale)
    if (diff.length) {
      untracked++
      op('untracked', e.key, {
        note: `live content differs from the seed in ${diff.slice(0, 4).join(', ')}; not adopted`
      })
      continue
    }
    if (DRY) {
      op('adopt', e.key)
      continue
    }
    receipts.entries[e.key] = {
      id: live.item.id,
      rev: live.rev,
      seedHash: stableHash({ data, taxonomies: e.taxonomies ?? {}, status: e.status ?? 'published' }),
      adoptedAt: new Date().toISOString()
    }
    op('adopt', e.key, rec ? { note: 'receipt was behind the site; live still equals the seed' } : {})
    saveReceipts()
  }
  return untracked
}
async function content() {
  let conflicts = 0
  for (const e of seedEntries()) {
    if (ONLY.length && !ONLY.includes(e.collection)) continue
    const k = e.key
    const locale = e.locale ?? 'en'
    const data = await resolveRefs(e.data)
    const wantPublished = (e.status ?? 'published') === 'published'
    const seedHash = stableHash({ data, taxonomies: e.taxonomies ?? {}, status: e.status ?? 'published' })
    const live = await getEntry(e.collection, e.slug, locale)
    const rec = receipts.entries[k]
    if (!live) {
      if (DRY) {
        op('create', k)
        continue
      }
      const split = splitRefs(e.collection, data)
      const body = {
        data: split.data,
        references: split.references,
        slug: e.slug,
        locale,
        status: 'draft',
        taxonomies: e.taxonomies ?? undefined
      }
      if (e.translationOf) {
        const [c, s, l] = e.translationOf.split(':')
        const src = receipts.entries[keyOf(c, s, l)]?.id ?? (await getEntry(c, s, l))?.item?.id
        if (src) body.translationOf = src
      }
      const created = await api('POST', `/_emdash/api/content/${e.collection}`, body)
      const item = created.item ?? created
      let rev = created._rev
      if (wantPublished) rev = (await publish(e.collection, item.id, locale)) ?? rev
      receipts.entries[k] = { id: item.id, rev, seedHash, writtenAt: new Date().toISOString() }
      op('create', k, { id: item.id })
      saveReceipts()
      continue
    }
    if (!rec?.seedHash) {
      // Untracked: claim it only when the site already holds this seed's content, else leave it.
      if (
        !live.hasDraft &&
        liveMatchesSeed(comparable(e, data), { ...live.live, ...live.refs }, e.collection, e.slug, locale)
      ) {
        if (!DRY) {
          receipts.entries[k] = {
            id: live.item.id,
            rev: live.rev,
            seedHash,
            adoptedAt: new Date().toISOString()
          }
          saveReceipts()
        }
        op('adopt', k)
        continue
      }
      if (!FORCE) {
        conflicts++
        conflict(
          k,
          live.hasDraft
            ? 'untracked entry with a pending draft'
            : `untracked entry whose live content differs from the seed in ${seedDiff(
                comparable(e, data),
                { ...live.live, ...live.refs },
                e.collection,
                e.slug,
                locale
              )
                .slice(0, 4)
                .join(', ')} (run \`adopt\` after review, or --force)`
        )
        continue
      }
    }
    const editorChanged = !!rec?.rev && live.rev !== rec.rev
    const seedChanged = rec?.seedHash !== seedHash
    if (rec?.seedHash && !seedChanged && !editorChanged && !live.hasDraft) {
      op('same', k)
      continue
    }
    if (!seedChanged && (editorChanged || live.hasDraft) && !FORCE_ALL) {
      op('editor', k, {
        note: live.hasDraft
          ? 'pending draft; seed unchanged; keeping theirs'
          : 'editor changed it; seed unchanged; keeping theirs'
      })
      continue
    }
    if ((editorChanged || live.hasDraft) && !FORCE) {
      conflicts++
      conflict(
        k,
        live.hasDraft
          ? 'seed changed and the entry has a pending draft'
          : 'both the seed and an editor changed this entry',
        { liveRev: live.rev, receiptRev: rec?.rev }
      )
      continue
    }
    if (DRY) {
      op('update', k)
      continue
    }
    const split = splitRefs(e.collection, data)
    const merged = withLiveMedia(split.data, live.live, e.collection, e.slug, locale)
    const upd = await api('PUT', `/_emdash/api/content/${e.collection}/${live.item.id}?locale=${locale}`, {
      data: merged,
      references: split.references,
      taxonomies: e.taxonomies ?? undefined,
      _rev: live.rev
    })
    let rev = upd._rev
    if (wantPublished) rev = (await publish(e.collection, live.item.id, locale)) ?? rev
    receipts.entries[k] = {
      id: live.item.id,
      rev,
      seedHash,
      writtenAt: new Date().toISOString(),
      ...(FORCE && (editorChanged || live.hasDraft) ? { forcedOver: live.hasDraft ? 'draft' : 'editor' } : {})
    }
    op('update', k, FORCE && (editorChanged || live.hasDraft) ? { note: 'forced' } : {})
    saveReceipts()
  }
  return conflicts
}

// ───────────────────────── media ─────────────────────────
function pngSize(buf) {
  return buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50
    ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    : {}
}
// EmDash's content hash is `sha1:<hex>` of the bytes (packages/core/src/media/hash: computeContentHash).
const contentHashOf = (bytes) => `sha1:${createHash('sha1').update(bytes).digest('hex')}`
async function mediaItem(id) {
  try {
    const d = await api('GET', `/_emdash/api/media/${id}`)
    return d.item ?? d
  } catch (e) {
    if (e.status === 404) return null
    throw e
  }
}
// `GET /media/:id` returns no `url` on 0.37 (only `storageKey`); the local provider serves the file
// at /_emdash/api/media/file/<storageKey>. Values written into JSON fields are not resolved by the
// server at render, so the receipt must carry a real URL or a reused picture renders as nothing.
const mediaUrlOf = (item) =>
  item.url ?? (item.storageKey ? `/_emdash/api/media/file/${item.storageKey}` : null)
const receiptFor = (item, hash, m, extra = {}) => ({
  mediaId: item.id,
  contentHash: hash,
  sha256: null,
  url: mediaUrlOf(item),
  storageKey: item.storageKey ?? null,
  width: item.width ?? null,
  height: item.height ?? null,
  filename: item.filename ?? path.basename(m.file),
  mimeType: item.mimeType ?? m.mime,
  at: new Date().toISOString(),
  ...extra
})
async function uploadOne(m) {
  const file = path.join(SEED_DIR, m.copied ?? `media/${m.file}`)
  const bytes = readFileSync(file)
  const hash = contentHashOf(bytes)
  const sha = sha256(bytes)
  const rec = receipts.media[m.key]
  if (rec?.mediaId) {
    const item = await mediaItem(rec.mediaId)
    // Trust a receipt only while the library item still exists AND its content hash is our bytes'.
    if (item && item.status === 'ready' && item.contentHash === hash) {
      if (rec.contentHash !== hash || rec.sha256 !== sha || !rec.url) {
        receipts.media[m.key] = receiptFor(item, hash, m, { sha256: sha })
        saveReceipts()
      }
      op('same', `media:${m.key}`)
      return receipts.media[m.key]
    }
    op('stale', `media:${m.key}`, {
      note: item
        ? `library item ${item.id} has hash ${item.contentHash ?? 'none'}, ours ${hash}`
        : 'library item gone'
    })
  }
  if (DRY) {
    op('upload', `media:${m.key}`)
    return null
  }
  const filename = path.basename(m.file)
  // Ask the server with our content hash: it answers `existing` only for a byte-identical item.
  const ask = await api('POST', '/_emdash/api/media/upload-url', {
    filename,
    contentType: m.mime,
    size: bytes.length,
    contentHash: hash,
    deduplicate: true,
    ensureUniqueFilename: true
  })
  let item
  if (ask.existing) {
    item = await mediaItem(ask.mediaId)
    if (!item || item.contentHash !== hash)
      throw new Error(
        `server offered ${ask.mediaId} for ${m.key} but its hash ${item?.contentHash} != ${hash}`
      )
    receipts.media[m.key] = receiptFor(item, hash, m, { sha256: sha, reused: true })
    op('reuse', `media:${m.key}`, { id: item.id, note: 'byte-identical item already in the library' })
    saveReceipts()
    return receipts.media[m.key]
  }
  const headers = new Headers(ask.headers ?? {})
  for (const [k, v] of Object.entries(H)) if (!headers.has(k)) headers.set(k, v)
  headers.set('content-type', m.mime)
  const put = await fetch(ask.uploadUrl.startsWith('http') ? ask.uploadUrl : `${SITE}${ask.uploadUrl}`, {
    method: ask.method ?? 'PUT',
    headers,
    body: bytes
  })
  if (!put.ok) throw new Error(`upload ${m.key} -> ${put.status} ${(await put.text()).slice(0, 160)}`)
  const conf = await api('POST', `/_emdash/api/media/${ask.mediaId}/confirm`, {
    size: bytes.length,
    ...pngSize(bytes)
  })
  item = conf.item ?? conf
  if (item.contentHash && item.contentHash !== hash)
    throw new Error(`uploaded ${m.key} but server hash ${item.contentHash} != ${hash}`)
  if (m.alt) await api('PUT', `/_emdash/api/media/${ask.mediaId}`, { alt: m.alt })
  receipts.media[m.key] = receiptFor(item, hash, m, { sha256: sha })
  op('upload', `media:${m.key}`, { id: item.id })
  saveReceipts()
  return receipts.media[m.key]
}
/** PUT a patched copy of the PUBLIC data and publish -- only when nobody else is mid-edit. */
async function guardedPatch(collection, slug, locale, mutate, what) {
  const k = keyOf(collection, slug, locale)
  const live = await getEntry(collection, slug, locale)
  if (!live) {
    op('skip', k, { note: `${what}: entry not on site yet; run \`content\` first` })
    return 'missing'
  }
  const rec = receipts.entries[k]
  // Decide on the PUBLIC data first: when nothing needs to change there is nothing to guard.
  const data = JSON.parse(JSON.stringify(live.live))
  const changed = mutate(data, live)
  if (!changed) {
    op('same', k, { note: `${what} already set` })
    return 'same'
  }
  if (live.hasDraft && !FORCE) {
    conflict(k, `${what}: entry has a pending draft; not touching it`)
    return 'conflict'
  }
  if (rec?.rev && live.rev !== rec.rev && !FORCE) {
    conflict(k, `${what}: editor changed this entry since our last write; not touching it`)
    return 'conflict'
  }
  if (DRY) {
    op('patch', k, { note: `${what}: ${changed}` })
    return 'planned'
  }
  const upd = await api('PUT', `/_emdash/api/content/${collection}/${live.item.id}?locale=${locale}`, {
    data,
    _rev: live.rev
  })
  let rev = upd._rev
  if (live.status === 'published') rev = (await publish(collection, live.item.id, locale)) ?? rev
  if (rec) receipts.entries[k] = { ...rec, rev: rev ?? rec.rev }
  op('patch', k, { note: `${what}: ${changed}` })
  saveReceipts()
  return 'patched'
}
async function media() {
  let conflicts = 0
  const byEntry = new Map()
  for (const m of mediaMap.items ?? []) {
    const rec = await uploadOne(m)
    if (!rec) continue
    for (const t of m.targets ?? []) {
      const k = keyOf(t.collection, t.slug, t.locale)
      if (!byEntry.has(k)) byEntry.set(k, [])
      byEntry.get(k).push({ path: t.path, media: rec, alt: m.alt })
    }
  }
  const ours = (id) => Object.values(receipts.media).some((r) => r.mediaId === id)
  const ourUrl = (u) => Object.values(receipts.media).some((r) => r.url === u)
  for (const [k, patches] of byEntry) {
    const [collection, slug, locale] = k.split('/')
    const r = await guardedPatch(
      collection,
      slug,
      locale,
      (data) => {
        let n = 0
        for (const p of patches) {
          const current = getPath(data, p.path)
          if (p.path.endsWith('.asset')) {
            if (current?.id === p.media.mediaId) continue
            if (current?.id && !ours(current.id)) continue // an editor placed another image
            const block = getPath(data, p.path.replace(/\.asset$/, ''))
            n += setPath(data, p.path, { id: p.media.mediaId, url: p.media.url }) ? 1 : 0
            if (block && p.media.width) {
              block.width = p.media.width
              block.height = p.media.height
            }
          } else if (/(_url|href)$/.test(p.path)) {
            if (current === p.media.url) continue
            if (current && !ourUrl(current)) continue // editor set their own link
            n += setPath(data, p.path, p.media.url) ? 1 : 0
          } else {
            if (current?.id === p.media.mediaId && (current.src || current.meta?.storageKey)) continue // same picture, already locatable
            if (current?.id && !ours(current.id)) continue
            n += setPath(data, p.path, {
              id: p.media.mediaId,
              src: p.media.url,
              alt: p.alt ?? '',
              width: p.media.width ?? undefined,
              height: p.media.height ?? undefined,
              filename: p.media.filename,
              mimeType: p.media.mimeType,
              // like a server-resolved value, so mediaUrl() finds the file for values inside JSON fields
              ...(p.media.storageKey ? { provider: 'local', meta: { storageKey: p.media.storageKey } } : {})
            })
              ? 1
              : 0
          }
        }
        return n ? `${n} media field(s)` : 0
      },
      'media'
    )
    if (r === 'conflict') conflicts++
  }
  return conflicts
}

// ───────────────────────── forms (Forms plugin) ─────────────────────────
async function forms() {
  let conflicts = 0
  if (!existsSync(FORMS_FILE)) {
    console.log(`no ${FORMS_FILE}; nothing to do`)
    return 0
  }
  const defs = JSON.parse(readFileSync(FORMS_FILE, 'utf8'))
  const list = await api('POST', '/_emdash/api/plugins/emdash-forms/forms/list', {})
  const existing = new Map((list.forms ?? list.items ?? list ?? []).map((f) => [f.slug, f]))
  for (const def of defs.forms ?? []) {
    const found = existing.get(def.slug)
    const defHash = stableHash({ pages: def.pages, settings: def.settings, name: def.name })
    if (found) {
      const rec = receipts.forms[def.slug] ?? {}
      if (rec.defHash === defHash) {
        receipts.forms[def.slug] = { ...rec, id: found.id }
        op('same', `form:${def.slug}`)
        continue
      }
      if (DRY) {
        op('update', `form:${def.slug}`)
        continue
      }
      await api('POST', '/_emdash/api/plugins/emdash-forms/forms/update', {
        id: found.id,
        name: def.name,
        pages: def.pages,
        settings: def.settings
      })
      receipts.forms[def.slug] = { id: found.id, defHash, updatedAt: new Date().toISOString() }
      op('update', `form:${def.slug}`)
      saveReceipts()
      continue
    }
    if (DRY) {
      op('create', `form:${def.slug}`)
      continue
    }
    const created = await api('POST', '/_emdash/api/plugins/emdash-forms/forms/create', def)
    const form = created.form ?? created
    receipts.forms[def.slug] = { id: form.id, defHash, createdAt: new Date().toISOString() }
    op('create', `form:${def.slug}`, { id: form.id })
    saveReceipts()
  }
  // Bind form ids where the template reads them (template.config.json → forms.bindings).
  for (const b of config.forms?.bindings ?? []) {
    for (const locale of LOCALES) {
      const formSlug = b.form.replace('{locale}', locale)
      const id = receipts.forms[formSlug]?.id ?? existing.get(formSlug)?.id
      if (!id) {
        op('skip', `${b.collection}/${b.slug}/${locale}`, { note: `form ${formSlug} not found` })
        continue
      }
      const r = await guardedPatch(
        b.collection,
        b.slug,
        locale,
        (data) => (data[b.field] === id ? 0 : ((data[b.field] = id), b.field)),
        'form binding'
      )
      if (r === 'conflict') conflicts++
    }
  }
  return conflicts
}

// ───────────────────────── status ─────────────────────────
async function status() {
  let missing = 0,
    same = 0,
    changed = 0,
    conflicts = 0,
    editor = 0,
    untracked = 0,
    drafts = 0
  for (const e of seedEntries()) {
    const live = await getEntry(e.collection, e.slug, e.locale ?? 'en')
    const rec = receipts.entries[e.key]
    if (!live) {
      missing++
      continue
    }
    if (live.hasDraft) drafts++
    if (!rec?.seedHash) {
      untracked++
      continue
    }
    const seedHash = stableHash({
      data: await resolveRefs(e.data),
      taxonomies: e.taxonomies ?? {},
      status: e.status ?? 'published'
    })
    const editorChanged = live.rev !== rec.rev
    if (seedHash === rec.seedHash && !editorChanged) same++
    else if (seedHash !== rec.seedHash && editorChanged) conflicts++
    else if (editorChanged) editor++
    else changed++
  }
  const mediaDone = (mediaMap.items ?? []).filter((m) => receipts.media[m.key]?.mediaId).length
  console.log(
    JSON.stringify(
      {
        site: SITE,
        template: config.id ?? null,
        entries: {
          total: seedEntries().length,
          missing,
          same,
          changed,
          editor,
          conflicts,
          untracked,
          drafts
        },
        media: { total: (mediaMap.items ?? []).length, uploaded: mediaDone },
        forms: Object.keys(receipts.forms ?? {}).length,
        lastRuns: (receipts.runs ?? []).slice(-3)
      },
      null,
      2
    )
  )
}

try {
  let blocked = 0
  if (command === 'status') await status()
  if (command === 'schema' || command === 'all') await schema()
  if (command === 'adopt') blocked += await adopt()
  if (command === 'content' || command === 'all') blocked += await content()
  if (command === 'media' || command === 'all') blocked += await media()
  if (command === 'forms' || command === 'all') blocked += await forms()
  run.finished = true
  if (command !== 'status') {
    saveReceipts()
    console.log(
      JSON.stringify({
        run: run.id,
        ops: run.ops.length,
        conflicts: run.conflicts.length,
        blocked,
        dryRun: DRY,
        force: FORCE
      })
    )
  }
  process.exit(blocked ? 3 : 0)
} catch (e) {
  console.error(`seed-apply failed: ${e.message}`)
  saveReceipts()
  process.exit(1)
}
