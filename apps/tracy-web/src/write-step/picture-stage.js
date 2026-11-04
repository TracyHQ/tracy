// The write step's picture stage (ADR 0044, decision 4): the picture package's claims on slots, its uploads, the setting a
// shared background goes through, the values for the one contract call, and one report line for each thing it holds.
// Without a package it is a stage with nothing to do, so a run without pictures takes the same path.
//
// A package says `writeDoor: "none"` on a setting entry: it was frozen before the door existed, and it is the kit that says
// how a frame is written (`site.settingSlots`: `writable` and `writeTo`), so the field is not read.
import path from 'node:path'
import {
  BODY_BACKGROUND_KEY,
  writeT4BodyBackground
} from '../sites/brief-engines/joomla-t4-body-background.js'
import { brandAsker, said } from './brand-writes.js'
import { refusalWords } from './contract-write.js'
import { packageProblems, PICTURE_OWNER, readPackageFiles } from './picture-package.js'

const ENDED = 'the run ended before this picture was written'
const PAINTING =
  'painted from the brand colours, which arrives with #367; the file beside it is a preview in neutral colours and is not written'

/** Content map key to kit slot id, the reverse of `contentMapKey`. */
const slotOfKey = (key) => key.replace(/^module-/, 'block-')
const each = (x) => (Array.isArray(x) ? x : [])

const idle = {
  active: false,
  claims: [],
  changes: {},
  evidence: {},
  lines: () => []
}
const stoppedBy = (stop) => ({ ...idle, stop })

/** The setting a frame is written through, as the kit says it; null when the kit names none the stage can write. */
function settingOf(frame, kit) {
  const slot = each(kit?.site?.settingSlots).find((s) => each(s?.frames).includes(frame))
  const to = slot?.writeTo
  return slot?.writable === true &&
    to?.action === 'template.siteSettings' &&
    to.key === BODY_BACKGROUND_KEY &&
    to.template
    ? { slot: slot.id, template: to.template, key: to.key }
    : null
}

/** Each setting entry as a write order (one per setting), or as what is left and why. */
function readSettings(entries, kit) {
  const orders = []
  const left = []
  for (const entry of entries) {
    const setting = entry.preview || entry.paint ? null : settingOf(entry.frame, kit)
    if (entry.preview || entry.paint) left.push({ frame: entry.frame, reason: PAINTING })
    else if (!setting)
      left.push({ frame: entry.frame, reason: 'the kit names no writable setting for this frame' })
    else orders.push({ ...setting, frame: entry.frame, entry })
  }
  return { orders, left }
}

/**
 * @param {{ pictures?: object, picturesPath?: string, inputs?: { file: string, sha256: string }, kit: object,
 *   contract: string }} input
 * @returns {Promise<object>} the stage; `stop` says why it cannot run
 */
