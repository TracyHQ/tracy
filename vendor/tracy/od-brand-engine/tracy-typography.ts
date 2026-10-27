/**
 * Tracy's seventh sample product: `typography.html` — the direction's own type specimen, colour
 * roles, spacing ladder, and its DESIGN.md, drawn in the direction's own tokens (Lee, 06/09 17:4x:
 * "About this direction" was a typography page drawn outside the iframe; make it an artifact and
 * drop the reading block). Same shell and `--brand-*` vocabulary as upstream's six renderers
 * (`src/engine/artifacts/`), so it is a sibling of theirs and runs for a customer's brand and for
 * a library direction alike. Pure and deterministic: (brand, tokens, designMd) → string.
 *
 * The specimen sentences are plain text nodes on their own elements, so `slotsOf` finds them and
 * the dialog's "Your words" / "More version" can rewrite them like any other product's copy. Every
 * other section — faces, colour roles, spacing, the notes — is marked `data-slots="skip"`: hex codes,
 * size labels and DESIGN.md are facts, not copy, and a model must not be offered them.
 *
 * Tracy-owned file (like `tracy-tokens.ts`); upstream has no typography kind.
 */

import type { Brand } from './contracts/api/brands.js'
import { document, esc } from './src/engine/artifacts/_shared.js'
import { type DesignTokens, varRef } from './src/engine/types.js'

