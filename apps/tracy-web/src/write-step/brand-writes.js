// The brand stage's calls to the site (ADR 0044, decision 4): the name, the pictures, the template's site profile, the
// head block and the accent module, one action at a time and through the site door only. A plugin refusal fails the items
// that needed that call, in the plugin's words, and the others still go; a door that throws ends the stage. An order the site
// holds already is not sent. The head block is one value, so when one thing in it differs the whole block goes again.
import { createHash } from 'node:crypto'
import { headBlock, menuCssFor, withBlock } from './brand-head-block.js'
import { BUSY_WAITS_MS } from './contract-write.js'

const FOLDER = 'images/tracy-brand'

export const said = (answer) =>
  [answer?.error ?? answer?.code, answer?.message].filter(Boolean).join(': ') || 'the site gave no answer'
const roleOf = (order) => order.slot.replace(/^.*[:.]/, '').replace(/[^\w-]/g, '-')
const extOf = (file) => file.slice(file.lastIndexOf('.') + 1).toLowerCase()

/** Where a picture lands: a new name per content, since the site's static files are cached. */
export const picturePath = (order, bytes) =>
  `${FOLDER}/${order.spot ?? roleOf(order)}-${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${extOf(order.file)}`

/**
 * @param {{ orders: object[], plan: object, pictures: Map<string, Buffer>, accent: object | null, ask: Function,
 *   results: Map<object, object>, kept?: Map<object, object> }} input `ask(action, params)` answers as the plugin does;
 *   `results` takes each order's outcome as it is known, so a stage that ends early still reports what it did; `kept`: the
 *   orders the site holds already, each with its line in the last report
 * @returns {Promise<void>}
 */
export async function writeBrand({ orders, plan, pictures, accent, ask, results, kept = new Map() }) {
  const done = (order, ordered, readFrom, reason = null) =>
    results.set(order, { status: 'written', reason, ordered, readFrom })
  const fail = (list, answer) => {
    const reason = typeof answer === 'string' ? answer : said(answer)
    for (const order of list) results.set(order, { status: 'failed', reason })
  }
  const by = (via) => orders.filter((o) => o.via === via)
  const refused = (answer) => !answer || answer.ok === false
  const ready = (list) => list.filter((o) => !results.has(o))
  const fresh = (o) => !kept.has(o)
  for (const [order, line] of kept)
    if (order.via !== 'contract') done(order, line.ordered, line.readFrom, line.reason ?? null)

  const identity = ready(by('identity'))
  if (identity.length) {
    const fields = Object.fromEntries(identity.map((o) => [o.key, o.value]))
    const answer = await ask('site.identity', { operation: 'set', fields })
    if (refused(answer)) fail(identity, answer)
    else
      for (const order of identity)
        done(order, order.value, {
          action: 'site.identity',
          params: { operation: 'read' },
          path: ['fields', order.key]
        })
  }

  // A picture is uploaded once, whatever number of orders use it.
  const uploaded = new Map()
  for (const order of orders.filter((o) => o.file && o.via !== 'module')) {
    const path = picturePath(order, pictures.get(order.file))
    if (kept.has(order)) {
      order.path = path
      continue
    }
    if (!uploaded.has(path)) {
      const content_b64 = pictures.get(order.file).toString('base64')
      uploaded.set(path, await ask('media.upload', { path, content_b64 }))
    }
    if (refused(uploaded.get(path))) fail([order], uploaded.get(path))
    else order.path = path
  }
  const settings = ready(by('profile'))
  const small = by('small-logo').filter((o) => kept.has(o) || !results.has(o))
  const heads = by('head').filter((o) => o.path)
  const links = heads.filter(fresh)
  const ico = by('profile').find((o) => o.link === 'ico' && o.path)
  const icoMoved = Boolean(ico) && fresh(ico)
  // The block is written whole, so a small logo it already holds as CSS must be known even when that logo did not change.
  const readProfiles =
    settings.length > 0 || small.some(fresh) || (small.length > 0 && (links.length > 0 || icoMoved))
  const profiled = readProfiles
    ? await writeProfiles({ settings, small, kept, plan, ask, done, fail })
    : { inCss: [], unread: false }
  const { inCss } = profiled
  const css = inCss.length ? menuCssFor(Object.fromEntries(inCss.map((o) => [o.side, o.path]))) : null
  const blockMoved = links.length > 0 || icoMoved || inCss.some(fresh)
  if (profiled.unread && small.some((o) => kept.has(o))) {
    fail(links, 'the template profile could not be read, so the head block cannot be written whole')
  } else if ((heads.length > 0 || css) && blockMoved) {
    const paths = Object.fromEntries(heads.map((o) => [o.link, o.path]))
    if (ico) paths.ico = ico.path
    const failure = await writeHeadBlock({ plan, block: headBlock(paths, css), ask })
    // The contract call saves this block's module again in its own form, so a line reads back as "the path is in it".
    const inBlock = {
      action: 'content.get',
      params: { operation: 'read', kind: 'module', id: plan.headModule },
      path: ['item', 'content'],
      type: 'contains'
    }
    if (failure) fail([...links, ...inCss.filter(fresh)], failure)
    else {
      for (const order of links) done(order, order.path, inBlock)
      for (const order of inCss.filter(fresh))
        done(order, order.path, inBlock, 'through CSS: the profile has no small-logo setting')
    }
  }

  const [module] = by('module')
  if (module && !results.has(module)) {
    const html = pictures.get(module.file).toString('utf8')
    const { failure, id } = await writeAccent({ html, place: accent, ask })
    if (failure) fail([module], failure)
    else
      done(module, html, {
        action: 'content.get',
        params: { operation: 'read', kind: 'module', id },
        path: ['item', 'content']
      })
  }
}

