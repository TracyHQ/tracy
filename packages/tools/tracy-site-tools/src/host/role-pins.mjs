/**
 * WHAT A LOOK WRITE TYPED AS A LITERAL OVER THE DESIGN-SYSTEM ROLES — the WordPress and Joomla half of the
 * EmDash rebuild's pin check (`tracy-site-build-emdash/src/host/slot-pins.mjs`), read from what the agent
 * wrote, never from the page.
 *
 * 🔒 WHY (Akemi, 20/10/2026): "a new button follows the customer's template when no design system is
 * worn, and the new system's rules when one is". Every Tracy template reads the standard role variables
 * with its own value as the fallback (`var(--ds-c-accent, #A3E635)`), so a value written that way looks
 * like the template now, follows the system the customer applies, and comes back when it is taken off.
 * A literal hex does none of that, and the value-based design check cannot see it: a literal equal to
 * today's colour is "on the palette". So a write that types one is answered with the `var()` to write.
 *
 * 🔒 ONLY WHAT WAS WRITTEN. The strings of the write (`content.update` fields and blocks, `look.set` props,
 * the new text of a file tool), not the whole stylesheet: older literals of the template are not this
 * edit's, and naming them on every write would drown the one that is.
 *
 * 🔒 NEVER A REFUSAL, NEVER A REWRITE (ADR 0022/0023; council 20/10/2026). The write stands; the answer
 * names each literal, the role nearest it among the roles of what it paints, and the `var()` with the
 * TEMPLATE's value as the fallback. Two roles sharing a value are both named — which one the element plays
 * is the template's, never a guess by value. A value the customer named exactly may stay: the `next` says so.
 */
import { UNKNOWN_TEMPLATE_VALUE, judgeRoleReads, nearestRoles, roleValueOf } from './ds-slot-worn.mjs'

/** At most this many literals are named in one answer. */
export const ROLE_PINS_MAX = 8

/** A CSS declaration a role owns: colours, corner radii, faces. */
const DECLARATION =
  /(?:^|[\s;{"'(])((?:--(?!ds-|wp--)[a-z0-9_-]+)|color|background(?:-color)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|fill|stroke|(?:border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius)|font-family)\s*:\s*((?:"[^"<>{};=]*"|'[^'<>{};=]*'|[^;{}"'<>])+)/gi

/**
 * The colour, border and typography objects of a WordPress block's `style` attribute
 * (`"style":{"color":{"background":"#…","text":"#…"},"border":{"radius":"8px","color":"#…"},"typography":{"fontFamily":"…"}}`):
 * only there do `background`, `text`, `radius` and `fontFamily` mean a look — a top-level `"fontFamily":"inter"`
 * is a preset slug, and any `"text"` elsewhere is words.
 */
const BLOCK_STYLE = /"(color|border|typography)"\s*:\s*\{([^{}]*)\}/g
const BLOCK_STYLE_KEYS = Object.freeze({
  color: { background: 'background', text: 'color', gradient: 'background' },
  border: { radius: 'border-radius', color: 'border-color' },
  typography: { fontFamily: 'font-family' }
})

/** A literal colour inside a value (hex, rgb/hsl/oklch). */
const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\([^()]*\)/i