export async function preparePictureStage({ pictures, picturesPath, inputs, kit, contract }) {
  if (pictures === undefined) return idle
  const problems = packageProblems(pictures, contract)
  if (problems.length)
    return stoppedBy({
      code: 'BAD_FILE',
      reason: `The files cannot be written: pictures: ${problems.join('; ')}`
    })
  const settings = readSettings(pictures.siteSettings, kit)
  const read = await readPackageFiles(
    [...pictures.uploads, ...settings.orders.map((o) => o.entry)],
    path.dirname(picturesPath),
    inputs
  )
  if (read.stop) return stoppedBy(read.stop)
  const { files } = read
  const changes = { ...pictures.mapping.changes }
  const claim = (slot, kind, content) => ({ slot, owner: PICTURE_OWNER, file: inputs.file, kind, content })
  const shaOf = new Map(pictures.uploads.map((u) => [u.sitePath, u.sha256]))
  const claims = [
    ...Object.entries(changes).map(([key, value]) =>
      claim(slotOfKey(key), 'image', `picture ${shaOf.get(value)}`)
    ),
    ...settings.orders.flatMap((o) => [
      claim(o.slot, 'image', `picture ${o.entry.sha256}`),
      claim(o.frame, 'image', `picture ${o.entry.sha256}`)
    ]),
    ...pictures.hidden.map((h) => claim(h.frame, 'hide', '(hide)')),
    // A backdrop sits behind a figure that has its claim, so it claims nothing of its own.
    ...pictures.painted
      .filter((p) => p.kind !== 'backdrop')
      .map((p) => claim(p.frame, 'painted', `painted ${p.kind}`))
  ]
  const oneEach = [...new Map(settings.orders.map((o) => [o.slot, o])).values()]
  const failedUploads = new Map()
  const settingResults = new Map()

  /** One setting: read which profiles there are, then set it. A refusal fails its line and the stage goes on. */
  const writeSetting = async (order, { ask, read: readSite }) => {
    const sitePath = order.entry.sitePath
    if (failedUploads.has(sitePath))
      return { failed: `the upload was refused: ${failedUploads.get(sitePath)}` }
    const { template, key } = order
    const held = await readSite('template.siteSettings', { operation: 'read', template })
    if (!held || held.ok === false) return { failed: said(held) }
    const names = Object.keys(held.profiles ?? {})
    if (!names.length) return { failed: 'the template has no site profile to write' }
    const wrote = await writeT4BodyBackground({ template, path: sitePath, read: readSite, write: ask })
    if (!wrote.ok) return { failed: wrote.reason }
    // The door writes every profile a style uses, so one reads back for all; `default` is among them when it exists.
    const shown = names.includes('default') ? 'default' : names[0]
    return {
      readFrom: {
        action: 'template.siteSettings',
        params: { operation: 'read', template },
        path: ['profiles', shown, 'settings', key],
        type: 'image'
      }
    }
  }

  /** @returns {Promise<{ stop?: object, reading?: object, dropped?: string[] }>} `reading`: the site after the stage */
  const write = async ({ apply, siteKey, sleep }) => {
    const ask = brandAsker({ apply, siteKey, applyId: `pictures-${inputs.sha256.slice(0, 32)}`, sleep })
    const readSite = (action, params) => apply({ siteKey, action, params })
    try {
      for (const [sitePath, bytes] of files) {
        const answer = await ask('media.upload', { path: sitePath, content_b64: bytes.toString('base64') })
        if (!answer || answer.ok === false) failedUploads.set(sitePath, said(answer))
      }
      for (const order of oneEach)
        settingResults.set(order.slot, await writeSetting(order, { ask, read: readSite }))
      // The contract call must name the revision the site has now, whatever this stage moved.
      const reading = await readSite('content.contract', { operation: 'inspect' })
      if (!reading?.ok) return { stop: { code: 'INSPECT_REFUSED', reason: said(reading) } }
      const dropped = Object.keys(changes).filter((key) => failedUploads.has(changes[key]))
      return { reading, dropped }
    } catch (error) {
      return { stop: { code: 'PICTURE_WRITE_FAILED', reason: String(error?.message ?? error) } }
    }
  }

  const line = (slot, key, status, reason, part, more = {}) => ({
    slot,
    key,
    owner: PICTURE_OWNER,
    status,
    reason,
    readBack: null,
    part,
    ...more
  })

  const frameLine = (key, written, refused) => {
    const slot = slotOfKey(key)
    const ordered = changes[key]
    const sent = { ordered }
    if (failedUploads.has(ordered))
      return line(
        slot,
        key,
        'failed',
        `the upload was refused: ${failedUploads.get(ordered)}`,
        'picture',
        sent
      )
    if (refused.has(key)) {
      const entry = refused.get(key)
      return line(slot, key, 'failed', refusalWords(entry), 'picture', { refusal: entry, ...sent })
    }
    return written.has(key)
      ? line(slot, key, 'written', null, 'picture', sent)
      : line(slot, key, 'skipped', ENDED, 'picture')
  }

  const settingLine = (order) => {
    const more = { frame: order.frame, ordered: order.entry.sitePath }
    const result = settingResults.get(order.slot)
    if (!result) return line(order.slot, null, 'skipped', ENDED, 'body-background', { frame: order.frame })
    return result.failed
      ? line(order.slot, null, 'failed', result.failed, 'body-background', more)
      : line(order.slot, null, 'written', null, 'body-background', { ...more, readFrom: result.readFrom })
  }

  /** One report line per thing in the package, from what the stage and the contract call did. */
  const lines = ({ written, refused }) => {
    const wrote = new Set(written)
    return [
      ...Object.keys(changes).map((key) => frameLine(key, wrote, refused)),
      ...oneEach.map(settingLine),
      ...settings.left.map((l) => line(l.frame, null, 'skipped', l.reason, 'body-background')),
      ...pictures.painted.map((p) =>
        p.kind === 'backdrop'
          ? line(`${p.frame}.backdrop`, null, 'skipped', PAINTING, 'picture-painted')
          : line(p.frame, p.key, 'skipped', PAINTING, 'picture-painted')
      )
    ]
  }

  return { active: true, claims, changes, evidence: pictures.mapping.evidence ?? {}, write, lines }
}