const CSS = `
      .t-wrap { max-width: 960px; margin: 0 auto; padding: clamp(28px, 6vw, 72px) clamp(20px, 4vw, 40px) 96px; }
      .t-head { padding-bottom: ${varRef('sizeXL')}; border-bottom: ${varRef('lineWidth')} solid ${varRef('colorBorderSecondary')}; margin-bottom: ${varRef('sizeXXL')}; }
      .t-name { font-size: ${varRef('fontSizeHeading1')}; letter-spacing: -0.02em; }
      .t-tag { margin-top: ${varRef('sizeSM')}; font-size: ${varRef('fontSizeLG')}; color: ${varRef('colorTextSecondary')}; max-width: 48ch; }
      .t-sec { margin-bottom: ${varRef('sizeXXL')}; }
      .t-sec > h2 { font-size: ${varRef('fontSizeHeading3')}; margin-bottom: ${varRef('sizeLG')}; }
      .t-row { display: grid; grid-template-columns: 9rem 1fr; gap: ${varRef('sizeMD')}; align-items: baseline; padding: ${varRef('sizeSM')} 0; border-top: ${varRef('lineWidth')} solid ${varRef('colorBorderSecondary')}; }
      .t-meta { font-family: ${varRef('fontFamilyCode')}; font-size: ${varRef('fontSizeSM')}; color: ${varRef('colorTextTertiary')}; }
      .t-h1 { font-size: ${varRef('fontSizeHeading1')}; line-height: ${varRef('lineHeightHeading')}; }
      .t-h2 { font-size: ${varRef('fontSizeHeading2')}; line-height: ${varRef('lineHeightHeading')}; }
      .t-h3 { font-size: ${varRef('fontSizeHeading3')}; line-height: ${varRef('lineHeightHeading')}; }
      .t-h4 { font-size: ${varRef('fontSizeHeading4')}; line-height: ${varRef('lineHeightHeading')}; }
      .t-lg { font-size: ${varRef('fontSizeLG')}; }
      .t-base { font-size: ${varRef('fontSize')}; }
      .t-sm { font-size: ${varRef('fontSizeSM')}; color: ${varRef('colorTextSecondary')}; }
      .t-code { font-family: ${varRef('fontFamilyCode')}; font-size: ${varRef('fontSizeSM')}; background: ${varRef('colorFillQuaternary')}; padding: 2px 6px; border-radius: ${varRef('borderRadiusSM')}; }
      .t-faces { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: ${varRef('sizeMD')}; }
      .t-face { padding: ${varRef('sizeLG')}; background: ${varRef('colorBgContainer')}; border: ${varRef('lineWidth')} solid ${varRef('colorBorderSecondary')}; border-radius: ${varRef('borderRadiusLG')}; }
      .t-face .glyphs { font-size: ${varRef('fontSizeHeading2')}; line-height: 1.1; margin-bottom: ${varRef('sizeSM')}; overflow-wrap: anywhere; }
      .t-face.display .glyphs { font-family: var(--display-family); font-weight: ${varRef('fontWeightStrong')}; }
      .t-face.body .glyphs { font-family: ${varRef('fontFamily')}; }
      .t-face.mono .glyphs { font-family: ${varRef('fontFamilyCode')}; }
      .t-swatches { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: ${varRef('sizeMD')}; }
      .t-swatch { border: ${varRef('lineWidth')} solid ${varRef('colorBorderSecondary')}; border-radius: ${varRef('borderRadiusLG')}; overflow: hidden; background: ${varRef('colorBgContainer')}; }
      .t-swatch .chip { height: 72px; }
      .t-swatch .label { padding: ${varRef('sizeSM')} ${varRef('sizeMD')}; }
      .t-swatch .label strong { display: block; font-size: ${varRef('fontSizeSM')}; }
      .t-ladder { display: flex; align-items: flex-end; gap: ${varRef('sizeSM')}; flex-wrap: wrap; }
      .t-step { background: ${varRef('colorPrimary')}; opacity: .85; border-radius: ${varRef('borderRadiusXS')}; }
      .t-radii { display: flex; gap: ${varRef('sizeMD')}; flex-wrap: wrap; margin-top: ${varRef('sizeLG')}; }
      .t-radius { width: 88px; height: 56px; border: 2px solid ${varRef('colorPrimary')}; display: grid; place-items: center; font-family: ${varRef('fontFamilyCode')}; font-size: ${varRef('fontSizeSM')}; color: ${varRef('colorTextSecondary')}; }
      .t-notes { max-width: 72ch; }
      .t-notes h1, .t-notes h2, .t-notes h3, .t-notes h4 { margin: ${varRef('sizeXL')} 0 ${varRef('sizeSM')}; }
      .t-notes h1 { font-size: ${varRef('fontSizeHeading2')}; }
      .t-notes h2 { font-size: ${varRef('fontSizeHeading3')}; }
      .t-notes h3 { font-size: ${varRef('fontSizeHeading4')}; }
      .t-notes h4 { font-size: ${varRef('fontSizeHeading5')}; }
      .t-notes p, .t-notes li { margin: 0 0 ${varRef('sizeSM')}; color: ${varRef('colorTextSecondary')}; }
      .t-notes ul, .t-notes ol { padding-left: 1.4em; margin: 0 0 ${varRef('sizeMD')}; }
      .t-notes blockquote { margin: 0 0 ${varRef('sizeMD')}; padding-left: ${varRef('sizeMD')}; border-left: 3px solid ${varRef('colorPrimary')}; color: ${varRef('colorTextSecondary')}; }
      .t-notes code { font-family: ${varRef('fontFamilyCode')}; font-size: 0.9em; background: ${varRef('colorFillQuaternary')}; padding: 1px 5px; border-radius: ${varRef('borderRadiusXS')}; }
      .t-notes pre { background: ${varRef('colorFillQuaternary')}; padding: ${varRef('sizeMD')}; border-radius: ${varRef('borderRadiusSM')}; overflow-x: auto; margin: 0 0 ${varRef('sizeMD')}; }
      .t-notes pre code { background: none; padding: 0; }
      .t-notes table { border-collapse: collapse; width: 100%; margin: 0 0 ${varRef('sizeMD')}; font-size: ${varRef('fontSizeSM')}; }
      .t-notes th, .t-notes td { text-align: left; padding: ${varRef('sizeXS')} ${varRef('sizeSM')}; border-bottom: ${varRef('lineWidth')} solid ${varRef('colorBorderSecondary')}; vertical-align: top; }
      .t-notes th { color: ${varRef('colorText')}; }
      .t-notes hr { border: 0; border-top: ${varRef('lineWidth')} solid ${varRef('colorBorderSecondary')}; margin: ${varRef('sizeXL')} 0; }
      .t-notes a { text-decoration: underline; }
      .t-notes img { display: none; }
`