/** What styles a button: its selector, its tag, its block. */
const BUTTON =
  /wp-block-button(?!s)|^wp:button$|\bbtn\b(?![-_])|\bbtn-(?!group|toolbar)|\bbutton\b(?![-_]?(?:s\b|row|group))|<button\b|\binput\[type=["']?(?:submit|button)|<input\b[^>]*\btype=["']?(?:submit|button)/i

/** A property under the name its duplicates share (a block's `background` is the inline `background-color`). */
export const canonicalProp = (/** @type {string} */ prop) =>
  prop === 'background-color' || prop === 'gradient'
    ? 'background'
    : /^border(?:-[a-z]+)*-color$/.test(prop)
      ? 'border-color'
      : prop

/**
 * What a declaration at `index` of `text` styles: the selector of the rule it stands in, or the tag (or block
 * comment) it is written on — whichever opens nearer before it.
 * @param {string} text
 * @param {number} index
 */
export function contextAt(text, index) {
  const brace = text.lastIndexOf('{', index)
  const tag = text.lastIndexOf('<', index)
  if (tag > brace) {
    // the whole tag, to its own `>` outside quoted attribute values (`data-x="1>2"`): what comes after
    // `style=` (a class, a type) says what the element is
    let end = tag
    let quote = ''
    while (end < text.length && end < tag + 2000) {
      const c = text[end]
      if (quote !== '') {
        if (c === quote) quote = ''
      } else if (c === '"' || c === "'") quote = c
      else if (c === '>') break
      end += 1
    }
    return text.slice(tag, end + 1).slice(0, 400)
  }
  if (brace < 0) return ''
  // the selector: back to the end of the previous rule, declaration or block — or of the `<style>` tag it
  // stands in; a `>` in a selector is a child combinator (`.wp-block-button > a`), never a boundary
  const style = [...text.slice(0, brace).matchAll(/<style\b[^>]*>/gi)].at(-1)
  const start = Math.max(
    text.lastIndexOf('}', brace - 1),
    text.lastIndexOf(';', brace - 1),
    text.lastIndexOf('{', brace - 1),
    style === undefined ? -1 : (style.index ?? 0) + style[0].length - 1
  )
  return text.slice(start + 1, brace).slice(-400)
}

/**
 * Whether written texts hold anything the pins judge (a declaration a role owns, a block style object):
 * a write of words alone has nothing to say about design-system roles.
 * @param {string[]} texts
 */
export function carriesLook(texts) {
  return texts.some(
    (t) =>
      typeof t === 'string' &&
      (new RegExp(DECLARATION.source, 'i').test(t) || new RegExp(BLOCK_STYLE.source).test(t))
  )
}

/** A value that already reads a variable or a preset. */
const RELATIVE = /var\(|var:preset\||calc\(|color-mix\(/

/**
 * @typedef {{ prop: string, value: string, use: string, why: string }} RolePin
 * @typedef {{ added: string[], edits: { address: string, text: string }[], bodies: { address: string, text: string }[] }} Written
 * `added`: all new; `edits`: an edited block of a record, judged against its body read; `bodies`: a field sent
 * whole, judged against the same field read.
 * @typedef {{ vars: string[], tokens: Record<string, string>, values?: Record<string, string>, also?: [string, string][] }} Ruler
 */

/**
 * Every literal colour, corner radius or face the written texts put where a role owns the value.
 *
 * 🔒 THE FALLBACK KEEPS TODAY'S LOOK (review, 20/10/2026). Wearing nothing, it is the literal itself: the
 * role is unset, so the page looks exactly as the agent wrote it, and a system applied later reaches it.
 * Wearing a system, it is the TEMPLATE's own value for that role (the literal there is the worn system's,
 * copied off the page): the role is set, so it looks the same now, and taking the system off brings the
 * template back. A literal of no role (farther than `ROLE_NEAR` from every one) is not given one.
 * @param {string[]} texts - what the write wrote.
 * @param {{ ruler: Ruler, template?: Ruler | null, worn: boolean, every?: boolean }} by - `every`: each
 *   occurrence, uncapped (to count them, `newRolePins`). `ruler`: the worn slot or, wearing
 *   none, the template's roles (`templateRolesOf`); `template`: the template's roles beside a worn slot.
 * @returns {RolePin[]}
 */
export function rolePins(texts, { ruler, template = null, worn, every = false }) {
  /** @type {RolePin[]} */
  const pins = []
  const seen = new Set()
  // worn, and the template's own value not known: said so, never the literal (it is the worn system's)
  const fallback = (/** @type {string} */ role, /** @type {string} */ literal) =>
    worn ? (template?.tokens?.[role] ?? template?.values?.[role] ?? UNKNOWN_TEMPLATE_VALUE) : literal
  const unknownNote = (/** @type {string[]} */ roles) => {
    const missing = worn ? roles.filter((r) => roleValueOf(template, r) === null) : []
    return missing.length === 0
      ? ''
      : `; the template's own value for ${missing.join(' and ')} is not known here: take it from the template's stylesheet (grep "var(--ds-")`
  }
  const add = (/** @type {RolePin} */ pin) => {
    // one literal on one element is one pin, said as a block attribute and an inline style alike
    const key = `${canonicalProp(pin.prop)}|${pin.value}`
    if (!every && (seen.has(key) || pins.length >= ROLE_PINS_MAX)) return
    seen.add(key)
    pins.push(pin)
  }
  const whose = worn ? "the worn design system's" : "the template's"
  for (const written of texts) {
    if (typeof written !== 'string' || written === '' || written.includes('tracy-ds-slot:')) continue
    // a commented-out declaration paints nothing — in a stylesheet, or in a page's `<style>` only: in markup a
    // `/*` is words or an address (`href=".../*"`), never a comment
    const text = /<[a-z!/]/i.test(written)
      ? written.replace(
          /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
          (_m, a, css, b) => `${a}${css.replace(/\/\*[\s\S]*?\*\//g, '')}${b}`
        )
      : written.replace(/\/\*[\s\S]*?\*\//g, '')
    /** @type {{ prop: string, value: string, at: string }[]} */
    const found = [...text.matchAll(DECLARATION)].map((m) => ({
      prop: m[1].toLowerCase(),
      value: m[2].trim(),
      at: contextAt(text, m.index ?? 0)
    }))
    for (const m of text.matchAll(BLOCK_STYLE)) {
      const keys = BLOCK_STYLE_KEYS[/** @type {keyof typeof BLOCK_STYLE_KEYS} */ (m[1])]
      // a block attribute styles its block: the `<!-- wp:<name>` it is written in
      const opened = /<!-- (wp:[a-z0-9/-]+)[^>]*$/.exec(
        text.slice(Math.max(0, (m.index ?? 0) - 4000), m.index ?? 0)
      )
      const at = opened !== null ? opened[1] : contextAt(text, m.index ?? 0)
      for (const a of m[2].matchAll(/"([A-Za-z]+)"\s*:\s*"([^"]+)"/g)) {
        const prop = /** @type {Record<string, string>} */ (keys)[a[1]]
        if (prop !== undefined) found.push({ prop, value: a[2].trim(), at })
      }
    }
    for (const { prop, value, at } of found) {
      // a value written through a role: judged by its fallback (`judgeRoleReads`), never as a literal
      if (/var\(\s*--ds-/i.test(value)) {
        const judged = judgeRoleReads(value, { ruler, template, worn })
        if (judged !== null) add({ prop, value, use: `${prop}: ${judged.use}`, why: judged.why })
        continue
      }
      if (value === '' || RELATIVE.test(value)) continue
      // 🔒 WHAT THE DECLARATION STYLES, NOT WHAT THE TEXT HOLDS (review, 20/10/2026): "a button" is the rule's
      // selector or the element's tag; a whole stylesheet always names a button somewhere
      const button = BUTTON.test(at)
      // a face declared by `@font-face` names a font file, not the face an element wears
      if (/@font-face\s*$/i.test(at)) continue
      if (prop === 'font-family') {
        if (/^(?:inherit|initial|unset|revert)$/i.test(value)) continue
        const roles = ['--ds-font-body', '--ds-font-display'].filter((r) => ruler.vars.includes(r))
        if (roles.length === 0) continue
        add({
          prop,
          value,
          use: roles
            .map(
              (r) =>
                `font-family: var(${r}, ${worn ? (roleValueOf(template, r) ?? UNKNOWN_TEMPLATE_VALUE) : value})`
            )
            .join(' or '),
          why: `a literal face over ${whose} ${roles.join(' or ')}${unknownNote(roles)}`
        })
        continue
      }
      if (prop.endsWith('radius')) {
        if (!/^\d/.test(value)) continue
        // a circle or a square corner is a shape, not the system's corner — unless it is a button's
        if (
          !button &&
          (/%/.test(value) || /^0(?:px|rem|em)?$/.test(value) || Number.parseFloat(value) >= 999)
        )
          continue
        const role = (
          button ? ['--ds-btn-radius', '--ds-card-radius'] : ['--ds-card-radius', '--ds-btn-radius']
        ).find((r) => ruler.vars.includes(r))
        if (role === undefined) continue
        add({
          prop,
          value,
          use: `${prop}: var(${role}, ${fallback(role, value)})`,
          why: `a literal corner radius over ${whose} ${role}${unknownNote([role])}`
        })
        continue
      }
      // a fragment reference (`url(#grad)`) is not a colour
      const colour = COLOUR.exec(value.replace(/url\([^)]*\)/gi, ''))
      if (colour === null) continue
      const paint = /^(?:background|fill|gradient)/.test(prop)
        ? 'bg'
        : /^(?:border|outline|stroke)/.test(prop)
          ? 'border'
          : prop.startsWith('--')
            ? /bg|background|surface|ground|fill/.test(prop)
              ? 'bg'
              : /border|line|rule/.test(prop)
                ? 'border'
                : /text|ink|fg|heading|foreground/.test(prop)
                  ? 'text'
                  : null
            : 'text'
      const roles = nearestRoles(colour[0], ruler.tokens, paint, ruler.also ?? [])
      if (roles.length === 0) continue
      add({
        prop,
        value,
        use: roles
          .map((r) => `${prop}: ${value.replace(colour[0], `var(${r}, ${fallback(r, colour[0])})`)}`)
          .join(' or '),
        why: `a literal colour over ${whose} colour roles (${roles.join(' or ')}${roles.length > 1 ? ': the one this element plays' : ''})${unknownNote(roles)}`
      })
    }
  }
  return pins
}

/**
 * The sentence the agent reads with the pins: each one, then the order of work. A role read without the
 * template's value as its fallback (`judgeRoleReads`) is said apart from the literals: it is written
 * through a role already, and only its fallback is to change.
 * @param {RolePin[]} pins
 * @param {boolean} worn
 */
export function rolePinsNext(pins, worn) {
  const reads = pins.filter((p) => ROLE_READ.test(p.value))
  const literals = pins.filter((p) => !ROLE_READ.test(p.value))
  const listed = (/** @type {RolePin[]} */ some) =>
    some.map((p) => `\`${p.prop}: ${p.value}\` → \`${p.use}\``).join('; ')
  const parts = []
  if (literals.length > 0)
    parts.push(
      `This write typed ${literals.length === 1 ? 'a value' : `${literals.length} values`} as a literal where a design-system role owns it (${listed(literals)}), ` +
        `so ${worn ? 'the next design system, or taking this one off,' : 'a design system the customer applies later'} will not reach ${literals.length === 1 ? 'it' : 'them'}. ` +
        `Write each as the var() named — ${worn ? "the template's own value is the fallback, so it looks the same now and taking the system off brings the template back" : 'the literal stays as the fallback, so it looks the same now'} — ` +
        'before you tell the customer it is done; a value the customer named exactly may stay as they named it: then say it will not follow a design system.'
    )
  if (reads.length > 0)
    parts.push(
      `This write read ${reads.length === 1 ? 'a design-system role' : `${reads.length} design-system roles`} without the template's own value as the fallback (${listed(reads)}): ` +
        (worn
          ? `taking the system off would leave ${reads.length === 1 ? 'it' : 'them'} empty or in the system's look. `
          : `with no system worn, ${reads.length === 1 ? 'it paints' : 'they paint'} nothing. `) +
        "Write each as named — the template's value as the fallback — before you tell the customer it is done."
    )
  return parts.join(' ')
}

/** A value that reads a design-system role (`judgeRoleReads`), not a literal. */
const ROLE_READ = /var\(\s*--ds-/i

/**
 * `look.set`'s values on a site wearing NO design system, each literal written through the one role it sits
 * on, before the write (`look-set.mjs` `roles`).
 *
 * 🔒 WHY (turn latency, 26/10/2026). The answer named `color: var(--ds-c-accent, #2E86DE)` for a literal it
 * had just written, and in two of six measured turns on saigon-iron-boxing the agent then searched the
 * stylesheet, read it and edited the rule by hand — three steps to write what the tool could have. Wearing
 * nothing, the fallback IS the literal and the role is unset, so the page looks exactly as asked either way;
 * written through the role, a design system the customer applies later reaches it (Akemi, 20/10/2026).
 *
 * 🔒 ONLY WHERE IT CHANGES NOTHING ON THE PAGE, ONLY ONE ROLE. Worn, the fallback is the template's value
 * and the role is set, so the page would show the system's colour, not the one asked: left literal, and the
 * pins after the write name it as before. Two roles sharing a value are left too: which one the element
 * plays is the template's, never a guess (`rolePins`). A value already through a variable is the agent's.
 * @param {[string, string][]} props - name and value, as `lookSetRequest` read them.
 * @param {{ ruler: Ruler, selector?: string }} by - the template's roles (`templateRolesOf`), and the
 *   selector the call named (a button's corner is the button role's).
 * @returns {{ props: [string, string][], through: { prop: string, value: string, use: string }[] }}
 */
export function throughRoles(props, { ruler, selector = '' }) {
  /** @type {{ prop: string, value: string, use: string }[]} */
  const through = []
  /** @type {[string, string][]} */
  const out = props.map(([name, value]) => {
    if (RELATIVE.test(value)) return [name, value]
    const pins = rolePins([`${selector} { ${name}: ${value} }`], { ruler, worn: false })
    const use = pins.length === 1 ? pins[0].use : ''
    if (use === '' || use.includes(' or ') || !use.startsWith(`${name}: `)) return [name, value]
    const written = use.slice(name.length + 2)
    if (!ROLE_READ.test(written)) return [name, value]
    through.push({ prop: name, value, use: written })
    return [name, written]
  })
  return { props: out, through }
}

/**
 * The stylesheets a file tool writes, as it names them (`file_path`/`path`, each file of a patch): read
 * around the call as a bash command's are, so the pins are what the call ADDED — an edit's `new_string`
 * carries the lines around the change, a write's `content` the whole file (review, 20/10/2026).
 * @param {string} name - the tool.
 * @param {unknown} args - its arguments, as dsh hands them (an object or its JSON).
 * @param {(path: string) => boolean} isLook - a stylesheet (`shell-look-write.mjs` `isLookFile`).
 * @returns {string[]}
 */
export function fileToolPaths(name, args, isLook) {
  let a = args
  if (typeof a === 'string')
    try {
      a = JSON.parse(a)
    } catch {
      return []
    }
  if (!a || typeof a !== 'object') return []
  const o = /** @type {Record<string, unknown>} */ (a)
  /** @type {string[]} */
  const out = []
  for (const key of ['file_path', 'filePath', 'path'])
    if (typeof o[key] === 'string') out.push(/** @type {string} */ (o[key]))
  if (name === 'apply_patch')
    for (const key of ['patch', 'input'])
      if (typeof o[key] === 'string')
        for (const m of /** @type {string} */ (o[key]).matchAll(
          /^(?:\*\*\* (?:Add|Update) File: |\+\+\+ (?:b\/)?)(\S+)\s*$/gm
        ))
          out.push(m[1])
  return [...new Set(out.filter(isLook))]
}

/**
 * What a `tracy_site` look write wrote (`Written`): `added` — `look.set`'s props as a rule on its target, the
 * blocks a `content.update` inserts, every field of a record it creates — all new; `edits`, the blocks it
 * edits in place, and `bodies`, the fields it sends whole (a WordPress post body, a Joomla article), which
 * hold what the record already had and are judged only against the body this conversation read
 * (`newRolePins`).
 * @param {string} action
 * @param {unknown} params
 * @param {string} [platform] - the CMS: a call without `kind` means a post on WordPress, an article on Joomla.
 * @returns {Written}
 */
export function writtenBySiteCall(action, params, platform = 'wordpress') {
  /** @type {Written} */
  const out = { added: [], edits: [], bodies: [] }
  if (!params || typeof params !== 'object') return out
  const p = /** @type {Record<string, unknown>} */ (params)
  if (action === 'look.set') {
    const props = p.props && typeof p.props === 'object' ? Object.entries(p.props) : []
    // the element it styles, as the rule it writes names it (a button's selector makes its corner the button's)
    const target =
      p.target && typeof p.target === 'object' ? /** @type {Record<string, unknown>} */ (p.target) : {}
    const selector = typeof target.selector === 'string' ? target.selector : ''
    out.added.push(`${selector} { ${props.map(([k, v]) => `${k}: ${String(v)}`).join('; ')} }`)
    return out
  }
  if (action === 'content.batch') {
    for (const item of Array.isArray(p.items) ? p.items : []) {
      const one = writtenBySiteCall('content.update', item, platform)
      out.added.push(...one.added)
      out.edits.push(...one.edits)
      out.bodies.push(...one.bodies)
    }
    return out
  }
  if (action !== 'content.update') return out
  /** @param {unknown} v @param {string[]} into @param {number} depth */
  const walk = (v, into, depth) => {
    if (depth > 6) return
    if (typeof v === 'string') into.push(v)
    else if (Array.isArray(v)) for (const x of v) walk(x, into, depth + 1)
    else if (v && typeof v === 'object') {
      // a block's attributes travel as an object: the same JSON a block comment carries
      if ('style' in v) into.push(JSON.stringify(v))
      for (const x of Object.values(v)) walk(x, into, depth + 1)
    }
  }
  // an inserted block (`"+<i>"`) is all new; an edited one carries what the block already had, judged
  // against the record's body when this conversation read it
  const address = bodyAddress(p, platform)
  if (p.blocks && typeof p.blocks === 'object' && !Array.isArray(p.blocks))
    for (const [key, value] of Object.entries(p.blocks)) {
      /** @type {string[]} */
      const texts = []
      walk(value, texts, 0)
      if (texts.length === 0) continue
      if (key.startsWith('+') || address === null) out.added.push(...texts)
      else out.edits.push({ address, text: texts.join('\n') })
    }
  else walk(p.blocks, out.added, 0)
  const bodyFields = /** @type {Record<string, readonly string[]>} */ (BODY_FIELDS)[kindOf(p, platform)] ?? []
  if (p.fields && typeof p.fields === 'object')
    for (const [field, value] of Object.entries(p.fields)) {
      /** @type {string[]} */
      const texts = []
      walk(value, texts, 0)
      if (texts.length === 0) continue
      // a record this write creates has no body before it: every literal in it is new; a field that is not
      // the body (a title, a status, an option's value) is short and all the write's own
      if (address === null || !bodyFields.includes(field)) out.added.push(...texts)
      else out.bodies.push({ address: `${address}|${field}`, text: texts.join('\n') })
    }
  return out
}

/**
 * The record a content call names, as one key (`post:42`, `templatePart:header`, `postmeta:42:_price`,
 * `article:7`): how a body read is matched to the write that sends it whole. Null for a record the call
 * creates (no id, no key): there is nothing before it to compare with.
 * @param {Record<string, unknown>} p - the call's params.
 * @param {string} [platform] - a call without `kind` means a post on WordPress, an article on Joomla.
 * @returns {string | null}
 */
export function bodyAddress(p, platform = 'wordpress') {
  const kind = kindOf(p, platform)
  const id = Number(p.id)
  const key = typeof p.key === 'string' ? p.key : ''
  const named = Number.isInteger(id) && id > 0
  if (!named && key === '') return null
  return `${kind}:${named ? id : ''}:${key}`
}

/** The kind a content call names, or the engine's own default (WordPress: a post; Joomla: an article). */
const kindOf = (/** @type {Record<string, unknown>} */ p, /** @type {string} */ platform) =>
  typeof p.kind === 'string' && p.kind !== '' ? p.kind : platform === 'joomla' ? 'article' : 'post'

/** The fields of a record that ARE its body, by kind: the only ones a read keeps (`bodiesRead`). */
const BODY_FIELDS = Object.freeze({
  post: ['post_content'],
  template: ['content'],
  templatePart: ['content'],
  article: ['introtext', 'fulltext'],
  module: ['content']
})

/**
 * The body fields a `content.get` answered, under the addresses `writtenBySiteCall` sends them by — the
 * body only (a post's `post_content`, an article's `introtext`/`fulltext`), never its title, dates or guid.
 * @param {Record<string, unknown>} params - the read's params.
 * @param {unknown} answer
 * @param {string} [platform]
 * @returns {{ address: string, text: string }[]}
 */
export function bodiesRead(params, answer, platform = 'wordpress') {
  if (!answer || typeof answer !== 'object') return []
  const a = /** @type {Record<string, any>} */ (answer)
  if (a.ok !== true || !a.item || typeof a.item !== 'object') return []
  const kind = kindOf(params, platform)
  const fields = /** @type {Record<string, readonly string[]>} */ (BODY_FIELDS)[kind] ?? []
  const address = bodyAddress(
    {
      ...params,
      kind,
      id: params.id ?? a.id ?? a.item.ID ?? a.item.id,
      key: params.key ?? a.key
    },
    platform
  )
  if (address === null) return []
  /** @type {{ address: string, text: string }[]} */
  const out = []
  for (const field of fields) {
    const value = a.item[field]
    if (typeof value === 'string' && value.length <= 2 * 1024 * 1024)
      out.push({ address: `${address}|${field}`, text: value })
  }
  return out
}

/**
 * The pins a file's new text has that its old text did not — the council's rule (20/10/2026): compare
 * the findings before and after, never the changed lines, or one edit to a minified stylesheet would
 * name every literal the template already had. A file that did not exist reads as empty.
 * @param {string[]} before - each file's text before the command (or '').
 * @param {string[]} after - the same files after it.
 * @param {{ ruler: Ruler, template?: Ruler | null, worn: boolean }} by
 * @returns {RolePin[]}
 */
export function newRolePins(before, after, by) {
  /** @type {Map<string, number>} */
  const had = new Map()
  const keyOf = (/** @type {RolePin} */ p) => `${canonicalProp(p.prop)}|${p.value}`
  for (const p of rolePins(before, { ...by, every: true })) had.set(keyOf(p), (had.get(keyOf(p)) ?? 0) + 1)
  /** @type {RolePin[]} */
  const out = []
  const said = new Set()
  for (const p of rolePins(after, { ...by, every: true })) {
    const key = keyOf(p)
    const left = had.get(key) ?? 0
    if (left > 0) {
      had.set(key, left - 1)
      continue
    }
    if (said.has(key) || out.length >= ROLE_PINS_MAX) continue
    said.add(key)
    out.push(p)
  }
  return out
}

/** The answer line of a look-file read. */
const FILE_LINE = 'TRACY_LOOK_FILE '

/** At most this many files, and this many bytes of each, are read around one command. */
export const LOOK_FILES_MAX = 6
export const LOOK_FILE_BYTES = 256 * 1024

/**
 * The shell a site's web container runs to read the stylesheets a command names, AS THE COMMAND SEES
 * THEM: in the site's own container, as www-data, from the command's own working directory — the same
 * world the fence runs the command in, so a relative path resolves the same way and no other site's
 * file exists there. One line per file: its name, its size (-1: not a regular file — missing, a
 * directory, a symlink, which is never followed), and up to `LOOK_FILE_BYTES` of it, both base64.
 * `sh -c SCRIPT sh <file>…`.
 */
export const LOOK_FILES_SH =
  'for f do n=$(printf %s "$f" | base64 | tr -d "\\n"); ' +
  'if [ -L "$f" ] || { [ -e "$f" ] && [ ! -f "$f" ]; }; then s=-2; ' +
  // not there — unless its folder is one the site user cannot enter, which hides a file that may be there
  'elif [ ! -e "$f" ]; then d=$(dirname -- "$f"); if [ -d "$d" ] && [ ! -x "$d" ]; then s=-2; else s=-1; fi; ' +
  'elif [ ! -r "$f" ]; then s=-2; ' +
  'else s=$(wc -c < "$f" 2>/dev/null | tr -d " "); [ -n "$s" ] || s=-2; fi; ' +
  `printf '${FILE_LINE}%s %s ' "$n" "$s"; ` +
  `if [ "$s" -ge 0 ] 2>/dev/null; then head -c ${LOOK_FILE_BYTES} -- "$f" | base64 | tr -d "\\n"; fi; printf '\\n'; done`

/**
 * The docker sub-argv of that read.
 * @param {string} container - `<label>-web-1`.
 * @param {string} workdir - the command's working directory inside the container.
 * @param {string[]} files - as the command names them.
 */
export function lookFilesArgv(container, workdir, files) {
  if (!/^[a-z0-9][a-z0-9-]*-web-1$/.test(container))
    throw new TypeError('lookFilesArgv: not a site web container')
  return [
    'exec',
    '-u',
    'www-data',
    '-w',
    workdir,
    container,
    'sh',
    '-c',
    LOOK_FILES_SH,
    'sh',
    ...files.slice(0, LOOK_FILES_MAX)
  ]
}

/** What a read answers for a file that is there but was not read (unreadable, not a plain file, past the bound). */
export const NOT_READ = Symbol('not read')

/**
 * What a read printed: each file's text; null for a file that is not there (a write may create it: it
 * reads as empty); `NOT_READ` for one that is there but was not read — unreadable, a link or a folder, or
 * past `LOOK_FILE_BYTES` — about which nothing is concluded: "not checked", never "clean".
 * @param {string} stdout
 * @returns {Map<string, string | null | typeof NOT_READ>}
 */
export function parseLookFiles(stdout) {
  /** @type {Map<string, string | null | typeof NOT_READ>} */
  const out = new Map()
  for (const line of String(stdout ?? '').split('\n')) {
    if (!line.startsWith(FILE_LINE)) continue
    const [name64 = '', size = '', body = ''] = line.slice(FILE_LINE.length).split(' ')
    const name = Buffer.from(name64, 'base64').toString('utf8')
    const n = size === '' ? Number.NaN : Number(size)
    out.set(
      name,
      n === -1
        ? null
        : Number.isInteger(n) && n >= 0 && n <= LOOK_FILE_BYTES
          ? Buffer.from(body, 'base64').toString('utf8')
          : NOT_READ
    )
  }
  return out
}
