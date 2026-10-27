// joomla-layout.mjs — the T3 Framework page layout of a captured template (issue #67): what the
// adapter reads where a T4 template has `etc/layout/<name>.json`.
//
// A T3 template names its layouts in `etc/layout/<name>.ini` (one `[block]` per position, `position="…"`),
// and draws them in `tpls/<name>.php`: a list of `$this->loadBlock('<block>')` calls, each block a file
// `tpls/blocks/<block>.php` that draws its positions with `countModules('x')` / `_p('x')` /
// `<jdoc:include type="modules" name="x">`. The order the page draws its positions is the order of those
// literal calls — not the order of the INI file. Only these literal forms are read. Anything else
// (a computed block name, a position named by a variable, an include the file does not spell out) is
// listed in `gaps`, never guessed.
//
// Style settings: the template style's `mainlayout` param names the layout (`etc/layout/<mainlayout>.ini`),
// `skip_component_content` lists the menu item ids whose page the `mainbody` block returns from before
// it prints the component or its sidebars.
import { parseJsonColumn } from '../lib/joomla-inventory.mjs'
import { scanPhp } from './joomla-php-scan.mjs'
import { analyzeSkipGuard } from './joomla-php-tokens.mjs'
import { htmlStartTags } from './joomla-html-tags.mjs'

const NAME = /^[A-Za-z0-9_.-]+$/
const BLOCK_NAME = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/
const plain = (v) => typeof v === 'string' && NAME.test(v) && v !== '.' && v !== '..'
const plainBlock = (v) => typeof v === 'string' && BLOCK_NAME.test(v) && !v.split('/').some((s) => s === '.' || s === '..')
const GET_ITEMID = "JFactory::getApplication()->input->getInt('Itemid')"
const SKIP_LIST = "$this->getParam('skip_component_content')"
const SKIP_TERM = `in_array(${GET_ITEMID},${SKIP_LIST})`
const IS_ARRAY_TERM = `is_array(${SKIP_LIST})`
/** The stock T3 exemption of the template-settings screen: true on every page the adapter routes. */
const NOT_CONFIG_TERM = `JFactory::getApplication()->input->getString('option')!=="com_config"`
/** The one guard expression a JoomlArt template contains (Morgan/T3 `tpls/blocks/mainbody.php` lines 16–19, and the T3 fixture copy of it); whitespace outside string literals aside, anything else is unknown. */
const SKIP_EXPRESSIONS = new Set([`${IS_ARRAY_TERM}&&${SKIP_TERM}&&${NOT_CONFIG_TERM}`])

/** Nested loadBlock calls followed at most this deep; the blocks of a real template nest twice. */
const MAX_DEPTH = 4
/** An INI file has a few dozen sections; more than this is not a layout file. */
const MAX_INI_LINES = 4000
/** Blocks that are the site's chrome, not page content: their positions are the header / footer / off-canvas parts. */
const CHROME_BLOCK = /^(topbar|header|footer|off-canvas|offcanvas|mainnav|head|head-prepaint|spotlight|navhelper)(?:[-_/].*)?$/

/**
 * `etc/layout/<name>.ini` → `{ sections: [{ name, position, props }], problems }`. Comments (`;`,
 * `#`) and blank lines are skipped; a line that is neither a `[section]` nor `key="value"` is
 * reported as a problem, not read.
 */
export function parseLayoutIni(text) {
  const sections = []
  const problems = []
  const lines = String(text).split(/\r\n|\r|\n/)
  if (lines.length > MAX_INI_LINES) return { sections, problems: [`more than ${MAX_INI_LINES} lines; not read`] }
  let cur = null
  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) return
    const head = line.match(/^\[([^\]]+)\]$/)
    if (head) {
      cur = { name: head[1], position: null, props: {} }
      sections.push(cur)
      return
    }
    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S*))\s*$/)
    if (!kv || !cur) {
      problems.push(`line ${i + 1}: ${JSON.stringify(line.slice(0, 60))} is not a [section] or key="value"`)
      return
    }
    const value = kv[2] ?? kv[3] ?? kv[4] ?? ''
    cur.props[kv[1]] = value
    if (kv[1] === 'position') cur.position = value
  })
  return { sections, problems }
}

