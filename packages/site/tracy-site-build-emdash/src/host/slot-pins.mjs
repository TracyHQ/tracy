/**
 * THE CHECK `site.rebuild` MAKES ON A SITE WEARING A DESIGN-SYSTEM SLOT: which classes written since
 * the last build pin a value the slot owns (TCH #1100, 10/10/2026).
 *
 * 🔒 WHY A CHECK AND NOT ONE MORE SENTENCE (stand, images from 8323b61f7). The agent's context held the
 * Design system line word for word — "replace every literal the element already carries … `!` only
 * before a var() value" — and on dskeepem (Moxie) "make the main button at the top a bit smaller" still
 * became one string replace that kept `!rounded-full` and wrote `!text-[16px]`; under MotherDuck (2px
 * corners) the hero stayed a pill. Its page reads had failed under load, so it never looked again. A
 * rebuild is the one call every EmDash look edit ends in, so that answer names each pin, where it is and
 * what to write instead — the build still happens: a customer's edit is never held back.
 *
 * 🔒 WHAT "WRITTEN SINCE THE LAST BUILD" MEANS, WITHOUT A RECORD OF ITS OWN. The last successful build's
 * output, `/app/dist`, IS that record: Astro compiles a class attribute into the server chunk verbatim,
 * so a class string in `/app/src` that `/app/dist` does not contain was written after it. Measured on the
 * stand (dskeepem, 626 files, 35 MB, 0.9 s to read): the hero's current class string is in dist, the one
 * an earlier turn replaced is not. No snapshot to keep in step, nothing written into the customer's
 * container, and it holds on a site that never had a Tracy rebuild (dist is what its image shipped). The
 * read runs BEFORE `astro build`, while dist is still the previous build. Its blind spot: a string that
 * also occurs elsewhere in dist (a short class reused verbatim) reads as unchanged — a missed warning,
 * never a false one. A class string holding `&` (`[[data-ds-worn]_&]:inline-flex`) is in a static
 * attribute Astro writes escaped (`&amp;`), so it is looked for in that spelling too: measured on the
 * stand (dswalkem02, Tracy Business 1.7.11, 11/10/2026), the hero's class string was in dist only as
 * `…_&amp;]:inline-flex`, so every save of `Home.astro` named the hero's pins again.
 *
 * 🔒 ONLY FILES SAVED AFTER THAT BUILD ARE READ. Absent from dist is not the same as new: a component no
 * page uses is left out of the bundle. Measured on the same stand with nothing edited since its last
 * build: 14 class strings of unused shadcn components (`checkbox.tsx` `rounded-[4px]`, `input.tsx`
 * `rounded-md`, …) were absent from dist, and every rebuild would have told the agent to "fix" them. A
 * source file whose mtime is not newer than dist's newest file has not changed since that build, so it is
 * not read; within a file saved since, the dist test picks the strings that changed.
 */
import {
  UNKNOWN_TEMPLATE_VALUE,
  judgeRoleReads,
  nearestRoles,
  nearestSlotColour,
  roleValueOf,
  templateRolesOf,
  wornSlotOf
} from '../../../../tools/tracy-site-tools/src/host/ds-slot-worn.mjs'

/** The answer line of the container read. */
const LINE = 'TRACY_SLOT_PINS '

/**
 * At most this much of the template's stylesheets comes back (Business: ~60 KB): the ruler when no system
 * is worn, and the fallback a value written on a worn site keeps when one is.
 */
export const ROLES_TEXT_MAX = 256 * 1024

/** At most this many changed class strings come back from one read. */
export const PINS_READ_MAX = 200

/**
 * The node script the site's container runs as www-data: `node -e SCRIPT <app root>`. It answers
 * `{ok, slot: null}` (no slot, and no stylesheet of the template reads a role: nothing else is read) or
 * `{ok, slot, roles, dist, found:[{file, line, cls, text}], more}` — `roles`, the text of the template's own
 * stylesheets under `/app/src` (their `var(--ds-<role>, <value>)` are the ruler with no slot worn, and the
 * template's own value a role's fallback keeps with one worn; the slot itself lives in `/app/data`);
 * `found`, every quoted string on a source line that holds a class this check judges and that the last build's
 * output does not contain.
 */