const ROLE_USAGE: Record<string, string> = {
  background: 'page canvas',
  surface: 'cards and raised surfaces',
  foreground: 'body text',
  muted: 'secondary text',
  border: 'hairlines and dividers',
  accent: 'primary actions',
  'accent-secondary': 'links and hover'
}

/**
 * @param designMd The direction's DESIGN.md (front matter included; it is stripped here). Empty → no notes section.
 */
export function renderTypography(brand: Brand, tokens: DesignTokens, opts: { designMd?: string } = {}): string {
  const name = brand.name
  const tagline = brand.tagline?.trim() || brand.description?.trim() || ''
  const display = brand.typography.display.family
  const body = brand.typography.body.family
  const mono = brand.typography.mono?.family ?? 'monospace'
  const px = (n: number) => `${Math.round(n)}px`

  const specimen = `      <section class="t-sec">
        <h2>Type scale</h2>
        <div class="t-row"><span class="t-meta" data-slots="skip">Heading 1 · ${px(tokens.fontSizeHeading1)}</span><h1 class="t-h1">Every ${esc(name)} page starts with one clear sentence.</h1></div>
        <div class="t-row"><span class="t-meta" data-slots="skip">Heading 2 · ${px(tokens.fontSizeHeading2)}</span><h2 class="t-h2">Sections read as a sequence of assertions.</h2></div>
        <div class="t-row"><span class="t-meta" data-slots="skip">Heading 3 · ${px(tokens.fontSizeHeading3)}</span><h3 class="t-h3">Cards, tabs and dialogs share this size.</h3></div>
        <div class="t-row"><span class="t-meta" data-slots="skip">Heading 4 · ${px(tokens.fontSizeHeading4)}</span><h4 class="t-h4">Captions that still carry meaning.</h4></div>
        <div class="t-row"><span class="t-meta" data-slots="skip">Lead · ${px(tokens.fontSizeLG)}</span><p class="t-lg">The lead paragraph sets the pace: one idea, said once, in ${esc(name)}'s voice.</p></div>
        <div class="t-row"><span class="t-meta" data-slots="skip">Body · ${px(tokens.fontSize)}</span><p class="t-base">Body text carries the argument. It should read at arm's length on a phone and stay calm on a wide screen, with a measure of about seventy characters and a line height of ${Math.round(tokens.lineHeight * 100) / 100}.</p></div>
        <div class="t-row"><span class="t-meta" data-slots="skip">Small · ${px(tokens.fontSizeSM)}</span><p class="t-sm">Small text is for metadata, timestamps and helper lines, never for anything the reader must not miss.</p></div>
        <div class="t-row" data-slots="skip"><span class="t-meta">Code</span><p><code class="t-code">${esc(mono)}</code></p></div>
      </section>`

  const faces = `      <section class="t-sec" data-slots="skip">
        <h2>Faces</h2>
        <div class="t-faces">
          <div class="t-face display"><div class="glyphs">Aa Bb Qq 0123</div><strong>${esc(display)}</strong><p class="t-sm">Display · headings, ${brand.typography.display.weights.join(' / ')}</p></div>
          <div class="t-face body"><div class="glyphs">Aa Bb Qq 0123</div><strong>${esc(body)}</strong><p class="t-sm">Body · paragraphs and UI, ${brand.typography.body.weights.join(' / ')}</p></div>
          <div class="t-face mono"><div class="glyphs">Aa Bb Qq 0123</div><strong>${esc(mono)}</strong><p class="t-sm">Mono · code, tabular figures</p></div>
        </div>
      </section>`

  const swatches = brand.colors
    .map(
      (c) => `          <div class="t-swatch"><div class="chip" style="background:${esc(c.hex)}"></div><div class="label"><strong>${esc(c.name || c.role)}</strong><span class="t-meta">${esc(c.hex)}</span><p class="t-sm">${esc(c.usage || ROLE_USAGE[c.role] || c.role)}</p></div></div>`
    )
    .join('\n')
  const colors = `      <section class="t-sec" data-slots="skip">
        <h2>Color roles</h2>
        <div class="t-swatches">
${swatches}
        </div>
      </section>`

  const steps: [string, number][] = [
    ['xxs', tokens.sizeXXS],
    ['xs', tokens.sizeXS],
    ['sm', tokens.sizeSM],
    ['md', tokens.sizeMD],
    ['lg', tokens.sizeLG],
    ['xl', tokens.sizeXL],
    ['xxl', tokens.sizeXXL]
  ]
  const radii: [string, number][] = [
    ['xs', tokens.borderRadiusXS],
    ['sm', tokens.borderRadiusSM],
    ['md', tokens.borderRadius],
    ['lg', tokens.borderRadiusLG]
  ]
  const spacing = `      <section class="t-sec" data-slots="skip">
        <h2>Spacing and radius</h2>
        <div class="t-ladder">
${steps.map(([k, v]) => `          <div title="${k} · ${px(v)}"><div class="t-step" style="width:${px(v)};height:${px(v)}"></div><span class="t-meta">${px(v)}</span></div>`).join('\n')}
        </div>
        <div class="t-radii">
${radii.map(([k, v]) => `          <div class="t-radius" style="border-radius:${px(v)}">${k} ${px(v)}</div>`).join('\n')}
        </div>
      </section>`

  const md = stripFrontMatter(opts.designMd ?? '').trim()
  const notes = md
    ? `      <section class="t-sec t-notes" data-slots="skip">
        <h2>Notes</h2>
${markdownToHtml(md)}
      </section>`
    : ''

  const html = `    <main class="t-wrap">
      <header class="t-head">
        <span class="kicker">Typography and color</span>
        <h1 class="t-name">${esc(name)}</h1>
        ${tagline ? `<p class="t-tag">${esc(tagline)}</p>` : ''}
      </header>
${specimen}
${faces}
${colors}
${spacing}
${notes}
    </main>`
  return document({ title: `${name} — Typography`, tokens, brand, body: html, css: CSS })
}