/**
 * One `set` with each profile's own values, of what differs only; none differs, no `set`.
 * @returns {Promise<{ inCss: object[], unread: boolean }>} `inCss`: the small-logo orders no profile has a setting for;
 *   `unread`: the profile could not be read or written
 */
async function writeProfiles({ settings, small, kept, plan, ask, done, fail }) {
  if (!settings.length && !small.length) return { inCss: [], unread: false }
  const fresh = small.filter((o) => !kept.has(o))
  const all = [...settings, ...fresh]
  const read = await ask('template.siteSettings', { template: plan.templateFolder })
  if (!read || read.ok === false) {
    fail(all, read)
    return { inCss: [], unread: true }
  }
  const profiles = Object.entries(read.profiles ?? {})
  if (!profiles.length) {
    fail(all, 'the template has no site profile to write')
    return { inCss: [], unread: true }
  }
  const inProfile = new Set()
  const byProfile = {}
  for (const [name, entry] of profiles) {
    const have = entry?.settings ?? {}
    const values = Object.fromEntries(settings.map((o) => [o.key, o.path ?? o.value]))
    // T4 honours a small-logo key once it is set, so one the profile has is reason enough to set both sides.
    if (small.some((order) => order.key in have))
      for (const order of small) {
        if (!kept.has(order)) values[order.key] = order.path
        inProfile.add(order)
      }
    byProfile[name] = values
  }
  const sent = [...settings, ...fresh.filter((o) => inProfile.has(o))]
  const inCss = small.filter((o) => !inProfile.has(o))
  if (!sent.length) return { inCss, unread: false }
  const answer = await ask('template.siteSettings', {
    operation: 'set',
    template: plan.templateFolder,
    profiles: byProfile
  })
  if (!answer || answer.ok === false) {
    fail(all, answer)
    return { inCss: [], unread: true }
  }
  // Every profile got the same values, so one reads back for all; `default` is always among them when it exists.
  const shown = byProfile.default ? 'default' : profiles[0][0]
  for (const order of sent)
    done(order, order.path ?? order.value, {
      action: 'template.siteSettings',
      params: { operation: 'read', template: plan.templateFolder },
      path: ['profiles', shown, 'settings', order.key],
      ...(order.path ? { type: 'image' } : {})
    })
  return { inCss, unread: false }
}

/** @returns {Promise<object | string | null>} what went wrong, or null */
async function writeHeadBlock({ plan, block, ask }) {
  const got = await ask('content.get', { kind: 'module', id: plan.headModule })
  if (!got || got.ok === false) return got ?? 'the site gave no answer'
  const content = withBlock(got.item?.content ?? '', block)
  if (plan.headMaxBytes && Buffer.byteLength(content) > plan.headMaxBytes)
    return `the head block does not fit its limit of ${plan.headMaxBytes} bytes`
  const answer = await ask('content.update', { kind: 'module', id: plan.headModule, fields: { content } })
  return !answer || answer.ok === false ? (answer ?? 'the site gave no answer') : null
}

/** The accent module: the row of that title when the site has one, otherwise a new one, on every page. */
async function writeAccent({ html, place, ask }) {
  const listed = await ask('content.list', { kind: 'module', search: place.title, limit: 100 })
  if (!listed || listed.ok === false) return { failure: listed ?? 'the site gave no answer' }
  const row = (listed.items ?? []).find((r) => r?.title === place.title && r?.module === 'mod_custom')
  const fields = {
    title: place.title,
    module: 'mod_custom',
    content: html,
    position: place.position,
    ordering: Number(place.ordering ?? 0),
    published: 1,
    showtitle: 0,
    access: 1,
    language: '*',
    params: JSON.stringify({
      prepare_content: '0',
      layout: '_:default',
      moduleclass_sfx: '',
      cache: '0',
      style: String(place.style ?? 'System-none')
    })
  }
  const wrote = await ask('content.update', {
    kind: 'module',
    ...(row ? { id: Number(row.id) } : {}),
    fields
  })
  if (!wrote || wrote.ok === false) return { failure: wrote ?? 'the site gave no answer' }
  const id = Number(row?.id ?? wrote.id)
  if (!id) return { failure: 'the site did not say which module it made' }
  const assigned = await ask('content.update', {
    kind: 'moduleAssignment',
    id,
    fields: { menuids: '[0]' }
  })
  return !assigned || assigned.ok === false ? { failure: assigned ?? 'the site gave no answer' } : { id }
}

/** A door that waits and asks again while another writer holds the site, and carries the apply id. */
export function brandAsker({ apply, siteKey, applyId, sleep }) {
  const READS = new Set(['content.get', 'content.list'])
  return async (action, params) => {
    const write = !READS.has(action) && !(action === 'template.siteSettings' && params.operation !== 'set')
    const call = { siteKey, action, params: write ? { apply_id: applyId, ...params } : params }
    for (const wait of [...BUSY_WAITS_MS, null]) {
      const answer = await apply(call)
      if (answer?.error !== 'writer_busy' || wait === null) return answer
      await sleep(wait)
    }
  }
}
