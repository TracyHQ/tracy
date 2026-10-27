/**
 * The settings behind the two badges — what `/ops/widget` edits and what the served scripts embed.
 *
 * TWO BADGES, ONE SHAPE. `seat` is the pill on a customer's working copy (`lib/seat-badge.js`,
 * served at `/badge.js`); `advert` is the banner a demo carries (`lib/tracy-badge.js` and its
 * JoomlArt twin `lib/build-with-tracy-demo.js`). Each has doors (a label and an on/off switch per
 * door) and a style (three colours, a corner, the mark — and, on the advert alone, whether it
 * moves). The defaults below ARE today's badges:
 * a deployment with no row renders what it rendered before this file existed — with one
 * exception, below.
 *
 * 🔒 THE SEAT PILL IS OFF UNLESS STAFF SWITCH IT ON (01/10/2026). "Managed with Tracy" on a
 * customer's own site told a person who is already in Tracy something they knew, and told their
 * visitors something the customer did not want said. `seat.on` is the whole pill: false serves a
 * script that draws nothing (`lib/seat-badge.js`). The doors keep their defaults so switching the
 * pill back on at `/ops/widget` brings back a working badge, not an empty one. A stored seat row
 * from before this switch has no `on` and reads as OFF — those rows were saved when hiding the pill
 * was not a choice, so they do not count as a choice to show it.
 *
 * 🔒 THE VALIDATOR IS THE SCHEMA, AND IT RUNS ON READ AS WELL AS ON WRITE. The document is embedded
 * whole into a script that runs on a customer's page, so every field is bounded here: a colour is
 * exactly `#rrggbb` (so it is safe inside a style rule), a label is short text with no tag, an
 * unknown key anywhere is refused rather than carried along. A stored row the current validator
 * no longer accepts — an old shape, a hand edit — is not served; the defaults are, at the row's
 * own revision so the next save replaces it instead of colliding.
 *
 * Deliberately free of imports: `badge/route.js` may reach only into `lib/`
 * (`test/tracy-badge.test.mjs`), and this file is the one it reaches for.
 */

/**
 * JSON that is safe inside a `<script>`: `<` and the two line separators escaped, so no label can
 * close the tag or break a line. Every served badge embeds its document through this.
 */
export function inlineJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** The two badges this table knows. Anything else is refused by name, never defaulted. */
export const BADGE_IDS = Object.freeze(['seat', 'advert'])

/** `#rrggbb`, lowercase after normalisation — the only form that is safe inside a CSS value. */
const HEX = /^#[0-9a-f]{6}$/
const LABEL_MAX = 40
/** The two corners a badge may sit in. */
const POSITIONS = Object.freeze(['right', 'left'])

export const DEFAULT_SETTING = Object.freeze({
  seat: {
    on: false,
    pillLabel: 'Managed with Tracy',
    signedInAs: 'Signed in as',
    doors: {
      home: { on: true, label: 'Tracy' },
      signIn: { on: true, label: 'Sign in' },
      team: { on: true, label: 'Team' },
      hide: { on: true, label: 'Hide this badge' }
    },
    style: { bg: '#111111', fg: '#ffffff', accent: '#bf5b3d', position: 'right', mark: true }
  },
  advert: {
    doors: {
      customize: { on: true, label: 'Customize with Tracy' },
      close: { on: true, label: 'Close' }
    },
    style: {
      bg: '#ffffff',
      fg: '#1d1d1f',
      accent: '#bf5b3d',
      position: 'right',
      mark: true,
      animation: false
    }
  }
})

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** A refusal names the path of the first field that failed, so the screen can point at it. */
const refuse = (path) => ({ error: 'INVALID_SETTING', path })

function label(value, path) {
  if (typeof value !== 'string') return refuse(path)
  const text = value.trim()
  if (text === '' || text.length > LABEL_MAX || /[<>]/.test(text)) return refuse(path)
  return { value: text }
}

function colour(value, path) {
  if (typeof value !== 'string') return refuse(path)
  const hex = value.trim().toLowerCase()
  return HEX.test(hex) ? { value: hex } : refuse(path)
}

/** Every key present must be expected, and every expected key must be present. */
function keysMatch(object, expected, path) {
  for (const key of Object.keys(object))
    if (!expected.includes(key)) return refuse(path ? `${path}.${key}` : key)
  for (const key of expected) if (!(key in object)) return refuse(path ? `${path}.${key}` : key)
  return null
}

function doors(value, expected, path) {
  if (!isPlainObject(value)) return refuse(path)
  const bad = keysMatch(value, expected, path)
  if (bad) return bad
  const out = {}
  for (const key of expected) {
    const door = value[key]
    const here = `${path}.${key}`
    if (!isPlainObject(door)) return refuse(here)
    const shape = keysMatch(door, ['on', 'label'], here)
    if (shape) return shape
    if (typeof door.on !== 'boolean') return refuse(`${here}.on`)
    const text = label(door.label, `${here}.label`)
    if (text.error) return text
    out[key] = { on: door.on, label: text.value }
  }
  return { value: out }
}

const STYLE_KEYS = ['bg', 'fg', 'accent', 'position', 'mark']

