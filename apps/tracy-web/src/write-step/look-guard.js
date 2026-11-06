// The look guard (ADR 0044, decision 10). When customer data goes into a template only the accent colour, the icons, the pictures,
// the words and the logo may change. So everything the write step sends passes here first, and what could change anything else is
// recorded as a finding, naming the step at fault. A finding on a value does not stop the run and does not hold the write back
// (ADR 0044, decision 26): the value is sent, and the site check blocks on the finding (site-check/write-findings.js). Only a call
// on a channel nobody listed (an action, an operation or a parameter) is never sent, so a new channel fails loudly. Nothing here
// names a template; what a template may take is read from its kit, its content map and its own stylesheets. Everything it cannot
// see is listed in the ADR.
import { emptyVideoButtonsOf } from '../lib/empty-video-buttons.js'
import { selfLinkButtonsOf } from '../lib/self-link-buttons.js'
import { ownerStep, stepName } from '../lib/site-build-steps.js'
import { hasMarkup, markupFaults } from './look-guard-markup.js'
import { batchFaults, updateFaults } from './look-guard-rows.js'
import { MARK } from './page-create-lines.js'

const WRITE = 9
const PICTURE = /^\/?(?!.*\.\.)[\w./%~ -]+\.(?:png|jpe?g|webp|gif|avif|ico|svg)(?:#.*)?$/i
const UPLOAD = /^images\/(?!.*\.\.)[\w./%~ -]+\.(?:png|jpe?g|webp|gif|avif|ico|svg)$/i
const ADDRESS_NOT = /["'<>]|\(\(/
const ALWAYS_SHARE_SETTING = 'other_shareImage'

/** Allowed though they touch a page, each for its reason. */
const EXCEPTIONS = Object.freeze({
  'created-page-layout':
    'a created page takes the article layout of the template content pages, and only a value read from the template, so it copies the template',
  'created-page-rows':
    'a created page is new, so its rows change nothing the template had; they carry the mark, and hold no setting that restyles anything',
  hide: 'taking a block, a row, a slot or a form off is the plan hide decision (decision 2): it removes an element and restyles none of those left',
  'phone-logo-css':
    'when a template has no small logo setting the head block shows it by content:url, and height:auto keeps the picture in its own proportion',
  'picture-fallback':
    'a kept picture the template prints only beside a field the plan hid is printed by a block of the template media classes at the top of its article text; nothing else of the text changes',
  'empty-video-buttons':
    'a play button the template prints with an empty video address opens an empty player; one rule in the head block, on the selectors the kit names and keyed on the empty address, stops it being drawn, and a filled video shows its button again',
  'self-link-buttons':
    'a "more" button the template prints from settings no slot reaches can lead to the page it sits on; rules in the head block, on the containers the kit names and scoped to each kept page and its own address, stop it being drawn, and a link to another page is never hidden',
  'body-background':
    'the setting a kit names for the picture behind its pages holds a picture path, and a picture may change'
})

const each = (value) => (Array.isArray(value) ? value : [])
const READ_ACTIONS = new Set(['info', 'content.get', 'content.list'])
const READ_OPERATIONS = new Set([undefined, 'read', 'inspect'])

const fault = (step, what, reason) => ({ step, what, reason })
/** A call on a channel nobody listed: it is never sent, whatever it holds. */
const channelFault = (what, reason) => ({ step: WRITE, what, reason, channel: true })

/** Which parameters a call may carry. A parameter nobody listed may be a new way to change a page. */
const PARAMS = {
  'content.contract': {
    apply: [
      'operation',
      'expected_revision',
      'apply_id',
      'request_id',
      'changes',
      'empty_links',
      'empty_slots',
      'evidence'
    ],
    'blocks.unpublish': ['operation', 'apply_id', 'request_id', 'expected_revision', 'blocks'],
    'rows.remove': ['operation', 'apply_id', 'request_id', 'expected_revision', 'slots', 'keep']
  },
  'template.siteSettings': { set: ['operation', 'template', 'fields', 'profiles', 'apply_id'] },
  'template.languageOverrides': { setSource: ['operation', 'apply_id', 'template', 'strings'] },
  'site.identity': { set: ['operation', 'fields', 'apply_id'] },
  'media.upload': { [undefined]: ['path', 'content_b64', 'apply_id', 'sha256'] },
  'content.update': { [undefined]: ['apply_id', 'kind', 'id', 'fields'] },
  'content.batch': { [undefined]: ['apply_id', 'request_id', 'operations'] }
}

/** The template settings this kit opens: its logos, its favicon, its name, the settings it says hold a picture. */
function settingsOf(kit) {
  const pictures = new Set([ALWAYS_SHARE_SETTING])
  const words = new Set()
  for (const spot of each(kit?.site?.logoSpots))
    if (spot?.setting) pictures.add(spot.setting).add(`${spot.setting}_small`)
  const favicon = /site setting (\w+)/.exec(String(kit?.site?.favicon?.mechanism?.setting ?? ''))?.[1]
  if (favicon) pictures.add(favicon)
  for (const slot of each(kit?.site?.nameSlots)) {
    const name = /template site setting (\w+)/.exec(String(slot?.setting ?? ''))?.[1]
    if (name) words.add(name)
  }
  for (const slot of each(kit?.site?.settingSlots))
    if (slot?.writeTo?.action === 'template.siteSettings' && slot.writeTo.key) pictures.add(slot.writeTo.key)
  return { pictures, words }
}

/** The columns of rows this kit names as its setting slots. */
const kitColumns = (kit) =>
  new Set(
    each(kit?.site?.settingSlots)
      .filter((s) => s?.writable === true && s.writeTo?.entity && s.writeTo.column)
      .map((s) => `${s.writeTo.entity} ${s.writeTo.column}`)
  )

function settingFaults(params, settings) {
  const values = [
    ...Object.entries(params.fields ?? {}),
    ...Object.values(params.profiles ?? {}).flatMap((p) => Object.entries(p ?? {}))
  ]
  return values.flatMap(([name, value]) => {
    const what = `template setting ${name}`
    if (settings.pictures.has(name))
      return value === '' || PICTURE.test(String(value))
        ? []
        : [fault(WRITE, what, `${name} holds a picture, and this is not one`)]
    if (settings.words.has(name))
      return hasMarkup(String(value)) ? [fault(WRITE, what, `${name} holds a name, with no markup`)] : []
    return [fault(WRITE, what, `the template setting ${name} is not open to the write step`)]
  })
}

/** @param {{ kit?: object, contentMap?: object | null }} input */
export function lookGuard({ kit, contentMap = null }) {
  const settings = settingsOf(kit)
  const named = kitColumns(kit)
  const map = new Map(each(contentMap?.slots).map((s) => [s?.key, s]))
  const state = {
    rows: new Map(),
    layouts: new Set(),
    created: new Set(),
    accents: new Set(),
    routes: null,
    inspected: new Map(),
    // The kit's play buttons with an empty video address: the one hide rule the head injection block may carry for them.
    videoSelectors: emptyVideoButtonsOf(kit).selectors,
    // The kit's containers of "more" buttons that may lead to their own page: what the self link block's rules may name.
    selfLinkContainers: selfLinkButtonsOf(kit).containers
  }
  let owners = new Map()
  const findings = []

  const stepOfKey = (key) => {
    const claim = owners.get(key.replace(/^module-/, 'block-')) ?? owners.get(key)
    return ownerStep(claim?.owner) ?? WRITE
  }

  function slotFaults(key, value) {
    const slot = map.get(key) ?? state.inspected.get(key)
    const step = stepOfKey(key)
    const text = String(value)
    if (slot?.type === 'image')
      return text === '' || PICTURE.test(text)
        ? []
        : [fault(step, key, `${key} holds a picture, and this is not one`)]
    if (slot?.type === 'url')
      return ADDRESS_NOT.test(text) ? [fault(step, key, `${key} holds an address, and this is not one`)] : []
    return markupFaults(text, slot?.sample ?? slot?.current ?? '').map((said) =>
      fault(step, key, `${key}: ${said}`)
    )
  }

  const JUDGES = {
    'content.contract': (p) =>
      p.operation === 'apply' ? Object.entries(p.changes ?? {}).flatMap(([k, v]) => slotFaults(k, v)) : [],
    'template.siteSettings': (p) => settingFaults(p, settings),
    'template.languageOverrides': (p) =>
      Object.entries(p.strings ?? {}).flatMap(([name, value]) =>
        hasMarkup(String(value))
          ? [fault(WRITE, `language string ${name}`, `${name} holds words, with no markup`)]
          : []
      ),
    'site.identity': (p) =>
      Object.entries(p.fields ?? {}).flatMap(([name, value]) =>
        name !== 'sitename' || hasMarkup(String(value))
          ? [fault(WRITE, `site identity ${name}`, `only the site name is open, as words: ${name}`)]
          : []
      ),
    'media.upload': (p) =>
      UPLOAD.test(String(p.path))
        ? []
        : [fault(WRITE, `upload ${p.path}`, `an upload is a picture under images/, and ${p.path} is not`)],
    'content.update': (p) => updateFaults(p, state, named),
    'content.batch': (p) => batchFaults(p, state)
  }

  const isRead = ({ action, params }) =>
    READ_ACTIONS.has(action) ||
    (['content.contract', 'template.siteSettings', 'site.identity'].includes(action) &&
      READ_OPERATIONS.has(params?.operation))

  /** What this write would be refused for: an action, operation or parameter off the list, or what its judge finds. */
  function faultsOf({ action, params = {} }) {
    const ops = PARAMS[action]
    if (!ops) return [channelFault(action, `the action ${action} is not open to the write step`)]
    const listed = ops[params.operation]
    if (!listed)
      return [
        channelFault(
          `${action} ${params.operation}`,
          `the operation ${params.operation} of ${action} is not open to the write step`
        )
      ]
    const extra = Object.keys(params).filter((name) => !listed.includes(name))
    if (extra.length)
      return extra.map((name) =>
        channelFault(`${action} ${name}`, `the parameter ${name} of ${action} is not open to the write step`)
      )
    return JUDGES[action](params)
  }

  /** `sent`: whether the call goes out all the same (a finding on a value) or is held back (a channel nobody listed). */
  const record = (call, faults, sent) => {
    for (const f of faults)
      if (!findings.some((r) => r.what === f.what && r.reason === f.reason))
        findings.push({
          step: f.step,
          stepName: stepName(f.step),
          action: call.action,
          operation: call.params?.operation ?? null,
          what: f.what,
          reason: f.reason,
          sent
        })
  }
  const heldBack = (faults) => faults.some((f) => f.channel)

  /** Learns from what the site answers: what a row holds, which layouts are the template's, what this run made. */
  function learn({ action, params = {} }, answer) {
    if (answer?.ok === false) return
    const keep = (kind, row) => {
      if (!row) return
      state.rows.set(`${kind}:${row.id}`, row)
      // The article a created page's menu item opens is that page's, whatever its own row says of itself.
      const opens = /[?&]view=article&id=(\d+)/.exec(String(row.link ?? ''))?.[1]
      if (kind === 'menuItem' && opens && String(row.note ?? '').startsWith(MARK))
        state.created.add(`article:${Number(opens)}`)
      for (const column of [row.params, row.attribs]) {
        const layout = /"article_layout"\s*:\s*"([^"]+)"/.exec(String(column ?? ''))?.[1]
        if (layout) state.layouts.add(layout)
        if (column && typeof column === 'object' && column.article_layout)
          state.layouts.add(column.article_layout)
      }
    }
    if (action === 'content.get') keep(params.kind, answer?.item && { id: params.id, ...answer.item })
    if (action === 'content.list') for (const row of each(answer?.items)) keep(params.kind, row)
    if (action === 'content.contract' && params.operation === 'inspect')
      for (const slot of each(answer?.slots)) state.inspected.set(slot?.key, slot)
    if (action === 'content.batch')
      for (const op of each(params.operations)) {
        const id = answer?.ids?.[op.key]
        if (id) state.created.add(`${op.kind}:${Number(id)}`)
      }
    if (
      action === 'content.update' &&
      params.kind === 'module' &&
      /id="tracy-ds-slot"/.test(String(params.fields?.content))
    )
      state.accents.add(Number(params.id ?? answer?.id))
  }

  return {
    exceptions: EXCEPTIONS,

    /** What the guard learns once the files are read: who owns each slot, and the accent routes of this template. */
    know({ owners: claims, routes }) {
      if (claims) owners = claims
      if (routes !== undefined) state.routes = routes
    },

    /** Judges a write that is known before anything is sent. @returns {boolean} whether it has no finding */
    check(call) {
      const faults = faultsOf(call)
      record(call, faults, !heldBack(faults))
      return !faults.length
    },

    /** Adds what another stage found itself and wrote all the same, such as a drawn icon. */
    refuse(list) {
      for (const f of list) record({ action: f.action ?? 'media.upload', params: {} }, [f], true)
    },

    /** The door every write of a run goes through. A finding is recorded and the write goes on; a channel nobody listed is held back. */
    door(inner) {
      const apply = async (call) => {
        if (isRead(call)) {
          const answer = await inner.apply(call)
          learn(call, answer)
          return answer
        }
        const faults = faultsOf(call)
        record(call, faults, !heldBack(faults))
        const held = faults.find((f) => f.channel)
        if (held) return { ok: false, error: 'look_guard', message: `${held.what}: ${held.reason}` }
        const answer = await inner.apply(call)
        learn(call, answer)
        return answer
      }
      return { ...inner, apply }
    },

    /** Every finding of the run, each with the step at fault and whether its write was sent all the same. */
    findings: () => [...findings],

    /** The findings whose write was held back: calls on a channel nobody listed. */
    refused: () => findings.filter((f) => !f.sent)
  }
}

export { accentRoutesOf } from './look-guard-css.js'
