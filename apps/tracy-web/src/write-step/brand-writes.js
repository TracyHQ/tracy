// The brand stage's calls to the site (ADR 0044, decision 4): the name, the pictures, the template's site profile, the
// head block and the accent module, one action at a time and through the site door only. A plugin refusal fails the items
// that needed that call, in the plugin's words, and the others still go; a door that throws ends the stage.
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
 *   results: Map<object, object> }} input `ask(action, params)` answers as the plugin does; `results` takes each order's
 *   outcome as it is known, so a stage that ends early still reports what it did
 * @returns {Promise<void>}
 */
export async function writeBrand({ orders, plan, pictures, accent, ask, results }) {
  const done = (order, ordered, readFrom, reason = null) =>
    results.set(order, { status: 'written', reason, ordered, readFrom })
  const fail = (list, answer) => {
    const reason = typeof answer === 'string' ? answer : said(answer)
    for (const order of list) results.set(order, { status: 'failed', reason })
  }
  const by = (via) => orders.filter((o) => o.via === via)
  const refused = (answer) => !answer || answer.ok === false

  const identity = by('identity')
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
    if (!uploaded.has(path)) {
      const content_b64 = pictures.get(order.file).toString('base64')
      uploaded.set(path, await ask('media.upload', { path, content_b64 }))
    }
    if (refused(uploaded.get(path))) fail([order], uploaded.get(path))
    else order.path = path
  }
  const ready = (list) => list.filter((o) => !results.has(o))

  const settings = ready(by('profile'))
  const small = ready(by('small-logo'))
  const inCss = await writeProfiles({ settings, small, plan, ask, done, fail })

  const links = ready(by('head'))
  const ico = by('profile').find((o) => o.link === 'ico' && o.path)
  const css = inCss.length ? menuCssFor(Object.fromEntries(inCss.map((o) => [o.side, o.path]))) : null
  if (links.length || css) {
    const paths = Object.fromEntries(links.map((o) => [o.link, o.path]))
    if (ico) paths.ico = ico.path
    const failure = await writeHeadBlock({ plan, block: headBlock(paths, css), ask })
    // The contract call saves this block's module again in its own form, so a line reads back as "the path is in it".
    const inBlock = {
      action: 'content.get',
      params: { operation: 'read', kind: 'module', id: plan.headModule },
      path: ['item', 'content'],
      type: 'contains'
    }
    if (failure) fail([...links, ...inCss], failure)
    else {
      for (const order of links) done(order, order.path, inBlock)
      for (const order of inCss)
        done(order, order.path, inBlock, 'through CSS: the profile has no small-logo setting')
    }
  }

  const [module] = by('module')
  if (module) {
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

/** One `set` with each profile's own values. @returns the small-logo orders no profile has a setting for */
async function writeProfiles({ settings, small, plan, ask, done, fail }) {
  if (!settings.length && !small.length) return []
  const all = [...settings, ...small]
  const read = await ask('template.siteSettings', { template: plan.templateFolder })
  if (!read || read.ok === false) {
    fail(all, read)
    return []
  }
  const profiles = Object.entries(read.profiles ?? {})
  if (!profiles.length) {
    fail(all, 'the template has no site profile to write')
    return []
  }
  const inProfile = new Set()
  const byProfile = {}
  for (const [name, entry] of profiles) {
    const have = entry?.settings ?? {}
    const values = Object.fromEntries(settings.map((o) => [o.key, o.path ?? o.value]))
    // T4 honours a small-logo key once it is set, so one the profile has is reason enough to set both sides.
    if (small.some((order) => order.key in have))
      for (const order of small) {
        values[order.key] = order.path
        inProfile.add(order)
      }
    byProfile[name] = values
  }
  const sent = [...settings, ...small.filter((o) => inProfile.has(o))]
  const answer = await ask('template.siteSettings', {
    operation: 'set',
    template: plan.templateFolder,
    profiles: byProfile
  })
  if (!answer || answer.ok === false) {
    fail(all, answer)
    return []
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
  return small.filter((o) => !inProfile.has(o))
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