function stripFrontMatter(md: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(md)
  return m ? md.slice(m[0].length) : md
}

// ─────────────────────────── a small Markdown → HTML ────────────────────────
// DESIGN.md is prose with headings, lists, tables, blockquotes and code — the common subset of
// CommonMark. Enough for a specimen page; not a general renderer. Everything is escaped first.

function inline(text: string): string {
  let s = esc(text)
  s = s.replace(/`([^`]+)`/g, (_m, c: string) => `<code>${c}</code>`)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
  return s
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  const flushPara = (buf: string[]) => {
    if (buf.length) out.push(`<p>${inline(buf.join(' '))}</p>`)
    buf.length = 0
  }
  const para: string[] = []
  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (/^```/.test(line)) {
      flushPara(para)
      const code: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i] ?? '')) code.push(lines[i] ?? ''), i++
      i++
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`)
      continue
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      flushPara(para)
      const level = Math.min(4, h[1]!.length)
      out.push(`<h${level}>${inline(h[2]!.replace(/\s+#+$/, ''))}</h${level}>`)
      i++
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushPara(para)
      out.push('<hr />')
      i++
      continue
    }
    if (/^>\s?/.test(line)) {
      flushPara(para)
      const q: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i] ?? '')) q.push((lines[i] ?? '').replace(/^>\s?/, '')), i++
      out.push(`<blockquote>${markdownToHtml(q.join('\n'))}</blockquote>`)
      continue
    }
    if (/^\|.*\|\s*$/.test(line) && /^\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      flushPara(para)
      const cells = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim())
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i] ?? '')) rows.push(cells(lines[i] ?? '')), i++
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`
      )
      continue
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (li) {
      flushPara(para)
      const ordered = /\d/.test(li[2]!)
      const items: string[] = []
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i] ?? '')
        if (!m) break
        items.push(m[3]!)
        i++
        // Continuation lines indented under the item stay with it.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i] ?? '') && !/^\s*([-*+]|\d+[.)])\s/.test(lines[i] ?? '')) {
          items[items.length - 1] += ` ${(lines[i] ?? '').trim()}`
          i++
        }
      }
      const tag = ordered ? 'ol' : 'ul'
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`)
      continue
    }
    if (line.trim() === '') {
      flushPara(para)
      i++
      continue
    }
    para.push(line.trim())
    i++
  }
  flushPara(para)
  return out.join('\n')
}
