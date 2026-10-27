/**
 * What the dialog reads off a `DESIGN.md`, as the files ARE (measured on all 152, 05/09/2026):
 *   - tagline as a leading blockquote            151/152
 *   - named colours, `**Name** (\`#hex\`)` lines    81/152  (the rest fall back to tokens.css)
 * So there is no fixed section list; only the palette has a fallback.
 */

import { splitFrontmatter } from './frontmatter.mjs'

export interface Swatch {
  name: string
  hex: string
}

export function readDesign(
  raw: string,
  tokensCss: string
): { title: string; tagline: string; swatches: Swatch[] } {
  const { body: md } = splitFrontmatter(raw)
  const title = (md.match(/^#\s+(.+)$/m)?.[1] ?? '').replace(/^Design System Inspired by\s+/i, '')
  const quote = md
    .split('\n')
    .filter((l) => l.startsWith('> '))
    .map((l) => l.slice(2).trim())
    // The brand engine's file quotes its category and surface as metadata lines, not as a tagline.
    .filter((l) => !/^(Category|Surface):/i.test(l))
  // A brand DESIGN.md carries its tagline as one italic line under the heading.
  const italic = md.match(/^\*([^*\n]+)\*$/m)?.[1]?.trim() ?? ''
  const tagline = quote[0] ?? italic

  const named: Swatch[] = []
  const seen = new Set<string>()
  const re = /\*\*([^*]+)\*\*\s*\(`(#[0-9a-fA-F]{3,6})`\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(md))) {
    const hex = m[2]!.toLowerCase()
    if (!seen.has(hex)) {
      seen.add(hex)
      named.push({ name: m[1]!, hex })
    }
  }
  if (named.length >= 4) return { title, tagline, swatches: named }

  // No named palette in the prose: fall back to the token file, token name as the label.
  const fromTokens: Swatch[] = []
  const tre = /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6}\b)/g
  while ((m = tre.exec(tokensCss))) {
    const hex = m[2]!.toLowerCase()
    if (!seen.has(hex)) {
      seen.add(hex)
      fromTokens.push({ name: m[1]!, hex })
    }
  }
  return { title, tagline, swatches: fromTokens }
}