export const SLOT_PINS_SCRIPT =
  'const fs=require("fs"),path=require("path");const app=process.argv[1]||"/app";' +
  `const o=(a)=>console.log(${JSON.stringify(LINE)}+Buffer.from(JSON.stringify(a)).toString("base64"));` +
  'const walk=(d,re,acc)=>{let es=[];try{es=fs.readdirSync(d,{withFileTypes:true})}catch{return acc}for(const e of es){if(e.name==="node_modules"||e.name.startsWith("."))continue;const p=path.join(d,e.name);if(e.isDirectory())walk(p,re,acc);else if(re.test(e.name))acc.push(p)}return acc};' +
  'const CAND=/rounded|(^|[\\s"\'`!:])p[xytblrse]?-|bg-\\[|text-|border-\\[|var\\(--ds-/;' +
  'try{let slot=null;try{slot=fs.readFileSync(path.join(app,"data","ds-slot.css"),"utf8").slice(0,65536)}catch{}' +
  'if(slot!==null&&!slot.startsWith("/* tracy-ds-slot: "))slot=null;' +
  // the template's own stylesheets, whose `var(--ds-<role>, <its value>)` are the ruler with no system worn
  // and the template's value a role's fallback keeps with one worn (review of #1513, 21/10/2026)
  `let roles=walk(path.join(app,"src"),/\\.css$/,[]).map((f)=>fs.readFileSync(f,"utf8")).join("\\n").slice(0,${ROLES_TEXT_MAX});if(!roles.includes("var(--ds-"))roles=null;` +
  'if(slot===null&&roles===null){o({ok:true,slot:null})}else{' +
  'let built=0;const dist=walk(path.join(app,"dist"),/\\.(m?js|html)$/,[]).map((f)=>{built=Math.max(built,fs.statSync(f).mtimeMs);return fs.readFileSync(f,"utf8")}).join("\\n");' +
  'if(dist===""){o({ok:true,slot,roles,dist:false,found:[]})}else{const found=[];' +
  `for(const f of walk(path.join(app,"src"),/\\.(astro|[jt]sx?|mjs|html|mdx?)$/,[])){if(fs.statSync(f).mtimeMs<=built)continue;const lines=fs.readFileSync(f,"utf8").split("\\n");lines.forEach((t,i)=>{if(!CAND.test(t))return;for(const m of t.matchAll(/"([^"\\n]*)"|'([^'\\n]*)'|\`([^\`\\n]*)\`/g)){const s=m[1]??m[2]??m[3];if(!s||!CAND.test(s)||dist.includes(s)||(s.includes("&")&&dist.includes(s.replaceAll("&","&amp;"))))continue;found.push({file:path.relative(app,f),line:i+1,cls:s.slice(0,600),text:t.trim().slice(0,300)})}})}` +
  `o({ok:true,slot,roles,dist:true,found:found.slice(0,${PINS_READ_MAX}),more:Math.max(0,found.length-${PINS_READ_MAX})})}}` +
  '}catch(e){o({ok:false,error:String((e&&e.message)||e).slice(0,200)})}'

/**
 * The docker sub-argv of that read, in the site's own web container, as the site user.
 * @param {string} container
 */
export function slotPinsArgv(container) {
  return ['exec', '-u', 'www-data', container, 'node', '-e', SLOT_PINS_SCRIPT, '/app']
}

/**
 * @typedef {{ file: string, line: number, cls: string, text?: string }} ChangedClass
 * @typedef {{ ok: true, slot: string | null, roles?: string | null, dist?: boolean, found?: ChangedClass[], more?: number }} PinsRead
 */

/**
 * The read's one line, or null when it did not answer (the rebuild then says nothing about pins).
 * @param {string} stdout
 * @returns {PinsRead | null}
 */
