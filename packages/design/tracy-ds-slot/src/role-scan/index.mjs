/**
 * The packaging-time role scan of one template folder (roadmap step 4, 15/10/2026): read every
 * shipped stylesheet and component, analyse the template's own palette, sort every hard-coded visual
 * value into auto / flag / keep (`classify.mjs`), and — on request — rewrite the auto ones in place to
 * read their role variable with the template's own value as the fallback.
 *
 *   scanTemplate(root)            → findings + what the report needs (`report.mjs`)
 *   applyAutoConverts(root, scan) → the files rewritten, every auto finding replaced, end to start
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classify } from './classify.mjs'
import { collectFile } from './collect.mjs'
import { templateFiles, templateMeta } from './files.mjs'
import { lineIndex } from './css-lexer.mjs'
import { missingRadius } from './missing-radius.mjs'
import { readTailwindConfig } from './tailwind-config.mjs'
import { templateFaces } from './fonts.mjs'
import { chromaOf, SATURATED } from '../auto-palette.mjs'
import { colourRoleOfName, isComponentVar, roleOrNull } from './hints.mjs'
import { accentClusters, pageGrounds, templateVarRoles } from './palette.mjs'
import { rootGrounds } from './page-ground.mjs'
import { keepMarkerAt, markerIn } from './keep-marker.mjs'
import { groundPairing } from './ground-pairing.mjs'
import { parseColour } from './literals.mjs'
import { compiledTwins, functionInputs } from './sass.mjs'
import { generatedOutside } from './generated.mjs'
import { tailwindMajor } from './tailwind.mjs'
import { twinSync, withSync } from './twin-sync.mjs'

export { applyAutoConverts } from './apply.mjs'

const NEUTRAL =
  /^--ds-c-(bg|surface|surface-warm|surface-hover|fg|fg-2|heading|muted|meta|border|border-soft|ink|on-ink)$/

/**
 * @param {string} root
 * @param {{ include?: string[] }} [opts]
 */
