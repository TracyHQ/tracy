/**
 * Where a text names an SVG picture (rule PIC-1, read by `icon-pictures.js`): a reference's webroot
 * path, the element chain around an `<img>` in markup (no DOM), the `url()` pictures of a stylesheet,
 * and the pictures a JA ACM module's layout draws from its image fields. Pure: text in, references out.
 */
import path from 'node:path'

/**
 * @typedef {{ tag: string, attrs: string }} Element
 * @typedef {{ via: 'img' | 'field' | 'css', ref: string, from: string, chain?: Element[], selector?: string, svg?: string }} IconRef
 */

export const SVG_REF = /[^\s"'()<>\\,=]*\.svg\b/gi
const PICTURE_PROPS = /^(background(-image)?|list-style(-image)?|content|border-image(-source)?)$/i
const VOID = /^(img|br|hr|input|meta|link|source|area|col|embed|wbr|path|circle|rect|line|use)$/i

/** A path a reference names, as a webroot path: no scheme, host, query or fragment, no leading slash. */
export function refPath(/** @type {string} */ raw) {
  let ref = raw.replaceAll('\\/', '/')
  try {
    ref = decodeURIComponent(ref)
  } catch {}
  ref = ref
    .replace(/^[a-z]+:\/\/[^/]+/i, '')
    .replace(/[?#].*$/, '')
    .replace(/^(\.?\/)+/, '')
  const wp = ref.indexOf('wp-content/')
  return wp > 0 ? ref.slice(wp) : ref.replace(/^local-images\//, 'images/')
}

/**
 * The element chain an offset of an HTML text sits in, outermost first, from a tag stack (no DOM).
 * @param {string} html @param {number} at
 * @returns {Element[]}
 */
export function chainAt(html, at) {
  /** @type {Element[]} */
  const stack = []
  for (const m of html.slice(0, at).matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
    const [, close, tag, attrs] = m
    if (close) {
      const k = stack.map((e) => e.tag).lastIndexOf(tag.toLowerCase())
      if (k >= 0) stack.length = k
    } else if (!VOID.test(tag) && !attrs.trim().endsWith('/')) stack.push({ tag: tag.toLowerCase(), attrs })
  }
  const open = html.lastIndexOf('<', at)
  const tail = /^<([a-zA-Z][\w-]*)([^>]*)$/.exec(html.slice(open, at))
  if (open >= 0 && tail)
    stack.push({ tag: tail[1].toLowerCase(), attrs: html.slice(open, html.indexOf('>', at) + 1 || at) })
  return stack
}

/**
 * Every SVG a text names, as `img` (inside an `<img>` tag, or a CSS url of an inline style that is not
 * a mask) or `field` (a bare path).
 * @param {string} text @param {string} from
 * @returns {IconRef[]}
 */
export function refsInText(text, from) {
  const html = String(text ?? '')
    .replaceAll('\\"', '"')
    .replaceAll('\\/', '/')
  /** @type {IconRef[]} */
  const out = []
  for (const m of html.matchAll(SVG_REF)) {
    const at = m.index ?? 0
    // Joomla's media field repeats the path after `#joomlaImage://local-images/`: one reference
    if (!refPath(m[0]) || m[0].startsWith('#')) continue
    const open = html.lastIndexOf('<', at)
    const tagText = open >= 0 && html.indexOf('>', open) >= at ? html.slice(open, at) : ''
    if (/^<img\b/i.test(tagText)) {
      out.push({ via: 'img', ref: refPath(m[0]), from, chain: chainAt(html, at) })
      continue
    }
    if (tagText) {
      // an inline style url: a mask is the system's to paint
      if (/mask[\w-]*\s*:[^;]*$/i.test(tagText)) continue
      if (/url\(\s*["']?$/i.test(html.slice(Math.max(0, at - 6), at)))
        out.push({ via: 'img', ref: refPath(m[0]), from, chain: chainAt(html, at) })
      continue
    }
    out.push({ via: 'field', ref: refPath(m[0]), from })
  }
  return out
}

/**
 * Every `url(…)` picture of a stylesheet that is an SVG, with its selector.
 * @param {string} css @param {string} sheet the stylesheet's path in the template
 * @param {string} base the template's folder in the webroot (`templates/ja_x/`, `wp-content/themes/x/`)
 * @returns {IconRef[]}
 */
export function refsInStylesheet(css, sheet, base) {
  /** @type {IconRef[]} */
  const out = []
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const rule of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim()
    if (selector.startsWith('@')) continue
    for (const decl of rule[2].split(/;(?![^(]*\))/)) {
      const colon = decl.indexOf(':')
      if (colon < 0 || !PICTURE_PROPS.test(decl.slice(0, colon).trim())) continue
      for (const u of decl.slice(colon + 1).matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
        const url = u[2]
        const data = /^data:image\/svg\+xml(;base64)?,(.*)$/is.exec(url)
        if (data) {
          const svg = data[1] ? Buffer.from(data[2], 'base64').toString('utf8') : safeDecode(data[2])
          out.push({ via: 'css', ref: `${sheet} (data: SVG)`, from: sheet, selector, svg })
        } else if (/\.svg([?#]|$)/i.test(url) && !/^[a-z]+:\/\//i.test(url)) {
          const ref = url.startsWith('/')
            ? refPath(url)
            : path.posix.join(base, path.posix.dirname(sheet), refPath(url))
          out.push({ via: 'css', ref, from: sheet, selector })
        }
      }
    }
  }
  return out
}

const safeDecode = (/** @type {string} */ s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * The SVG fields of a JA ACM module (`mod_ja_acm` params: `jatools-config` names the block
 * `<template>:<name>` and its layout `jatools-layout-<name>`) as the pictures its layout draws: every
 * `<img>` of `acm/<name>/tmpl/<layout>.php` whose address the layout prints, with the chain of elements
 * around it, and every inline style url that is not a mask. A layout that prints the field only as a
 * mask draws no picture. Null when the text is no ACM config, or its layout is not in the template.
 * @param {string} text @param {Map<string, string>} files template files @param {string} from
 * @returns {IconRef[] | null}
 */
export function acmRefs(text, files, from) {
  let config
  try {
    const params = JSON.parse(text)
    config = JSON.parse(params?.['jatools-config'] ?? 'null')
  } catch {
    return null
  }
  const name = String(config?.[':type'] ?? '').split(':')[1]
  const layout = name ? config?.[name]?.[`jatools-layout-${name}`] : null
  const php = layout ? files.get(`acm/${name}/tmpl/${layout}.php`) : undefined
  if (php === undefined) return null
  const svgs = [...JSON.stringify(config[name]).replaceAll('\\/', '/').matchAll(SVG_REF)]
    .map((m) => refPath(m[0]))
    .filter((r, i, all) => r && all.indexOf(r) === i)
  // PHP printed inside a tag (`id="acm-clients-<?php echo $mid; ?>"`) ended that tag at its `?>`, and the
  // classes after it were lost to the chain: the same text with each PHP block's angle brackets blanked
  // keeps every offset and every tag whole
  const markup = php.replace(/<\?(php|=)[\s\S]*?\?>/g, (m) => m.replace(/[<>]/g, '_'))
  /** @type {Element[][]} */
  const chains = []
  for (const m of php.matchAll(/<img\b[^>]*<\?(php|=)/gi)) chains.push(chainAt(markup, (m.index ?? 0) + 4))
  for (const m of php.matchAll(/style\s*=\s*["'][^"']*url\(\s*<\?(php|=)/gi))
    if (!/mask[\w-]*\s*:[^;"']*url\(\s*<\?(php|=)$/i.test(m[0]))
      chains.push(chainAt(markup, (m.index ?? 0) + 1))
  return svgs.flatMap((ref) =>
    chains.map((chain) => ({
      via: /** @type {const} */ ('img'),
      ref,
      from: `${from} acm/${name}/tmpl/${layout}.php`,
      chain: printedSrc(chain, ref)
    }))
  )
}

/** A `src` the layout prints with PHP (`src="<?php echo $card['img']; ?>"`, its brackets blanked or not). */
const PRINTED_SRC = /\bsrc\s*=\s*["']?[<_]\?(php|=)[\s\S]*?\?[>_]["']?/i

/**
 * The chain with the field's own address in the `<img>` the layout prints it into, so a rule that names
 * one picture by its address (`img[src$="icon-code.svg"]`, the slot contract masking each JA Kinetic
 * Integrations icon) is matched against what the page shows, not against the PHP that prints it.
 * @param {Element[]} chain @param {string} ref
 */
function printedSrc(chain, ref) {
  const last = chain.at(-1)
  if (!last || last.tag !== 'img' || !PRINTED_SRC.test(last.attrs)) return chain
  return [...chain.slice(0, -1), { ...last, attrs: last.attrs.replace(PRINTED_SRC, `src="${ref}"`) }]
}