export function parsePinsRead(stdout) {
  const line = String(stdout ?? '')
    .split('\n')
    .find((l) => l.startsWith(LINE))
  if (line === undefined) return null
  try {
    const a = JSON.parse(Buffer.from(line.slice(LINE.length).trim(), 'base64').toString('utf8'))
    return a && typeof a === 'object' && a.ok === true ? a : null
  } catch {
    return null
  }
}

// ── What pins a value the slot owns ─────────────────────────────────────────────────────────────

/** Tailwind v4's radius scale, as the literal each name pins (the fallback that keeps today's look). */
const RADIUS = Object.freeze({
  none: '0',
  xs: '0.125rem',
  sm: '0.25rem',
  '': '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  '3xl': '1.5rem',
  '4xl': '2rem',
  full: '9999px'
})

const VARIANTS = '((?:[\\w@\\[\\]=-]+:)*)'
const RADIUS_UTIL = new RegExp(
  `^${VARIANTS}(!?)(rounded(?:-(?:t|r|b|l|tl|tr|br|bl|s|e|ss|se|es|ee))?)(?:-(none|xs|sm|md|lg|xl|2xl|3xl|4xl|full|\\[[^\\]]+\\]))?(!?)$`
)
const PAD_UTIL = new RegExp(`^${VARIANTS}(!?)(p[xytblrse]?)-(\\d+(?:\\.\\d+)?|px|\\[[^\\]]+\\])(!?)$`)
const COLOUR_UTIL = new RegExp(`^${VARIANTS}(!?)(bg|text|border(?:-[trblxy])?)-\\[([^\\]]+)\\](!?)$`)
const SIZE_UTIL = new RegExp(`^${VARIANTS}(!?)text-(xs|sm|base|lg|xl|[2-9]xl|\\[[^\\]]+\\])(!?)$`)