export function scanTemplate(root, opts = {}) {
  const meta = templateMeta(root)
  // a Tailwind 3 theme lives in its config, not in CSS: read statically, never run
  const config = tailwindMajor(meta.pkg) < 4 ? readTailwindConfig(root) : null
  const twMajor = tailwindMajor(meta.pkg) || (config ? 3 : 0)
  const twConfig = config && { colours: config.colours, radius: config.radius }
  const { files, skipped } = templateFiles(root, opts)
  const per = files.map((f) => {
    const text = readFileSync(f.path, 'utf8')
    return { file: f, text, ...collectFile(f, text, { twConfig }) }
  })
  const all = (k) => per.flatMap((p) => p[k])
  const lines = new Map(per.map((p) => [p.file.rel, lineIndex(p.text)]))
  const raw = [...all('raw'), ...missingRadius(per, (rel) => lines.get(rel))]
  const defs = [...all('defs'), ...configDefs(twConfig)]
  const aliasOf = new Map(all('aliases'))
  const uses = [...all('uses'), ...all('themeUses')]
  const fills = [...raw, ...all('wrapped')].filter(
    (r) => r.kind === 'fill' && r.hex && r.alpha >= 0.9 && r.source === 'css'
  )
  const named = defs.map((d) => ({ ...d, role: d.dsRole ?? colourRoleOfName(d.name, 0.5, null, d.hex) }))
  const defHex = new Map(defs.map((d) => [d.name, d.hex]))
  const resolveHex = (name, seen = 0) =>
    defHex.get(name) ?? (seen < 8 && aliasOf.has(name) ? resolveHex(aliasOf.get(name), seen + 1) : null)
  const fillUses = uses
    .filter((u) => u.kind === 'fill')
    .map((u) => ({ hex: resolveHex(u.name) }))
    .filter((x) => x.hex)
  const grounds = {
    ...pageGrounds(named, fills, rootGrounds(all('decls'))),
    accents: accentClusters([...fills, ...fillUses])
  }
  // pairing first needs the variables' roles, and their votes need pairing: one pass without pairs
  let varRoles = templateVarRoles(defs, uses, aliasOf, grounds)
  const roleOfVar = (name, seen = new Set()) => {
    if (!name || seen.has(name)) return null
    seen.add(name)
    if (name.startsWith('--ds-')) return roleOrNull(name)
    // a component's variable holds one colour per component: no single role to read through it
    if (isComponentVar(name)) return null
    const own = varRoles.get(name)?.role ?? colourRoleOfName(name, 0.5)
    return own ?? roleOfVar(aliasOf.get(name), seen)
  }
  const { pairOf, declsByRule } = groundPairing({ root, per, aliasOf, roleOfVar, resolveHex, grounds })
  const known = (p) => (p && !/^[?~]/.test(p) ? p : null)
  for (const u of uses)
    if (u.kind === 'text')
      u.pair = known(
        u.rule
          ? pairOf({ rule: u.rule, scheme: u.scheme })
          : u.classString
            ? pairOf({ classString: u.classString, scheme: u.scheme })
            : null
      )
  varRoles = templateVarRoles(defs, uses, aliasOf, grounds)
  const exact = new Map()
  for (const d of defs) {
    const role = roleOfVar(d.name)
    // colour equality spreads a role only when the role fits the colour: a neutral role never
    // spreads to a saturated colour (a lime chip read as `surface` must not repaint every lime fill)
    if (role && d.alpha >= 0.9 && (!NEUTRAL.test(role) || chromaOf(d.hex) < SATURATED))
      exact.set(d.hex, [...(exact.get(d.hex) ?? []), { role, scheme: d.scheme }])
  }
  const fontRaw = [...raw, ...all('wrapped')].filter((r) => r.valueType === 'font')
  const fontDefs = new Map(fontRaw.filter((r) => r.name).map((r) => [r.name, r.text]))
  const faces = templateFaces(fontRaw, fontDefs)
  const preInputs = new Set(
    per
      .filter((p) => p.file.kind === 'scss' || p.file.kind === 'less')
      .flatMap((p) => [...functionInputs(p.text)])
  )
  const siblings = (rule) => declsByRule.get(rule) ?? []
  // every variable name a file reads (`var(--x`, a Tailwind class, a theme.json preset, a block's
  // `has-<slug>-color` class): a variable no file reads paints nothing
  const read = new Set(uses.map((u) => u.name))
  for (const p of per) {
    for (const m of p.text.matchAll(/var\(\s*(--[\w-]+)/g)) read.add(m[1])
    for (const m of p.text.matchAll(/has-([\w-]+?)-(?:background-)?color\b/g))
      read.add(`--wp--preset--color--${m[1]}`)
  }
  const ctx = {
    grounds,
    varRoles,
    roleOfVar,
    exact,
    pairOf,
    twMajor,
    twConfig,
    faces,
    fontDefs,
    preInputs,
    siblings,
    isRead: (name) => read.has(name)
  }
  // a compiled stylesheet whose Sass/LESS source is scanned too: a finding the source carries is
  // reported once, at the source; one only the compiled CSS carries is counted as out of sync
  const twins = compiledTwins(root, files)
  const twinOf = twinSync({ root, per, raw, twins })
  const outside = new Map(per.map((p) => [p.file.rel, generatedOutside(root, p, twins, files)]))
  const syncOf = (r) => {
    const o = outside.get(r.file)
    return typeof o === 'string' ? { external: o } : (o ?? twinOf(r))
  }
  const textOf = new Map(per.map((p) => [p.file.rel, p.text]))
  const findings = raw
    .map((r) => ({ ...r, ...withSync(manualKeep(r, classify(r, ctx), textOf.get(r.file) ?? ''), syncOf(r)) }))
    .sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start)
  findings.push(...unmappedFrameworkVars(findings, per))
  return {
    meta: {
      template: meta.template,
      platform: meta.platform,
      version: meta.version,
      tailwind: twMajor || null,
      ...(config ? { tailwindConfig: config.file } : {})
    },
    files: files.map((f) => f.rel),
    skipped,
    grounds,
    declared: [...new Set(all('declared'))].sort(),
    notUsed: notUsedOf(root, per),
    findings
  }
}