/**
 * The block names a T3 PHP file loads, in text order: `out` the whole literals (`loadBlock('x')`, args ignored),
 * each with its offset and whether it is written under a condition (`conditional`); `dynamic` any other argument
 * — a concatenation such as `'x'.$var` names a block only its variable knows, so it is never read as its literal prefix.
 * `scan` is scanPhp(): a load in a comment is not there.
 */
function loadedBlocks(scan) {
  const out = []
  const dynamic = []
  for (const m of scan.text.matchAll(/\$this->loadBlock\(\s*([^;]*?)\s*\)\s*(?:;|\?>)/g)) {
    if (scan.inString(m.index)) continue // text of a string is not executed
    const arg = m[1]
    const lit = arg.match(/^'([^'$]+)'\s*(?:,.*)?$/s) ?? arg.match(/^"([^"$]+)"\s*(?:,.*)?$/s)
    if (lit && plainBlock(lit[1])) out.push({ name: lit[1], index: m.index, conditional: scan.conditional(m.index) || scan.shortCircuited(m.index) })
    else dynamic.push(arg.slice(0, 60))
  }
  // Every other mention of loadBlock outside a string (a call without its terminator, through another receiver) is a load the pattern above did not read.
  let mentions = 0
  for (const m of scan.text.matchAll(/\bloadBlock\b/g)) if (!scan.inString(m.index)) mentions++
  for (let k = out.length + dynamic.length; k < mentions; k++) dynamic.push('<a loadBlock call the reader cannot parse>')
  return { out, dynamic }
}

/**
 * Every `<jdoc:include …>` tag of a text: `[{ index, body, unterminated }]`, taken from the shared tag walk — only a tag
 * named exactly `jdoc:include` at top level (not one quoted in an attribute or a comment). `other` lists the tags whose
 * name only begins with it (`jdoc:include-other`): a form the reader does not read.
 */
function includeTags(text) {
  const all = htmlStartTags(text, { php: true })
  return Object.assign(all.filter((t) => t.name === 'jdoc:include'), { other: all.filter((t) => t.name !== 'jdoc:include' && t.name.startsWith('jdoc:include')) })
}

/**
 * The `<jdoc:include type="component">` tags of a scanned file: `[{ index, conditional, error }]`. Attributes are read by
 * exact name (`type='component'` counts, `data-type="component"` does not). A tag the reader cannot parse is not one of
 * them; drawnPositions names it as a gap.
 */
const componentIncludes = (scan) => {
  const out = []
  for (const t of includeTags(scan.text)) {
    const parsed = t.unterminated ? { error: 'the tag is not closed' } : includeAttributes(t.body)
    // Parsed attributes only: a tag the reader cannot parse is reported by drawnPositions as a parse gap, never guessed to be the component.
    if (parsed.error) continue
    const type = parsed.map.get('type')
    // An include inside a PHP string is never printed: not a component event (drawnPositions reports it as a gap).
    if (type && type.value === 'component' && !type.dynamic && !scan.inString(t.index)) out.push({ index: t.index, error: null, conditional: scan.conditional(t.index) })
  }
  return out
}

/**
 * PHP the reader does not follow, found in the PHP spans of a scanned file (outside strings and comments): an include of
 * another file, `eval`, a layout/template render call, a variable function call. Such code may print the component or a
 * position, so a file that holds it never proves that something is absent. `[]` when none is there. Only these forms are
 * recognised; any other PHP call is not evaluated and is not claimed to print nothing — absence is proven only for the
 * constructs the reader lists, so the list is the contract (references/inputs/from-joomla.md).
 */
