/**
 * A design system's own fixture (`vendor/tracy/od-design-system/systems/<id>/components.html`) as a page
 * a CMS theme can carry: its style blocks scoped under one wrapper class, its body as a snippet.
 *
 * WHY. The preview dialog's Home chip IS this document — the system's markup and CSS with the
 * customer's words poured in (fixture.ts in the design-inspiration plugin). A site built from the
 * choice must render the same pixels, so the theme ships the fixture's CSS verbatim, only fenced
 * so it cannot leak into the template's chrome, and the seeder writes the fixture's body.
 *
 * The fence is CSS nesting: the whole sheet becomes `.tracy-fixture { … }`, which prefixes every
 * selector with the wrapper. `html`, `body` and `:root` rules become the wrapper itself (`&`), so
 * the document-level background, font and custom properties land on the wrapper. At-rules that
 * cannot live inside a rule (`@font-face`, `@import`, `@keyframes`, `@property`) are hoisted out.
 *
 * The other direction — the template's element styles bleeding INTO the fixture — is handled by
 * the page kind, not by this sheet: a fixture page loads no template stylesheet and, on
 * WordPress, no block-library or global-styles sheet either, only `fixture-page.css` (body margin,
 * hidden chrome). An `all: revert` fence was tried first and rejected: it also reverts SVG
 * presentation attributes (`fill`, `stroke`), which are author-origin, so icons lost their colour.
 */

export const WRAPPER = '.tracy-fixture'

const HOISTED = /^@(font-face|import|keyframes|-webkit-keyframes|property|charset|layer)\b/

/**
 * Top-level blocks of a stylesheet: `{ head, body }` per rule or at-rule, braces balanced.
 * Comments are stripped first; strings are not parsed (the fixtures carry none with braces).
 * @param {string} css
 * @returns {{ head: string, body: string | null }[]}
 */
export function topLevelBlocks(css) {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks = []
  let i = 0
  while (i < code.length) {
    const open = code.indexOf('{', i)
    if (open < 0) {
      const tail = code.slice(i).trim()
      if (tail) blocks.push({ head: tail.replace(/;$/, ''), body: null })
      break
    }
    // A statement at-rule (`@import …;`) ends at a semicolon before any brace.
    const semi = code.indexOf(';', i)
    const headRaw = code.slice(i, open)
    if (
      semi >= 0 &&
      semi < open &&
      headRaw.trimStart().startsWith('@') &&
      !headRaw.slice(0, semi - i).includes('{')
    ) {
      blocks.push({ head: code.slice(i, semi).trim(), body: null })
      i = semi + 1
      continue
    }
    let depth = 1
    let j = open + 1
    while (j < code.length && depth > 0) {
      if (code[j] === '{') depth += 1
      else if (code[j] === '}') depth -= 1
      j += 1
    }
    blocks.push({ head: headRaw.trim(), body: code.slice(open + 1, j - 1) })
    i = j
  }
  return blocks
}

/**
 * `html`, `body` and `:root` as whole selectors → the wrapper itself.
 * @param {string} selector
 */
function retarget(selector) {
  const parts = selector.split(',').map((s) => {
    const t = s.trim()
    if (t === 'html' || t === 'body' || t === ':root' || t === 'html body') return '&'
    return t.replace(/^(html|body|:root)(?=[\s.>#[:])/, '&').replace(/^&\s+body(?=[\s.>#[:]|$)/, '&')
  })
  return [...new Set(parts)].join(', ')
}

/**
 * The fixture's stylesheet fenced under the wrapper.
 * @param {string} css - the concatenated `<style>` blocks of components.html
 * @param {string} [wrapper]
 */
export function scopeFixtureCss(css, wrapper = WRAPPER) {
  const hoisted = []
  const kept = []
  for (const block of topLevelBlocks(css)) {
    if (HOISTED.test(block.head)) {
      hoisted.push(block.body === null ? `${block.head};` : `${block.head} {${block.body}}`)
      continue
    }
    if (block.body === null) continue
    if (block.head.startsWith('@')) {
      // @media / @supports: the rules inside are retargeted the same way and nest as-is.
      const inner = topLevelBlocks(block.body)
        .filter((b) => b.body !== null)
        .map((b) => `  ${retarget(b.head)} {${b.body}}`)
        .join('\n')
      kept.push(`${block.head} {\n${inner}\n}`)
      continue
    }
    kept.push(`${retarget(block.head)} {${block.body}}`)
  }
  return `${hoisted.join('\n')}${hoisted.length ? '\n' : ''}${wrapper} {\n${kept.join('\n')}\n}\n`
}

/**
 * The parts of a fixture document a theme needs.
 * @param {string} html - components.html
 * @returns {{ css: string, body: string, scripts: number }}
 */
export function fixtureParts(html) {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n')
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)
  if (!bodyMatch) throw new Error('fixture has no <body>')
  const scripts = (bodyMatch[1].match(/<script\b/gi) ?? []).length
  const body = bodyMatch[1].replace(/<script\b[\s\S]*?<\/script>/gi, '').trim()
  return { css, body, scripts }
}

/**
 * The fixture's body as the theme renders it: inside the wrapper, tagged with the system id.
 * @param {string} html - components.html
 * @param {string} id
 */
export function fixtureSnippet(html, id) {
  const { body } = fixtureParts(html)
  return `<div class="tracy-fixture" data-inspiration="${id}">\n${body}\n</div>\n`
}

/**
 * An artifact's body as the theme renders it: inside the wrapper, tagged with system and kind.
 * Here rather than in artifacts.mjs so a host that builds the artifacts itself (the design
 * inspiration plugin, the seeder) can wrap them without pulling the engine in through this library.
 * @param {string} html - the artifact document
 * @param {string} id
 * @param {string} kind
 */
export function artifactSnippet(html, id, kind) {
  const { body } = fixtureParts(html)
  return `<div class="tracy-artifact" data-inspiration="${id}" data-artifact="${kind}">\n${body}\n</div>\n`
}