function style(input, path, id) {
  if (!isPlainObject(input)) return refuse(path)
  const advert = id === 'advert'
  // `animation` is the advert's alone, and younger than the rows already saved: a stored advert
  // without it reads as off. Refusing it would serve the default words on every demo instead of
  // the saved ones.
  const value = advert && !('animation' in input) ? { ...input, animation: false } : input
  const bad = keysMatch(value, advert ? [...STYLE_KEYS, 'animation'] : STYLE_KEYS, path)
  if (bad) return bad
  const out = {}
  for (const key of ['bg', 'fg', 'accent']) {
    const c = colour(value[key], `${path}.${key}`)
    if (c.error) return c
    out[key] = c.value
  }
  if (!POSITIONS.includes(value.position)) return refuse(`${path}.position`)
  if (typeof value.mark !== 'boolean') return refuse(`${path}.mark`)
  out.position = value.position
  out.mark = value.mark
  if (advert) {
    if (typeof value.animation !== 'boolean') return refuse(`${path}.animation`)
    out.animation = value.animation
  }
  return { value: out }
}

/**
 * Check one badge's document and return it normalised (trimmed labels, lowercase colours).
 * @param {string} id
 * @param {unknown} value
 * @returns {{setting: object} | {error: 'UNKNOWN_BADGE'} | {error: 'INVALID_SETTING', path: string}}
 */
export function validateBadgeSetting(id, value) {
  if (!BADGE_IDS.includes(id)) return { error: 'UNKNOWN_BADGE' }
  if (!isPlainObject(value)) return refuse('')
  // `on` is the seat's alone, and younger than the rows already saved: a stored seat without it
  // reads as off (see the header), its words and colours kept for the day it is switched back on.
  const doc = id === 'seat' && !('on' in value) ? { on: false, ...value } : value
  const expectedTop = id === 'seat' ? ['on', 'pillLabel', 'signedInAs', 'doors', 'style'] : ['doors', 'style']
  const bad = keysMatch(doc, expectedTop, '')
  if (bad) return bad
  const out = {}
  if (id === 'seat') {
    if (typeof doc.on !== 'boolean') return refuse('on')
    out.on = doc.on
    for (const key of ['pillLabel', 'signedInAs']) {
      const text = label(doc[key], key)
      if (text.error) return text
      out[key] = text.value
    }
  }
  const d = doors(doc.doors, Object.keys(DEFAULT_SETTING[id].doors), 'doors')
  if (d.error) return d
  out.doors = d.value
  const s = style(doc.style, 'style', id)
  if (s.error) return s
  out.style = s.value
  return { setting: out }
}

const defaultsAt = (id, row) => ({
  setting: DEFAULT_SETTING[id],
  revision: row?.revision ?? 0,
  updatedBy: row?.updated_by ?? null,
  updatedAt: row?.updated_at ?? null
})

/**
 * Both badges as the scripts and the screen should see them. A missing pool (a test, a build with
 * no database) or a missing row is the defaults at revision 0; a row that fails validation is the
 * defaults at that row's revision. Never throws for a shape reason — a database error still does,
 * and the script route decides what to do with that.
 * @param {{query: Function} | null | undefined} pool
 */
export async function readBadgeSettings(pool) {
  const rows = pool
    ? (await pool.query('select id, setting, revision, updated_by, updated_at from badge_setting')).rows
    : []
  const byId = new Map(rows.map((r) => [r.id, r]))
  const out = {}
  for (const id of BADGE_IDS) {
    const row = byId.get(id)
    const checked = row ? validateBadgeSetting(id, row.setting) : null
    out[id] = checked?.setting
      ? {
          setting: checked.setting,
          revision: row.revision,
          updatedBy: row.updated_by,
          updatedAt: row.updated_at
        }
      : defaultsAt(id, row)
  }
  return out
}

/**
 * Write one badge's document. `revision` 0 means "no row yet"; anything else must equal the row's
 * current revision or the save is refused and the caller re-reads — the same optimistic rule
 * `saveDemoDomain` follows. The document is validated here too, so a route cannot forget.
 * @returns {Promise<{ok: true, revision: number, setting: object} | {error: 'UNKNOWN_BADGE'} | {error: 'INVALID_SETTING', path: string} | {error: 'BADGE_CHANGED'}>}
 */
export async function saveBadgeSetting(pool, id, value, revision, email) {
  const checked = validateBadgeSetting(id, value)
  if (checked.error) return checked
  if (!Number.isSafeInteger(revision) || revision < 0) return refuse('revision')
  const result =
    revision === 0
      ? await pool.query(
          `insert into badge_setting (id, setting, updated_by) values ($1, $2::jsonb, $3)
           on conflict do nothing returning revision`,
          [id, JSON.stringify(checked.setting), email]
        )
      : await pool.query(
          `update badge_setting set setting = $1::jsonb, updated_by = $2, revision = revision + 1, updated_at = now()
           where id = $3 and revision = $4 returning revision`,
          [JSON.stringify(checked.setting), email, id, revision]
        )
  return result.rows.length
    ? { ok: true, revision: result.rows[0].revision, setting: checked.setting }
    : { error: 'BADGE_CHANGED' }
}