const UNSUPPORTED_PHP = /\b(?:include|include_once|require|require_once|eval|call_user_func|call_user_func_array)\b|\b(?:J?LayoutHelper)\s*::|->\s*(?:loadTemplate|getBuffer|render|renderLayout|loadModule|loadModules)\s*\(|\$\$|\$[A-Za-z_][A-Za-z0-9_]*\s*\(/g
function unsupportedPhp(scan) {
  const t = scan.text
  const found = []
  let i = 0
  for (;;) {
    const s = t.indexOf('<?', i)
    if (s < 0) break
    let e = s + 2
    for (;;) {
      const k = t.indexOf('?>', e)
      if (k < 0) {
        e = t.length
        break
      }
      e = k + 2
      if (!scan.inString(k)) break
    }
    for (const m of t.slice(s, e).matchAll(UNSUPPORTED_PHP)) if (!scan.inString(s + m.index)) found.push(m[0].replace(/\s+/g, ' ').slice(0, 30))
    i = e
  }
  return [...new Set(found)]
}

/**
 * What a T4 block markup file (`html/layouts/t4/block/<name>.html`) says about the page body: `{ components, causes }`.
 * `components` counts the `<jdoc:include type="component">` tags; `causes` names every construct the reader cannot
 * establish — PHP in the markup, a `<jdoc:include>` that is not closed, whose attributes are not parsed, that has no or
 * a computed type, or a tag that only begins with the name (`jdoc:include-other`). A block proves it draws no
 * component only when `components` is 0 and `causes` is empty.
 */
export function blockMarkupEvidence(text) {
  const causes = []
  let components = 0
  const src = String(text ?? '')
  if (/<\?/.test(src)) causes.push('PHP in the block markup is not evaluated')
  const tags = includeTags(src)
  for (const t of tags.other) causes.push(`a <${t.name}> tag is not a form the reader knows`)
  for (const t of tags) {
    const parsed = t.unterminated ? { error: 'the tag is not closed' } : includeAttributes(t.body)
    if (parsed.error) {
      causes.push(`a <jdoc:include> the reader cannot parse (${parsed.error})`)
      continue
    }
    const type = parsed.map.get('type')
    if (!type || type.dynamic || !type.value) causes.push('a <jdoc:include> without a literal type')
    else if (type.value === 'component') components++
  }
  return { components, causes: [...new Set(causes)] }
}

/** A control-structure head that only asks whether positions have modules: `($this->countModules('x'))`, joined by `||`/`&&`. Any other condition is not understood. */
const COUNT_CALL = String.raw`\$this->countModules\(\s*(['"])[A-Za-z0-9_.\s-]+\1\s*\)`
const GUARD = new RegExp(String.raw`^\(\s*${COUNT_CALL}(?:\s*(?:\|\||&&)\s*${COUNT_CALL})*\s*\)$`)
const understoodGuard = (head) => GUARD.test(head)

/**
 * Attributes of a `<jdoc:include …>` tag by exact name: `{ map: Map(name → { value, dynamic }) }`, or `{ error }`
 * for a form the reader does not parse (unquoted-free stray text, unterminated quote, repeated name). Values are
 * single- or double-quoted (a `<?php … ?>` inside one is kept whole and marked `dynamic` only when it is the type)
 * or bare; `data-type` is a different attribute from `type`.
 */
function includeAttributes(text) {
  const map = new Map()
  let i = 0
  const n = text.length
  const skipSpace = () => { while (i < n && /[\s/]/.test(text[i])) i++ }
  for (;;) {
    skipSpace()
    if (i >= n) break
    const nameStart = i
    while (i < n && !/[\s=/]/.test(text[i])) i++
    const name = text.slice(nameStart, i)
    if (!name || name.startsWith('<?')) return { error: 'PHP outside an attribute value' }
    skipSpace()
    let value = ''
    if (text[i] === '=') {
      i++
      skipSpace()
      const q = text[i]
      if (q === '"' || q === "'") {
        i++
        const start = i
        for (;;) {
          if (i >= n) return { error: `unterminated ${q} value of ${name}` }
          if (text.startsWith('<?php', i)) {
            const end = text.indexOf('?>', i)
            if (end < 0) return { error: `unterminated PHP in ${name}` }
            i = end + 2
            continue
          }
          if (text[i] === q) break
          i++
        }
        value = text.slice(start, i)
        i++
      } else {
        const start = i
        while (i < n && !/\s/.test(text[i])) i++
        value = text.slice(start, i)
      }
    }
    if (map.has(name)) return { error: `attribute ${name} is repeated` }
    map.set(name, { value, dynamic: value.includes('<?') })
  }
  return { map }
}

/**
 * Positions a block file draws, in the order it names them (literal forms only, comments excluded): `[{ name,
 * style, index }]`, `style` the module chrome of the `<jdoc:include type="modules" name=… style="…">` that draws it
 * (null: none named).
 */
function drawnPositions(scan, map, gaps, where, unk) {
  const seen = []
  const guarded = (name, index) => {
    if (scan.shortCircuited(index)) gaps.push(`${where}: position "${name}" is drawn in a statement with \`?\`, \`&&\`, \`||\`, \`and\` or \`or\` before it; whether it runs is not evaluated, it is read as drawn`)
    const heads = scan.conditions(index)
    if (heads.every(understoodGuard)) return
    gaps.push(`${where}: position "${name}" is drawn under a condition the reader does not evaluate (${heads.find((h) => !understoodGuard(h)).slice(0, 60)}); it is read as drawn`)
  }
  // `_p('x')` / `countModules('x')` name a layout section; the position the page draws is the INI's `position=` of that section.
  const note = (name, style, mapped, index) => {
    if (!name) return
    if (mapped) {
      const sec = map.get(name)
      if (!sec) {
        gaps.push(`${where}: position "${name}" has no [${name}] section in the layout INI; the position it draws is not known`)
        unk.positions(`${where}: [${name}] is not a section of the layout INI`)
        return
      }
      if (!sec.position) {
        gaps.push(`${where}: [${name}] has no position= in the layout INI; the position it draws is not known`)
        unk.positions(`${where}: [${name}] has no position= in the layout INI`)
        return
      }
      name = sec.position
    }
    const at = seen.find((x) => x.name === name)
    if (!at) seen.push({ name, style: style ?? null, index })
    else if (style && !at.style) at.style = style
  }
  // Only the tag that renders modules places a position. `countModules('x')` / `_c('x')` in a condition or a class
  // name asks about a position, it draws nothing: it never creates or moves one.
  const tags = includeTags(scan.text)
  for (const t of tags.other) gaps.push(`${where}: a <${t.name}> tag is not a form the reader knows; whether it draws modules or the component is not known, nothing is placed for it`)
  for (const t of tags.other) unk.both(`${where}: a <${t.name}> tag is not a form the reader knows`)
  for (const tag of tags) {
    const m = [null, tag.body]
    m.index = tag.index
    const parsedAttrs = tag.unterminated ? { error: 'the tag is not closed' } : includeAttributes(tag.body)
    if (parsedAttrs.error) {
      // Any <jdoc:include> the reader cannot parse might draw modules or the component: it is a gap, nothing is placed for it.
      gaps.push(`${where}: a <jdoc:include> with attributes the reader cannot parse (${parsedAttrs.error}) may draw modules or the component; nothing is placed for it`)
      unk.both(`${where}: a <jdoc:include> the reader cannot parse (${parsedAttrs.error})`)
      continue
    }
    const attrs = parsedAttrs.map
    if (!attrs.has('type')) {
      gaps.push(`${where}: a <jdoc:include> has no type; whether it draws modules or the component is not known, nothing is placed for it`)
      unk.both(`${where}: a <jdoc:include> has no type`)
      continue
    }
    const type = attrs.get('type')
    if (type.dynamic) {
      gaps.push(`${where}: a <jdoc:include> computes its type; whether it draws modules is not known, nothing is placed for it`)
      unk.both(`${where}: a <jdoc:include> computes its type`)
      continue
    }
    if (type.value === 'component' && scan.inString(m.index)) {
      gaps.push(`${where}: a <jdoc:include type="component"> is written inside a PHP string; it is not read as the component being drawn`)
      unk.both(`${where}: a <jdoc:include type="component"> is written inside a PHP string`)
      continue
    }
    if (type.value === 'module') {
      gaps.push(`${where}: a <jdoc:include type="module"> draws a module by name that is not read; nothing is placed for it`)
      unk.positions(`${where}: a <jdoc:include type="module"> draws a module by name that is not read`)
      continue
    }
    if (['component', 'head', 'message', 'metas', 'styles', 'scripts'].includes(type.value)) continue
    if (type.value !== 'modules') {
      gaps.push(`${where}: a <jdoc:include> has unknown type "${type.value}"; whether it draws modules or the component is not known, nothing is placed for it`)
      unk.both(`${where}: a <jdoc:include> has unknown type "${type.value}"`)
      continue
    }
    if (scan.inString(m.index)) {
      gaps.push(`${where}: a <jdoc:include type="modules"> is written inside a PHP string; the position it draws is not read`)
      unk.both(`${where}: a <jdoc:include type="modules"> is written inside a PHP string`)
      continue
    }
    const nameAttr = attrs.get('name')
    const nm = nameAttr && /^(?:<\?php\s+\$this->_p\(\s*['"]([A-Za-z0-9_.-]+)['"]\s*\)\s*\?>|([A-Za-z0-9_.-]+))$/.exec(nameAttr.value)
    if (!nm) {
      gaps.push(`${where}: a <jdoc:include type="modules"> names its position by a form the reader does not read (${m[1].replace(/\s+/g, ' ').trim().slice(0, 80)}); nothing is placed for it`)
      unk.positions(`${where}: a <jdoc:include type="modules"> names its position by an unread form`)
      continue
    }
    const style = attrs.get('style')
    guarded(nm[1] ?? nm[2], m.index)
    note(nm[1] ?? nm[2], style && /^[A-Za-z0-9_.-]+$/.test(style.value) ? style.value : null, Boolean(nm[1]), m.index)
  }
  return seen
}

/** The tail of the gap a fully read mainbody records when it draws no component: a finding about the layout, not unread evidence. */
const NO_BODY_TAIL = ': this layout does not print the page body'

/**
 * The T3 layout `name` of a capture reader: `null` when `etc/layout/<name>.ini` is not captured (the
 * template is not T3 or the layout is missing), else
 * `{ name, ini, php, order, positions, undrawn, sidebars, chrome, skipRule, gaps }`:
 *  - `order`: `{ kind: 'position', name, block, chrome?, sidebar? }` and `{ kind: 'component', sidebars }`
 *    entries in the order the page draws them;
 *  - `positions`: the INI's positions in file order;
 *  - `undrawn`: INI positions no literal block draws;
 *  - `sidebars`: the positions of the sections the mainbody names as its sidebars (INI `position=`);
 *  - `skipRule`: whether the mainbody block honours `skip_component_content`;
 *  - `body`: `{ state, causes }` — 'present' (a component include was read), 'absent' (every file the page draws was read in
 *    full, with only forms the reader supports, and none draws the component) or 'unknown'; `causes` the constructs that
 *    leave it open (an unread or computed block, a heredoc, an include or other PHP the reader does not follow, a
 *    `<jdoc:include>` it cannot parse). 'present' with causes: the include is conditional or an unsupported guard may
 *    precede it. Gaps that describe a finding (the page prints no body) are never causes;
 *  - `positionsComplete` / `positionCauses`: every position the page draws was read, so one missing from `order` is
 *    proven undrawn; else what was not read;
 *  - `gaps`: what could not be read (missing php, computed block names, a block file not captured, a form
 *    written under a condition the reader does not evaluate).
 * Only forms a scan can establish are read: the text of comments is not, and a component include or a block load
 * written under a condition (or after `?`, `&&`, `||`, `and`, `or`) is a gap, never proof that it runs.
 */
export function readT3Layout(reader, name) {
  if (!plain(String(name))) return null
  const ini = reader.read(`etc/layout/${name}.ini`)
  if (!ini) return null
  const parsed = parseLayoutIni(ini.text)
  const gaps = parsed.problems.map((p) => `${ini.path}: ${p}`)
  const positions = parsed.sections.map((s) => s.position).filter(Boolean)
  const result = { name: String(name), ini: ini.path, php: null, order: [], positions, undrawn: [], sidebars: [], chrome: [], skipRule: false, body: { state: 'unknown', causes: [] }, positionsComplete: false, positionCauses: [], gaps }
  const bodyCauses = [] // what leaves open whether the page draws the component at all
  const guardCauses = [] // the component is read, but may not run: a condition around it, or a return guard the reader does not support
  const positionCauses = []
  const unk = {
    body: (m) => bodyCauses.push(m),
    positions: (m) => positionCauses.push(m),
    both: (m) => {
      bodyCauses.push(m)
      positionCauses.push(m)
    }
  }
  for (const p of parsed.problems) unk.positions(`${ini.path}: ${p}`)
  const php = reader.read(`tpls/${name}.php`) ?? reader.read('tpls/default.php')
  if (!php) {
    gaps.push(`tpls/${name}.php and tpls/default.php are not captured: the order the page draws its positions is not known`)
    unk.both(`tpls/${name}.php and tpls/default.php are not captured`)
    result.undrawn = [...positions]
    result.body = { state: 'unknown', causes: [...new Set(bodyCauses)] }
    result.positionCauses = [...new Set(positionCauses)]
    return result
  }
  result.php = php.path
  const seenBlocks = new Set()
  const drawn = new Set()
  const map = new Map(parsed.sections.map((x) => [x.name, x]))
  let mainbodyRead = false
  let mainComponents = 0
  const scanned = (file, where) => {
    const s = scanPhp(file.text)
    if (s.unscanned) {
      gaps.push(`${where}: a heredoc/nowdoc is not followed; nothing after it in the file is taken as executed`)
      unk.both(`${where}: a heredoc/nowdoc is not followed`)
    }
    const unsupported = unsupportedPhp(s)
    if (unsupported.length) {
      gaps.push(`${where}: PHP the reader does not follow (${unsupported.join(', ')}); what it prints is not known`)
      unk.both(`${where}: PHP the reader does not follow (${unsupported.join(', ')})`)
    }
    return s
  }
  const underCondition = (block, where) => gaps.push(`${where}: loadBlock('${block}') is written under a condition the reader does not evaluate; its content is read as if it ran`)
  /**
   * The mainbody block and the blocks it loads, expanded in text order: `{ events, texts }`, events being
   * `{ kind: 'position', name, style }`, `{ kind: 'component', conditional }` and `{ kind: 'unread' }` (a block
   * that could not be followed); `texts` the scanned files, for the sidebar names.
   */
  const expandMain = (scan, where, depth, visited, into) => {
    into.texts.push(scan)
    const { out, dynamic } = loadedBlocks(scan)
    const items = [
      ...drawnPositions(scan, map, gaps, where, unk).map((p) => ({ index: p.index, ev: { kind: 'position', name: p.name, style: p.style, block: where } })),
      ...componentIncludes(scan).map((c) => ({ index: c.index, ev: { kind: 'component', conditional: c.conditional, error: c.error } })),
      ...out.map((b) => ({ index: b.index, load: b })),
      ...dynamic.map((d) => ({ index: Infinity, dynamic: d }))
    ].sort((a, b) => a.index - b.index)
    for (const it of items) {
      if (it.ev) {
        into.events.push(it.ev)
        continue
      }
      if (it.dynamic !== undefined) {
        into.events.push({ kind: 'unread' })
        gaps.push(`${where}: loadBlock(${it.dynamic}) is not a literal block name; whether it draws the component or a position is not known`)
        unk.both(`${where}: loadBlock(${it.dynamic}) is not a literal block name`)
        continue
      }
      const b = it.load
      if (b.conditional) underCondition(b.name, where)
      if (visited.has(b.name)) {
        gaps.push(`tpls/blocks/${b.name}.php is loaded more than once (by ${where}); which load runs is not evaluated, it is read once, where it is first loaded`)
        continue
      }
      visited.add(b.name)
      const f = reader.read(`tpls/blocks/${b.name}.php`)
      if (!f || depth >= MAX_DEPTH) {
        into.events.push({ kind: 'unread' })
        unk.both(f ? `tpls/blocks/${b.name}.php: blocks nested deeper than ${MAX_DEPTH} are not read` : `tpls/blocks/${b.name}.php is not captured`)
        gaps.push(f ? `tpls/blocks/${b.name}.php: blocks nested deeper than ${MAX_DEPTH} are not read` : `tpls/blocks/${b.name}.php is not captured (loaded by ${where}): whether it draws the component or a position is not known`)
        continue
      }
      expandMain(scanned(f, `tpls/blocks/${b.name}.php`), `tpls/blocks/${b.name}.php`, depth + 1, visited, into)
    }
  }
  const mainbody = (file, block) => {
    mainbodyRead = true
    const where = 'tpls/blocks/mainbody.php'
    const main = scanned(file, where)
    // Only the exact guard, as the sole `return` of the file's PHP tokens, is a skip rule. Any other `return` (a second guard, a bare one, one in a nested block or after `?>`), an unreadable file, or a mention of the parameter is an unknown guard: the body is kept, a gap names it.
    const guard = analyzeSkipGuard(file.text, (expr) => SKIP_EXPRESSIONS.has(expr))
    result.skipRule = guard.skip
    if (!result.skipRule && (/skip_component_content/.test(main.text) || guard.hasReturn || guard.failed)) gaps.push(`${where} has a return guard or mentions skip_component_content that is not the supported \`if (is_array(getParam('skip_component_content')) && in_array(Itemid, getParam('skip_component_content')) && option !== "com_config") return;\` guard; no route is treated as skipping its page and the component body is kept`)
    if (!result.skipRule && (/skip_component_content/.test(main.text) || guard.hasReturn || guard.failed)) guardCauses.push(`${where} has a return guard the reader does not support`)
    const into = { events: [], texts: [] }
    expandMain(main, where, 0, new Set([block]), into)
    // A sidebar is named by its INI section (`'sidebar-1'`); the position it draws is that section's `position=`.
    const sidebars = []
    for (const t of into.texts)
      for (const m of t.text.matchAll(/['"](sidebar-[A-Za-z0-9]+)['"]/g)) {
        const sec = map.get(m[1])
        if (!sec?.position) {
          gaps.push(`${where}: sidebar "${m[1]}" has ${sec ? 'no position= in' : 'no [' + m[1] + '] section in'} the layout INI; the position it draws is not known`)
          unk.positions(`${where}: sidebar "${m[1]}" has no known position in the layout INI`)
        }
        else if (!sidebars.includes(sec.position)) sidebars.push(sec.position)
      }
    result.sidebars = sidebars
    for (const s of sidebars) drawn.add(s)
    const comps = into.events.filter((e) => e.kind === 'component')
    const unread = into.events.some((e) => e.kind === 'unread')
    const proven = comps.some((c) => !c.conditional)
    for (const c of comps) if (c.error) gaps.push(`${where}: a <jdoc:include type="component"> the reader cannot parse (${c.error}); the component is assumed to be drawn there`)
    if (comps.length > 1) gaps.push(`${where}: the component is included ${comps.length} times; it is placed once, at the first include`)
    if (!proven && comps.length) gaps.push(`${where}: <jdoc:include type="component"> is written under a condition the reader does not evaluate; the component is assumed to be drawn`)
    if (!proven && !comps.length && unread) gaps.push(`${where}: no <jdoc:include type="component"> was read and a block it loads could not be followed; the component is assumed to be drawn there`)
    if (comps.length && !proven) guardCauses.push(`${where}: <jdoc:include type="component"> is written under a condition the reader does not evaluate`)
    mainComponents = comps.length
    const drawsComponent = comps.length > 0 || unread
    let placedComponent = false
    for (const e of into.events) {
      if (e.kind === 'position') {
        if (drawn.has(e.name)) continue
        drawn.add(e.name)
        result.order.push({ kind: 'position', name: e.name, block: 'mainbody', style: e.style })
      } else if (e.kind === 'component' && !placedComponent) {
        placedComponent = true
        result.order.push({ kind: 'component', sidebars, ...(proven ? {} : { assumed: true }) })
      }
    }
    if (drawsComponent && !placedComponent) result.order.push({ kind: 'component', sidebars, assumed: true })
  }
  const walk = (scan, where, depth) => {
    const { out, dynamic } = loadedBlocks(scan)
    for (const d of dynamic) {
      gaps.push(`${where}: loadBlock(${d}) is not a literal block name; its positions are not read`)
      unk.both(`${where}: loadBlock(${d}) is not a literal block name`)
    }
    for (const { name: block, conditional } of out) loadOne(block, conditional, where, depth)
  }
  /** One block the page loads: its positions and the blocks it loads, placed in the order its text names them. */
  const loadOne = (block, conditional, where, depth) => {
    if (seenBlocks.has(block)) {
      gaps.push(`tpls/blocks/${block}.php is loaded more than once (by ${where}); which load runs is not evaluated, its positions are placed once, where it is first loaded`)
      return
    }
    seenBlocks.add(block)
    const file = reader.read(`tpls/blocks/${block}.php`)
    if (!file) {
      gaps.push(`tpls/blocks/${block}.php is not captured (loaded by ${where}): its positions are not known`)
      unk.both(`tpls/blocks/${block}.php is not captured`)
      return
    }
    if (conditional) underCondition(block, where)
    if (block === 'mainbody') {
      mainbody(file, block)
      return
    }
    const chrome = CHROME_BLOCK.test(block)
    const here = `tpls/blocks/${block}.php`
    const blockScan = scanned(file, here)
    const nested = loadedBlocks(blockScan)
    for (const d of nested.dynamic) {
      gaps.push(`${here}: loadBlock(${d}) is not a literal block name; its positions are not read`)
      unk.both(`${here}: loadBlock(${d}) is not a literal block name`)
    }
    const items = [
      ...drawnPositions(blockScan, map, gaps, here, unk).map((p) => ({ index: p.index, pos: p })),
      ...nested.out.map((b) => ({ index: b.index, load: b }))
    ].sort((a, b) => a.index - b.index)
    for (const it of items) {
      if (it.load) {
        if (depth < MAX_DEPTH) loadOne(it.load.name, it.load.conditional, here, depth + 1)
        else {
          gaps.push(`${here}: blocks nested deeper than ${MAX_DEPTH} are not read`)
          unk.both(`${here}: blocks nested deeper than ${MAX_DEPTH} are not read`)
        }
        continue
      }
      const { name: p, style } = it.pos
      if (drawn.has(p)) continue
      drawn.add(p)
      result.order.push({ kind: 'position', name: p, block, style, ...(chrome ? { chrome: true } : {}) })
      if (chrome) result.chrome.push(p)
    }
  }
  walk(scanned(php, php.path), php.path, 0)
  result.undrawn = positions.filter((p) => !drawn.has(p))
  // The page body: a component include read is present; otherwise absent only when nothing the reader could not follow
  // might draw it. An unknown body is kept in the order as an assumed component row (the body is not dropped on a guess).
  const unique = (l) => [...new Set(l)]
  const state = mainComponents > 0 ? 'present' : bodyCauses.length ? 'unknown' : 'absent'
  result.body = { state, causes: unique(state === 'present' ? guardCauses : bodyCauses) }
  if (state === 'unknown' && !result.order.some((o) => o.kind === 'component')) {
    result.order.push({ kind: 'component', sidebars: [], assumed: true })
    gaps.push(mainbodyRead ? 'the mainbody block draws no component the reader can read, but something it could not follow might; the component is assumed to be drawn after the positions read' : 'no mainbody block was read; the component is assumed to be drawn after the positions read')
  }
  if (state === 'absent' && mainbodyRead) gaps.push(`tpls/blocks/mainbody.php draws no <jdoc:include type="component">${NO_BODY_TAIL}`)
  result.positionCauses = unique(positionCauses)
  result.positionsComplete = result.positionCauses.length === 0
  result.gaps = unique(gaps)
  return result
}

/**
 * The T3 settings of a template's styles: `Map<styleId, { mainlayout, skip, skipInvalid?, sublayout }>` for
 * every site style of `templateName` whose params carry `mainlayout`. `skip` is the set of menu item
 * ids of `skip_component_content`; a value that is not a list of ids is `skipInvalid`, never guessed.
 */
export function t3StyleSettings(inv, templateName) {
  const out = new Map()
  for (const s of inv.template_styles ?? []) {
    if (Number(s.client_id) !== 0 || s.template !== templateName) continue
    const p = parseJsonColumn(s.params)
    if (typeof p.mainlayout !== 'string' || !p.mainlayout.trim()) continue
    const raw = p.skip_component_content
    const list = Array.isArray(raw) ? raw : raw == null || raw === '' ? [] : null
    const ids = list && list.every((v) => /^\d+$/.test(String(v)))
    out.set(String(s.id), {
      home: String(s.home) === '1',
      mainlayout: p.mainlayout.trim(),
      sublayout: typeof p.sublayout === 'string' ? p.sublayout.trim() : '',
      skip: new Set(ids ? list.map(String) : []),
      ...(ids ? {} : { skipInvalid: JSON.stringify(raw).slice(0, 80) })
    })
  }
  return out
}

/**
 * The style a menu item renders with: its own `template_style_id`, or the site's default style
 * (`home = 1`) when that is 0 or names no site style of the template.
 */
export function styleOfItem(settings, templateStyleId) {
  const own = settings.get(String(templateStyleId ?? '0'))
  if (own) return { id: String(templateStyleId), ...own }
  for (const [id, s] of settings) if (s.home) return { id, ...s }
  return null
}