/** An arbitrary value that reads a variable is relative; anything else in brackets is a literal. */
const relative = (/** @type {string | undefined} */ v) => typeof v === 'string' && /var\(/.test(v)
const unbracket = (/** @type {string} */ v) => v.replace(/^\[|\]$/g, '').replaceAll('_', ' ')
const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i

/**
 * @typedef {{ at: string, class: string, use: string, why: string }} Pin
 * `at` is `<file>:<line>` under `/app`, `class` the class as written, `use` what to write instead.
 */

/**
 * Every class in the changed class strings that pins a value the worn slot owns, with the slot-relative
 * class to write instead (the template's own value as the fallback, so the look is the same today and
 * comes back when the system is taken off), every class that reads a role with no fallback or with the
 * worn system's value as one (`judgeRoleReads`), and every `!` before a literal.
 *
 * 🔒 A SITE WEARING NO SYSTEM IS JUDGED TOO (Akemi, 20/10/2026: "a new button follows the template when no
 * design system is worn, and the new system's rules when one is"). Its ruler is the roles the template's
 * own stylesheets read (`templateRolesOf`: `var(--ds-btn-radius, 8px)`): a `rounded-full` or a
 * `bg-[#da5a2a]` written today matches the template, and the first system the customer applies never
 * reaches it. Written relative to the role, with the literal as its fallback, it looks the same now and
 * follows that system. A colour two roles share is named with both: which one the element plays is the
 * template's, never a guess by value.
 * @param {PinsRead} read
 * @returns {Pin[]}
 */
export function slotPins(read) {
  if (!read || !Array.isArray(read.found)) return []
  const worn = typeof read.slot === 'string' ? wornSlotOf('emdash', { css: read.slot }) : null
  const template = typeof read.roles === 'string' ? templateRolesOf(read.roles) : null
  const slot = worn ?? template
  if (slot === null) return []
  const owner = worn !== null ? "the slot's" : "the template's role"
  const vars = new Set(slot.vars)
  // 🔒 THE FALLBACK IS THE TEMPLATE'S VALUE ON A WORN SITE TOO (review of #1513, 21/10/2026), as
  // `role-pins.mjs` writes it for WordPress and Joomla. The literal typed there is the worn system's, copied
  // off the page: kept as the fallback, it froze that system's look on the element once the system was taken
  // off. Wearing nothing, the literal is the template's look today and stays. A template value not known is
  // said, never invented.
  const keep = (/** @type {string} */ role, /** @type {string} */ literal) => {
    if (worn === null) return literal
    const own = roleValueOf(template, role)
    return own === null ? UNKNOWN_TEMPLATE_VALUE : own.replaceAll(' ', '_')
  }
  const unknownNote = (/** @type {string} */ role) =>
    worn !== null && roleValueOf(template, role) === null
      ? `; the template's own value for ${role} is not known here: take it from the template's stylesheet (grep "var(${role}")`
      : ''
  /** @type {Pin[]} */
  const pins = []
  const seen = new Set()
  const add = (
    /** @type {string} */ at,
    /** @type {string} */ cls,
    /** @type {string} */ use,
    /** @type {string} */ why
  ) => {
    const key = `${at}|${cls}`
    if (seen.has(key)) return
    seen.add(key)
    pins.push({ at, class: cls, use, why })
  }
  for (const f of read.found) {
    const at = `${f.file}:${f.line}`
    const context = `${f.cls} ${f.text ?? ''}`
    const button = /\bbtn-|<button\b/.test(context)
    const heading = /<h1\b|\bh-hero\b/.test(context)
      ? '--ds-size-display'
      : /<h2\b|\bh-section/.test(context)
        ? '--ds-size-heading'
        : /<h3\b/.test(context)
          ? '--ds-size-card'
          : null
    for (const cls of f.cls.split(/\s+/).filter(Boolean)) {
      // a class written through a role: judged by its fallback (`judgeRoleReads`), never as a literal
      if (/var\(\s*--ds-/i.test(cls)) {
        const judged = judgeRoleReads(cls, { ruler: slot, template, worn: worn !== null, tailwind: true })
        if (judged !== null) add(at, cls, judged.use, judged.why)
        continue
      }
      let m = RADIUS_UTIL.exec(cls)
      if (m !== null) {
        const [, variants, bang, base, value = '', tail] = m
        if (relative(value)) continue
        const v = [
          button ? '--ds-btn-radius' : '--ds-card-radius',
          button ? '--ds-card-radius' : '--ds-btn-radius'
        ].find((name) => vars.has(name))
        const literal = value.startsWith('[')
          ? unbracket(value)
          : RADIUS[/** @type {keyof typeof RADIUS} */ (value)]
        if (v !== undefined && literal !== undefined)
          add(
            at,
            cls,
            `${variants}${bang}${base}-[var(${v},${keep(v, literal.replaceAll(' ', '_'))})]${tail}`,
            `a literal corner radius over ${owner} ${v}${unknownNote(v)}`
          )
        else if (bang || tail)
          add(at, cls, `${variants}${base}${value ? `-${value}` : ''}`, '`!` before a literal')
        continue
      }
      m = PAD_UTIL.exec(cls)
      if (m !== null) {
        const [, variants, bang, base, value, tail] = m
        if (relative(value)) continue
        const literal = value.startsWith('[')
          ? unbracket(value)
          : value === 'px'
            ? '1px'
            : `${Number(value) * 0.25}rem`
        const axes = base === 'p' ? ['x', 'y'] : /^p[ytb]$/.test(base) ? ['y'] : ['x']
        if (button && axes.every((a) => vars.has(`--ds-btn-pad-${a}`))) {
          const use = (base === 'p' ? ['px', 'py'] : [base])
            .map(
              (b, i) =>
                `${variants}${bang}${b}-[var(--ds-btn-pad-${axes[i] ?? axes[0]},${keep(`--ds-btn-pad-${axes[i] ?? axes[0]}`, literal.replaceAll(' ', '_'))})]${tail}`
            )
            .join(' ')
          add(
            at,
            cls,
            use,
            `a literal button padding over ${owner} ${axes.map((a) => `--ds-btn-pad-${a}`).join(' and ')}${axes.map((a) => unknownNote(`--ds-btn-pad-${a}`)).find((n) => n !== '') ?? ''}`
          )
        } else if (bang || tail) add(at, cls, `${variants}${base}-${value}`, '`!` before a literal')
        continue
      }
      m = COLOUR_UTIL.exec(cls)
      if (m !== null && COLOUR.test(unbracket(`[${m[4]}]`))) {
        const [, variants, bang, base, value, tail] = m
        const literal = unbracket(`[${value}]`)
        const paint = base === 'bg' ? 'bg' : base === 'text' ? 'text' : 'border'
        const named =
          worn !== null
            ? [nearestSlotColour(literal, slot.tokens)]
            : nearestRoles(literal, slot.tokens, paint, /** @type {any} */ (slot).also ?? [])
        const roles = /** @type {string[]} */ (named.filter((one) => one !== null))
        if (roles.length > 0)
          add(
            at,
            cls,
            roles.map((v) => `${variants}${bang}${base}-[var(${v},${keep(v, value)})]${tail}`).join(' or '),
            worn !== null
              ? `a literal colour over the slot's colours (nearest ${roles[0]})${unknownNote(roles[0])}`
              : `a literal colour over the template's colour roles (nearest ${roles.join(' or ')}${roles.length > 1 ? ': the one this element plays' : ''})`
          )
        else if (bang || tail) add(at, cls, `${variants}${base}-[${value}]`, '`!` before a literal')
        continue
      }
      m = SIZE_UTIL.exec(cls)
      if (m !== null) {
        const [, variants, bang, value, tail] = m
        if (relative(value)) continue
        if (heading !== null && vars.has(heading) && value.startsWith('['))
          add(
            at,
            cls,
            `${variants}${bang}text-[var(${heading},${keep(heading, unbracket(value).replaceAll(' ', '_'))})]${tail}`,
            `a literal heading size over ${owner} ${heading}${unknownNote(heading)}`
          )
        else if (bang || tail) add(at, cls, `${variants}text-${value}`, '`!` before a literal')
      }
    }
  }
  return pins
}

/** At most this many pins are spelled out in the answer's `next`; all of them are in `findings`. */
const PINS_SAID = 8

/**
 * What the rebuild answers the agent when it found pins: each one, and the order of work — fix them in
 * this turn, rebuild once more, then tell the customer.
 * @param {Pin[]} pins
 * @param {boolean} [worn] - false: the site wears no system and the pins are over the template's roles.
 */
export function pinsNext(pins, worn = true) {
  const said = pins
    .slice(0, PINS_SAID)
    .map((p) => `${p.at} \`${p.class}\` → \`${p.use}\``)
    .join('; ')
  const more = pins.length > PINS_SAID ? `; and ${pins.length - PINS_SAID} more in findings` : ''
  // a class that reads a role with no fallback, or the worn system's (`judgeRoleReads`), pins no literal
  const reads = pins.some((p) => /var\(\s*--ds-/i.test(p.class))
  return (
    `Built, but ${pins.length === 1 ? 'one class' : `${pins.length} classes`} written since the last build ` +
    (reads
      ? `will not follow ${worn ? "the next design system, or the template's own look once this one is taken off," : 'the template now, or a design system applied later,'} as written: ${said}${more}. `
      : worn
        ? `pin${pins.length === 1 ? 's' : ''} a value the design-system slot owns, so the next system will not reach ${pins.length === 1 ? 'it' : 'them'}: ${said}${more}. `
        : `pin${pins.length === 1 ? 's' : ''} a value of the template's design-system roles, so a design system applied later will not reach ${pins.length === 1 ? 'it' : 'them'}: ${said}${more}. `) +
    `Before you tell the customer anything, in this same turn: make each replacement${reads ? '' : ' (it looks the same today)'}, then ONE site.rebuild again.`
  )
}