/** A `ds-keep: <reason>` marker (`keep-marker.mjs`) overrides the sort; one without a reason keeps nothing. */
function manualKeep(r, sorted, text) {
  // theme.json: one line may hold many values (a whole `css` string): only a marker inside the value
  // itself counts (`"0 12px 32px rgba(…) /* ds-keep: shadow depth */"`, roleReads `{ keep }`)
  const reason =
    r.lang === 'theme-json'
      ? (markerIn(r.value) ?? markerIn(text.slice(r.end, r.end + 300).split(/[;}"]/)[0]))
      : keepMarkerAt(text, r.start, r.source === 'css' && !!r.rule)
  if (reason === null) return sorted
  if (reason) return { class: 'keep', role: null, reason: `manual keep (ds-keep): ${reason}` }
  if (sorted.class !== 'auto') return sorted
  return {
    class: 'flag',
    role: null,
    candidates: [sorted.role],
    reason: `a ds-keep marker without a reason (VARS-1 needs one) (best guess ${sorted.role})`
  }
}

/** A Tailwind 3 config's literal colours as the template's colour variables, for the palette. */
function configDefs(twConfig) {
  const out = []
  for (const [name, value] of twConfig?.colours ?? []) {
    const c = parseColour(value)
    if (c) out.push({ name: `--color-${name}`, hex: c.hex, alpha: c.alpha, scheme: 'light' })
  }
  return out
}

/**
 * The framework's root variables (`--bs-primary`, `--t4-body-bg`: a colour, corner or face the
 * framework's compiled CSS defines and reads) that the template's own stylesheets never map to a role:
 * the framework-origin lines follow a system only through them. One finding per variable, at its
 * framework definition.
 */
function unmappedFrameworkVars(findings, per) {
  // a variable reads a role when one of its declarations reads `--ds-*`, directly or through another
  // variable that does (`--t4-success: var(--tb-success)`, `--tb-success: var(--ds-c-success, …)`)
  const valuesOf = new Map()
  for (const p of per)
    for (const d of p.decls)
      if (d.prop.startsWith('--')) valuesOf.set(d.prop, [...(valuesOf.get(d.prop) ?? []), d.value])
  const own = new Set()
  for (let grew = true; grew; ) {
    grew = false
    for (const [name, values] of valuesOf)
      if (
        !own.has(name) &&
        values.some(
          (v) => /var\(\s*--ds-/.test(v) || [...v.matchAll(/var\(\s*(--[\w-]+)/g)].some((m) => own.has(m[1]))
        )
      ) {
        own.add(name)
        grew = true
      }
  }
  const read = new Set()
  for (const p of per) for (const m of p.text.matchAll(/var\(\s*(--[\w-]+)/g)) read.add(m[1])
  const out = []
  const seen = new Set()
  for (const f of findings) {
    if (!f.framework || !f.name || !/^--(bs|t4)-/.test(f.name) || seen.has(f.name)) continue
    // a ROOT variable (`:root`, `[data-bs-theme]`, html, body); a component's own variable (`.btn`'s
    // --t4-btn-bg) follows the root ones it is built from; depth, gradients and the code face are no role
    if (
      !/^(:root|html|body|\[data-bs-theme[^\]]*\]|:root\[[^\]]*\]|html\[[^\]]*\])(\s*,\s*(:root|html|body|\[data-bs-theme[^\]]*\]|:root\[[^\]]*\]|html\[[^\]]*\]))*$/.test(
        (f.selector ?? '').trim()
      )
    )
      continue
    if (/shadow|gradient|mono|code/.test(f.name)) continue
    if (own.has(f.name) || !read.has(f.name)) continue
    seen.add(f.name)
    out.push({
      ...f,
      class: 'flag',
      candidates: [],
      reason: `framework variable ${f.name} (${f.valueType}) is read by the framework's compiled CSS and the template never maps it to a role: set it in the template's own stylesheet as var(--ds-…, its value)`,
      framework: undefined
    })
  }
  return out
}

/**
 * The roles a template declares it has no honest place for: `/* ds-not-used: --ds-c-ink, --ds-c-on-ink —
 * <reason> *\/` in one of its stylesheets, or `roleReads.notUsed` (`{ "--ds-c-ink": "<reason>" }`) in
 * a WordPress theme's theme.config.json. A declaration without a reason declares nothing.
 * @returns {{ name: string, reason: string, file: string }[]}
 */
function notUsedOf(root, per) {
  const out = []
  for (const p of per)
    for (const m of p.text.matchAll(
      /ds-not-used:\s*((?:--ds-[\w-]+\s*,?\s*)+)(?:[—–:-]+\s*)?([^*]*?)\s*\*\//g
    )) {
      const reason = m[2].trim()
      if (reason) for (const name of m[1].match(/--ds-[\w-]+/g)) out.push({ name, reason, file: p.file.rel })
    }
  try {
    const cfg = JSON.parse(readFileSync(join(root, 'theme.config.json'), 'utf8'))
    for (const [name, reason] of Object.entries(cfg?.roleReads?.notUsed ?? {}))
      if (typeof reason === 'string' && reason.trim())
        out.push({ name, reason: reason.trim(), file: 'theme.config.json' })
  } catch {}
  return out
}
