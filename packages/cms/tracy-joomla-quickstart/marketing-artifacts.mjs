/**
 * The six marketing artifacts, rendered from resolved contract fields.
 *
 * The design stays the inspiration's: every colour, size, radius and face comes from the
 * `--brand-*` tokens the brand engine derives, exactly as the engine's own renderers do. What
 * changes is the copy — these artifacts describe the studio the website describes, so the words
 * arrive as a compiled content plan and never as literals in this file.
 *
 * Every planned field is rendered inside an element carrying `data-field` (plus `data-field-attr`
 * when the value lives in an attribute). That marker is the map the render audit reads back from
 * the live DOM; without it an observation would have to be written by hand, which checks nothing.
 *
 * Pure and deterministic: (fields, tokens, brand) -> string. No network, Date or random.
 */

import { tokensToCssVars } from '../../../vendor/tracy/od-brand-engine/dist/index.js'

// ─────────────────────────── primitives ─────────────────────────────────────

export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** "colorPrimary" -> "var(--brand-color-primary)", the vocabulary the token block declares. */
export function v(token) {
  const kebab = token
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Za-z])([0-9])/g, '$1-$2')
    .toLowerCase()
  return `var(--brand-${kebab})`
}

/** One planned field as text inside `tag`. The marker is what the audit reads back. */
function text(fields, key, tag, attrs = '') {
  if (!Object.hasOwn(fields, key)) throw new Error(`Artifact field not in the content plan: ${key}`)
  return `<${tag} data-field="${key}"${attrs ? ' ' + attrs : ''}>${esc(fields[key])}</${tag}>`
}

/** A planned field that lives in an attribute (a destination, an image, an alt text). */
function attr(fields, key, name) {
  if (!Object.hasOwn(fields, key)) throw new Error(`Artifact field not in the content plan: ${key}`)
  return `data-field-${name}="${key}" ${name}="${esc(fields[key])}"`
}

function need(fields, key) {
  if (!Object.hasOwn(fields, key)) throw new Error(`Artifact field not in the content plan: ${key}`)
  return fields[key]
}

/**
 * The site's design tokens, and the aliases that make the brand engine's `--brand-*` vocabulary
 * resolve to them.
 *
 * An artifact is a document of this website, so it may not carry a second palette and a second type
 * ladder: the design contract reads `:root` for the site tokens and the theme attribute for the
 * mode, and both were absent until now. Values are the published Style Guide ladder
 * (`/resources/style-guide`), not numbers chosen for these documents.
 */
const SITE_FONT_BODY =
  '"SF Pro Text", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif, Inter, "Inter Tight", sans-serif'
const SITE_FONT_DISPLAY = '"SF Pro Display", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif'

const SITE_SCALE = {
  '--text-xs': '12px',
  '--text-sm': '14px',
  '--text-base': '17px',
  '--text-lg': '21px',
  '--text-xl': '28px',
  '--text-2xl': '40px',
  '--text-3xl': '56px',
  '--text-4xl': '80px',
  '--text-4xl-phone': '40px',
  '--text-3xl-phone': '28px',
  '--text-2xl-phone': '20px',
  '--leading-body': '1.47',
  '--leading-tight': '1.05',
  '--tracking-display': '-0.015em',
  '--space-1': '4px',
  '--space-2': '8px',
  '--space-3': '12px',
  '--space-4': '16px',
  '--space-5': '20px',
  '--space-6': '24px',
  '--space-8': '32px',
  '--space-12': '48px',
  '--container-max': '1024px',
  '--radius-sm': '8px',
  '--radius-md': '12px',
  '--radius-lg': '18px',
  '--radius-pill': '980px'
}

const SITE_PALETTE = {
  light: {
    '--bg': '#ffffff',
    '--fg': '#1d1d1f',
    '--surface': '#f5f5f7',
    '--muted': '#6e6e73',
    '--border': '#d2d2d7',
    '--accent': '#0071e3',
    '--accent-on': '#ffffff'
  },
  dark: {
    '--bg': '#000000',
    '--fg': '#f8f8f8',
    '--surface': '#1d1d1f',
    '--muted': '#87878b',
    '--border': '#2f2f30',
    '--accent': '#2997ff',
    '--accent-on': '#000000'
  }
}

/** Brand-engine token names mapped onto the site tokens, so every artifact repaints with the site. */
const BRAND_ALIASES = {
  '--brand-font-family': 'var(--font-body-stack)',
  '--brand-font-size': 'var(--text-base)',
  '--brand-line-height': 'var(--leading-body)',
  '--brand-font-weight-strong': '700',
  '--brand-color-text': 'var(--fg)',
  '--brand-color-text-secondary': 'var(--muted)',
  '--brand-color-text-tertiary': 'var(--muted)',
  '--brand-color-text-quaternary': 'var(--muted)',
  '--brand-color-bg-layout': 'var(--bg)',
  '--brand-color-bg-container': 'var(--surface)',
  '--brand-color-bg-elevated': 'var(--surface)',
  '--brand-color-border': 'var(--border)',
  '--brand-color-border-secondary': 'var(--border)',
  '--brand-color-fill': 'var(--border)',
  '--brand-color-fill-secondary': 'var(--border)',
  '--brand-color-fill-tertiary': 'var(--border)',
  '--brand-color-fill-quaternary': 'var(--surface)',
  '--brand-color-primary': 'var(--accent)',
  '--brand-color-primary-ink': 'var(--accent)',
  '--brand-color-primary-border': 'var(--accent)',
  '--brand-color-primary-bg': 'var(--surface)',
  '--brand-color-primary-active': 'var(--accent)',
  '--brand-color-primary-contrast': 'var(--accent-on)',
  '--brand-color-link': 'var(--accent)',
  '--brand-border-radius': 'var(--radius-md)',
  '--brand-border-radius-lg': 'var(--radius-lg)',
  '--brand-border-radius-sm': 'var(--radius-sm)',
  '--brand-border-radius-xs': 'var(--radius-sm)',
  '--brand-line-width': '1px'
}

function siteTokenBlock(mode) {
  const lines = [
    ...Object.entries(SITE_SCALE),
    ...Object.entries(SITE_PALETTE[mode]),
    ['--font-body-stack', SITE_FONT_BODY],
    ['--font-display-stack', SITE_FONT_DISPLAY],
    ...Object.entries(BRAND_ALIASES)
  ]
  return `    :root {\n${lines.map(([name, value]) => `      ${name}: ${value};`).join('\n')}\n    }`
}

/**
 * Heading roles.
 *
 * `flow` documents — newsletter, email, form, type specimen — read in a 520–600px column, so their
 * headings take the ladder one step below the website's page roles: section for the headline, card
 * for the subhead, compact for the item. `canvas` documents — the 3:4 poster and the 16:9 deck —
 * are fixed-aspect surfaces whose type has to scale with the surface or clip, so the same ladder is
 * expressed as a percentage of the canvas (`--text-*` over `--container-max`), which is what a
 * container query unit computes. Below 640px the deck stops being a slide and becomes a stack, and
 * takes the site's phone steps.
 */
const CANVAS_STEP = {
  display: (80 / 1024) * 100,
  section: (40 / 1024) * 100,
  card: (28 / 1024) * 100
}

const HEADING_SCALE = {
  // Flow documents: section / card / compact, and one step down on a phone.
  flow: `
      h1, h2, h3 {
        font-family: var(--font-display-stack);
        font-weight: 700;
        line-height: var(--leading-tight);
        letter-spacing: var(--tracking-display);
      }
      h1 { font-size: var(--text-2xl); }
      h2 { font-size: var(--text-xl); }
      h3 { font-size: var(--text-lg); }
      @media (max-width: 639px) {
        h1 { font-size: var(--text-xl); }
        h2 { font-size: var(--text-lg); }
        h3 { font-size: var(--text-lg); }
      }
`,
  // Poster: one focal, sized as the display step would be inside the page container.
  poster: `
      h1 {
        font-family: var(--font-display-stack);
        font-weight: 700;
        font-size: ${CANVAS_STEP.display}cqi;
        line-height: var(--leading-tight);
        letter-spacing: var(--tracking-display);
      }
`,
  // Deck: cover at the display step, slide titles at section, cards at card — all canvas-relative.
  deck: `
      .frame h1, .frame h2, .frame h3 {
        font-family: var(--font-display-stack);
        font-weight: 700;
        line-height: var(--leading-tight);
        letter-spacing: var(--tracking-display);
      }
      .frame h1 { font-size: ${CANVAS_STEP.display}cqi; }
      .frame h2 { font-size: ${CANVAS_STEP.section}cqi; }
      .frame h3 { font-size: ${CANVAS_STEP.card}cqi; }
      @media (max-width: 639px) {
        .frame h1 { font-size: var(--text-2xl); }
        .frame h2 { font-size: var(--text-xl); }
        .frame h3 { font-size: var(--text-lg); }
      }
`
}

const BASE_CSS = `
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        font-family: ${v('fontFamily')};
        font-size: ${v('fontSize')};
        line-height: ${v('lineHeight')};
        color: ${v('colorText')};
        background: ${v('colorBgLayout')};
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }
      a { color: ${v('colorLink')}; text-decoration: none; }
      h1, h2, h3, h4 {
        margin: 0;
        font-family: var(--display-family);
        line-height: ${v('lineHeightHeading')};
        font-weight: ${v('fontWeightStrong')};
        color: ${v('colorText')};
        overflow-wrap: break-word;
      }
      p, ul, ol { margin: 0; overflow-wrap: break-word; }
      img, svg { max-width: 100%; display: block; }
      .kicker {
        display: block; text-transform: uppercase; letter-spacing: 0.14em;
        font-size: ${v('fontSizeSM')}; font-weight: ${v('fontWeightStrong')};
        color: ${v('colorPrimaryInk')};
      }
      .disclosure {
        font-size: ${v('fontSizeSM')}; line-height: 1.5; color: ${v('colorTextTertiary')};
      }
`

/**
 * The document shell.
 *
 * The theme is declared on the root element with the same three hooks the site emits, because the
 * design contract reads `data-bs-theme` and a document that states no theme is measured as
 * `mode: unknown` — it cannot pass in either variant. The brand engine's derived tokens are kept
 * first so nothing it draws loses its structure, then the site tokens and aliases override the
 * palette, the type ladder and the radii.
 */
export function documentShell({
  title,
  tokens,
  body,
  css = '',
  script = '',
  mode = 'light',
  scale = 'flow'
}) {
  return `<!doctype html>
<html lang="en" data-theme="${mode}" data-bs-theme="${mode}"${mode === 'dark' ? ' class="t4-dark"' : ''}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <style>
${tokensToCssVars(tokens).replace(/^/gm, '    ')}
${siteTokenBlock(mode)}
      :root { --display-family: var(--font-display-stack); }
${BASE_CSS}
${css}
${HEADING_SCALE[scale]}
    </style>
  </head>
  <body>
${body}
${script ? `    <script>${script}</script>` : ''}
  </body>
</html>`
}

/** The one call to action every artifact carries, as a real link with a real destination. */
function ctaButton(fields, { label = 'cta.label', href = 'cta.href', block = false } = {}) {
  return `<a ${attr(fields, href, 'href')} style="display:inline-flex;align-items:center;justify-content:center;${
    block ? 'width:100%;' : ''
  }height:${v('controlHeightLG')};padding:0 ${v('sizeXL')};border-radius:999px;background:${v(
    'colorPrimary'
  )};color:${v('colorPrimaryContrast')};font-weight:${v('fontWeightStrong')};font-size:${v(
    'fontSize'
  )};letter-spacing:-0.01em;"><span data-field="${label}">${esc(need(fields, label))}</span></a>`
}

// ─────────────────────────── newsletter ─────────────────────────────────────

const PAD = v('sizeXXL')

function rule() {
  return `<div style="height:${v('lineWidth')};background:${v('colorBorderSecondary')};margin:0 ${PAD};"></div>`
}

function storyBlock(fields, index) {
  const n = String(index).padStart(2, '0')
  return `        <tr><td style="padding:${v('sizeXL')} ${PAD} ${v('sizeLG')};">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
            <tr>
              <td valign="top" style="width:54px;padding-right:${v('sizeMD')};">
                <div style="font-family:var(--display-family);font-size:${v(
                  'fontSizeHeading3'
                )};font-weight:${v('fontWeightStrong')};line-height:1;color:${v(
                  'colorPrimaryInk'
                )};letter-spacing:-0.02em;">${n}</div>
                <div style="margin-top:${v('sizeXS')};width:24px;height:${v('lineWidth')};background:${v(
                  'colorPrimaryBorder'
                )};"></div>
              </td>
              <td valign="top">
                ${text(fields, `story${index}.title`, 'h2', `style="margin-bottom:${v('sizeXS')};"`)}
                ${text(fields, `story${index}.body`, 'p', `style="margin-bottom:${v('sizeMD')};color:${v('colorTextSecondary')};font-size:${v('fontSize')};line-height:${v('lineHeight')};"`)}
                <a ${attr(fields, `story${index}.href`, 'href')} style="font-weight:${v(
                  'fontWeightStrong'
                )};font-size:${v('fontSize')};color:${v('colorLink')};"><span data-field="story${index}.link">${esc(
                  need(fields, `story${index}.link`)
                )}</span> &rarr;</a>
              </td>
            </tr>
          </table>
        </td></tr>`
}

export function renderNewsletter(fields, tokens, _brand, mode) {
  const inner = `        <tr><td style="padding:${v('sizeXL')} ${PAD} ${v(
    'sizeLG'
  )};text-align:center;border-bottom:${v('lineWidth')} solid ${v('colorBorder')};">
          <div style="display:inline-block;width:32px;height:${v('lineWidth')};background:${v(
            'colorPrimary'
          )};margin-bottom:${v('sizeMD')};"></div>
          ${text(fields, 'masthead.name', 'div', `style="font-family:var(--display-family);font-weight:${v('fontWeightStrong')};font-size:${v('fontSizeXL', '28px')};letter-spacing:var(--tracking-display);color:${v('colorText')};"`)}
          ${text(fields, 'masthead.issue', 'div', `style="margin-top:${v('sizeXS')};font-size:${v('fontSizeSM')};color:${v('colorTextTertiary')};text-transform:uppercase;letter-spacing:0.2em;"`)}
        </td></tr>

        <tr><td style="padding:${v('sizeXL')} ${PAD} ${v('sizeMD')};">
          ${text(fields, 'lede.kicker', 'p', 'class="kicker"')}
          ${text(fields, 'lede.headline', 'h1', `style="margin:${v('sizeSM')} 0 ${v('sizeSM')};"`)}
          ${text(fields, 'lede.blurb', 'p', `style="color:${v('colorTextSecondary')};font-size:${v('fontSizeLG')};line-height:1.6;"`)}
        </td></tr>

        <tr><td style="padding:0 ${PAD} ${v('sizeXL')};text-align:center;">${ctaButton(fields)}</td></tr>

        <tr><td>${rule()}</td></tr>
${[1, 2, 3].map((i) => `${i > 1 ? `        <tr><td>${rule()}</td></tr>\n` : ''}${storyBlock(fields, i)}`).join('\n')}
        <tr><td>${rule()}</td></tr>

        <tr><td style="padding:${v('sizeXL')} ${PAD};text-align:center;">
          ${text(fields, 'closing', 'p', `style="margin-bottom:${v('sizeMD')};color:${v('colorTextSecondary')};font-size:${v('fontSize')};"`)}
          ${ctaButton(fields)}
        </td></tr>`

  const footer = `      <div style="padding:${v('sizeLG')} ${v('sizeXL')};background:${v(
    'colorFillQuaternary'
  )};color:${v('colorTextTertiary')};font-size:${v('fontSizeSM')};border-top:${v(
    'lineWidth'
  )} solid ${v('colorBorderSecondary')};text-align:center;">
        ${text(fields, 'footer.audience', 'p', `style="margin-bottom:${v('sizeXS')};"`)}
        <p style="margin-bottom:${v('sizeXS')};"><a ${attr(
          fields,
          'footer.services.href',
          'href'
        )} style="color:${v('colorTextTertiary')};text-decoration:underline;"><span data-field="footer.services.label">${esc(
          need(fields, 'footer.services.label')
        )}</span></a></p>
        ${text(fields, 'disclosure', 'p', 'class="disclosure"')}
      </div>`

  const body = `    <div style="padding:${v('sizeXL')} ${v('sizeMD')};">
      <div style="max-width:600px;margin:0 auto;background:${v('colorBgContainer')};border:${v(
        'lineWidth'
      )} solid ${v('colorBorderSecondary')};border-radius:${v('borderRadiusLG')};overflow:hidden;">
        <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${v(
          'colorBgContainer'
        )};" data-field="preheader">${esc(need(fields, 'preheader'))}</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
${inner}
        </table>
${footer}
      </div>
    </div>`

  return documentShell({ title: `${need(fields, 'masthead.name')} — Newsletter`, tokens, body, mode })
}

// ─────────────────────────── email ──────────────────────────────────────────

function checkIcon() {
  return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" style="flex:0 0 auto;margin-top:4px;"><path d="M3.5 9.5L7 13l7.5-8" stroke="${v(
    'colorPrimary'
  )}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}

function emailPoint(fields, index) {
  return `<li style="display:flex;gap:${v('sizeSM')};align-items:flex-start;padding:${v(
    'sizeSM'
  )} 0;border-top:${v('lineWidth')} solid ${v('colorBorderSecondary')};">
              ${checkIcon()}
              <span>
                <a ${attr(fields, `point${index}.href`, 'href')} style="display:block;margin-bottom:4px;">${text(
                  fields,
                  `point${index}.title`,
                  'strong',
                  `style="font-family:var(--display-family);font-size:${v('fontSizeLG')};color:${v('colorText')};"`
                )}</a>
                ${text(fields, `point${index}.body`, 'span', `style="color:${v('colorTextSecondary')};"`)}
              </span>
            </li>`
}

export function renderEmail(fields, tokens, _brand, mode) {
  const body = `    <div style="padding:${v('sizeXL')} ${v('sizeMD')};">
      <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${v(
        'colorBgLayout'
      )};" data-field="preheader">${esc(need(fields, 'preheader'))}</div>
      <div style="max-width:600px;margin:0 auto;background:${v('colorBgContainer')};border:${v(
        'lineWidth'
      )} solid ${v('colorBorderSecondary')};border-radius:${v('borderRadiusLG')};overflow:hidden;">
        <div style="padding:${v('sizeLG')} ${v('sizeXL')};border-bottom:${v('lineWidth')} solid ${v(
          'colorBorderSecondary'
        )};display:flex;align-items:center;gap:${v('sizeSM')};">
          <span style="width:10px;height:10px;border-radius:50%;background:${v('colorPrimary')};"></span>
          ${text(fields, 'masthead.name', 'span', `style="font-family:var(--display-family);font-weight:${v('fontWeightStrong')};font-size:${v('fontSizeLG')};letter-spacing:-0.01em;color:${v('colorText')};"`)}
        </div>

        <div style="padding:${v('sizeXXL')} ${v('sizeXL')} ${v('sizeLG')};">
          ${text(fields, 'kicker', 'p', 'class="kicker"')}
          ${text(fields, 'headline', 'h1', `style="margin:${v('sizeSM')} 0 ${v('sizeMD')};"`)}
          ${text(fields, 'lede', 'p', `style="color:${v('colorTextSecondary')};font-size:${v('fontSizeLG')};line-height:1.6;"`)}
        </div>

        <div style="padding:0 ${v('sizeXL')} ${v('sizeLG')};">
          ${text(fields, 'greeting', 'p', `style="margin-bottom:${v('sizeSM')};"`)}
          ${text(fields, 'intro', 'p', `style="margin-bottom:${v('sizeLG')};color:${v('colorTextSecondary')};"`)}
          <ul style="list-style:none;padding:0;">
${[1, 2, 3].map((i) => emailPoint(fields, i)).join('\n')}
          </ul>
        </div>

        <div style="margin:0 ${v('sizeXL')} ${v('sizeLG')};padding:${v('sizeLG')};background:${v(
          'colorFillQuaternary'
        )};border-radius:${v('borderRadius')};">
          ${text(fields, 'product.title', 'h2', `style="margin-bottom:${v('sizeXS')};"`)}
          ${text(fields, 'product.body', 'p', `style="color:${v('colorTextSecondary')};"`)}
        </div>

        <div style="padding:0 ${v('sizeXL')} ${v('sizeXXL')};text-align:center;">
          ${ctaButton(fields)}
          ${text(fields, 'signoff', 'p', `style="margin-top:${v('sizeMD')};color:${v('colorTextTertiary')};font-size:${v('fontSizeSM')};"`)}
        </div>

        <div style="padding:${v('sizeLG')} ${v('sizeXL')};background:${v(
          'colorFillQuaternary'
        )};border-top:${v('lineWidth')} solid ${v('colorBorderSecondary')};text-align:center;color:${v(
          'colorTextTertiary'
        )};font-size:${v('fontSizeSM')};">
          ${text(fields, 'footer.name', 'p', `style="font-weight:${v('fontWeightStrong')};color:${v('colorTextSecondary')};margin-bottom:${v('sizeXXS')};"`)}
          ${text(fields, 'footer.note', 'p', `style="margin-bottom:${v('sizeXS')};"`)}
          ${text(fields, 'disclosure', 'p', 'class="disclosure"')}
        </div>
      </div>
    </div>`

  return documentShell({ title: `${need(fields, 'masthead.name')} — Email`, tokens, body, mode })
}

// ─────────────────────────── poster ─────────────────────────────────────────

const POSTER_CSS = `
      .poster-stage { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: clamp(20px, 4vw, 48px); background: ${v('colorBgLayout')}; }
      .poster {
        position: relative; aspect-ratio: 3 / 4;
        width: min(720px, 92vw, calc((100vh - 96px) * 3 / 4));
        container-type: inline-size;
        background: ${v('colorBgElevated')}; color: ${v('colorText')};
        border: ${v('lineWidth')} solid ${v('colorBorderSecondary')};
        border-radius: ${v('borderRadiusLG')}; overflow: hidden;
        box-shadow: 0 36px 90px ${v('colorFillSecondary')}, 0 4px 12px ${v('colorFillQuaternary')};
      }
      .poster-inner { position: relative; height: 100%; display: grid; grid-template-rows: auto 1fr auto; padding: 9cqi; }
      .poster::after { content: ""; position: absolute; inset: 4cqi; border: ${v('lineWidth')} solid ${v('colorBorderSecondary')}; border-radius: 0.8cqi; pointer-events: none; }
      .poster-inner > * { position: relative; z-index: 1; }
      .p-head { display: flex; align-items: center; justify-content: space-between; gap: 3cqi; }
      .p-wordmark { font-family: var(--display-family); font-weight: ${v('fontWeightStrong')}; font-size: 2.4cqi; letter-spacing: -0.01em; }
      .p-kicker { text-transform: uppercase; letter-spacing: 0.28em; font-size: 1.8cqi; font-weight: ${v('fontWeightStrong')}; color: ${v('colorTextTertiary')}; }
      .p-focal { text-wrap: balance; margin: 0; }
      .p-focal .accent { color: ${v('colorPrimaryInk')}; }
      .p-rule { width: 12cqi; height: 0.7cqi; background: ${v('colorPrimary')}; border-radius: 0.4cqi; }
      .p-sub { font-size: 2.9cqi; line-height: 1.42; color: ${v('colorTextSecondary')}; max-width: 58cqi; }
      .p-services { display: flex; flex-wrap: wrap; gap: 1.4cqi; }
      .p-service { display: inline-flex; align-items: center; gap: 1cqi; padding: 1.1cqi 2.2cqi; border-radius: 6cqi; border: ${v('lineWidth')} solid ${v('colorBorder')}; font-size: 1.9cqi; font-weight: ${v('fontWeightStrong')}; color: ${v('colorTextSecondary')}; }
      .p-service .dot { width: 0.9cqi; height: 0.9cqi; border-radius: 50%; background: ${v('colorPrimary')}; }
      .p-cta { display: flex; align-items: center; gap: 2.4cqi; padding-top: 3.2cqi; border-top: ${v('lineWidth')} solid ${v('colorBorderSecondary')}; }
      .p-cta a { display: inline-flex; align-items: center; height: 6.4cqi; padding: 0 3.2cqi; border-radius: 6cqi; background: ${v('colorPrimary')}; color: ${v('colorPrimaryContrast')}; font-weight: ${v('fontWeightStrong')}; font-size: 2.2cqi; }
      .p-cta .where { font-size: 1.9cqi; color: ${v('colorTextTertiary')}; }
      .p-sign { display: flex; align-items: flex-end; justify-content: space-between; gap: 3cqi; }
      .p-sign-name { font-family: var(--display-family); font-weight: ${v('fontWeightStrong')}; font-size: 2.8cqi; letter-spacing: -0.01em; }
      .p-sign-note { font-size: 1.8cqi; line-height: 1.4; color: ${v('colorTextTertiary')}; max-width: 42cqi; text-align: right; }
      .p-disclosure { font-size: 1.6cqi; line-height: 1.45; color: ${v('colorTextTertiary')}; max-width: 62cqi; }
`

export function renderPoster(fields, tokens, _brand, mode) {
  const focal = esc(need(fields, 'focal'))
  const space = focal.indexOf(' ')
  const focalHtml =
    space === -1
      ? `<span class="accent">${focal}</span>`
      : `<span class="accent">${focal.slice(0, space)}</span>${focal.slice(space)}`

  const body = `    <div class="poster-stage">
      <div class="poster">
       <div class="poster-inner">
        <header class="p-head">
          ${text(fields, 'wordmark', 'span', 'class="p-wordmark"')}
          ${text(fields, 'kicker', 'span', 'class="p-kicker"')}
        </header>

        <div style="display:flex;flex-direction:column;justify-content:center;gap:3.4cqi;padding:2cqi 0;">
          <h1 class="p-focal" data-field="focal">${focalHtml}</h1>
          <div class="p-rule"></div>
          ${text(fields, 'subhead', 'p', 'class="p-sub"')}
          <div class="p-services">
            ${[1, 2, 3]
              .map(
                (i) =>
                  `<span class="p-service"><span class="dot"></span>${text(
                    fields,
                    `service${i}.name`,
                    'span'
                  )}</span>`
              )
              .join('\n            ')}
          </div>
          <div class="p-cta">
            <a ${attr(fields, 'cta.href', 'href')}><span data-field="cta.label">${esc(
              need(fields, 'cta.label')
            )}</span></a>
          </div>
        </div>

        <footer class="p-sign">
          <span style="display:flex;flex-direction:column;gap:1.2cqi;">
            ${text(fields, 'signature.name', 'span', 'class="p-sign-name"')}
            ${text(fields, 'disclosure', 'span', 'class="p-disclosure"')}
          </span>
          ${text(fields, 'signature.note', 'span', 'class="p-sign-note"')}
        </footer>
       </div>
      </div>
    </div>`

  return documentShell({
    title: `${need(fields, 'wordmark')} — Poster`,
    tokens,
    body,
    css: POSTER_CSS,
    mode,
    scale: 'poster'
  })
}

// ─────────────────────────── deck ───────────────────────────────────────────

const DECK_CSS = `
      html, body { height: 100%; overflow: hidden; }
      .deck { height: 100vh; overflow-y: auto; scroll-snap-type: y mandatory; scroll-behavior: smooth; }
      .slide { height: 100vh; scroll-snap-align: start; scroll-snap-stop: always; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .frame {
        position: relative; aspect-ratio: 16 / 9;
        width: min(1280px, 94vw, calc((100vh - 48px) * 16 / 9));
        container-type: size;
        background: ${v('colorBgContainer')};
        border: ${v('lineWidth')} solid ${v('colorBorderSecondary')};
        border-radius: ${v('borderRadiusLG')};
        box-shadow: 0 24px 64px -24px ${v('colorFillSecondary')}, 0 2px 8px ${v('colorFillQuaternary')};
        overflow: hidden; display: flex; flex-direction: column;
      }
      .frame--accent { background: ${v('colorPrimary')}; border-color: transparent; }
      .frame--accent .s-kicker { color: color-mix(in srgb, ${v('colorPrimaryContrast')} 78%, transparent); }
      .frame--accent .s-kicker::before { background: color-mix(in srgb, ${v('colorPrimaryContrast')} 85%, transparent); }
      .frame--accent .s-title, .frame--accent .s-mega { color: ${v('colorPrimaryContrast')}; }
      .frame--accent .s-lede, .frame--accent .s-note { color: color-mix(in srgb, ${v('colorPrimaryContrast')} 84%, transparent); }
      .frame--accent .f-head, .frame--accent .f-foot { color: color-mix(in srgb, ${v('colorPrimaryContrast')} 64%, transparent); }
      .frame--accent .f-head .rule, .frame--accent .f-foot .rule { background: color-mix(in srgb, ${v('colorPrimaryContrast')} 22%, transparent); }
      .frame--surface { background: ${v('colorBgLayout')}; }

      .f-head { display: flex; justify-content: space-between; align-items: center; gap: 2cqi; padding: 3cqi 5cqi 0; color: ${v('colorTextQuaternary')}; font-size: 1.35cqi; }
      .f-head .wm { font-family: var(--display-family); font-weight: ${v('fontWeightStrong')}; font-size: 1.7cqi; letter-spacing: -0.01em; color: inherit; }
      .f-head .rule { flex: 1; height: ${v('lineWidth')}; background: ${v('colorBorderSecondary')}; }
      .f-head .ix { font-variant-numeric: tabular-nums; letter-spacing: 0.12em; }
      .f-body { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 0 5cqi; min-height: 0; overflow: hidden; }
      .f-fit { flex: none; width: 100%; transform-origin: center center; }
      .f-foot { display: flex; justify-content: space-between; align-items: center; gap: 2cqi; padding: 0 5cqi 3cqi; color: ${v('colorTextQuaternary')}; font-size: 1.2cqi; }
      .f-foot .rule { flex: 1; height: ${v('lineWidth')}; background: ${v('colorBorderSecondary')}; }

      .s-kicker { display: inline-flex; align-items: center; gap: 1.1cqi; text-transform: uppercase; letter-spacing: 0.18em; font-size: 1.3cqi; color: ${v('colorPrimaryInk')}; font-weight: ${v('fontWeightStrong')}; margin-bottom: 2cqi; }
      .s-kicker::before { content: ""; width: 2.6cqi; height: 0.32cqi; border-radius: 1cqi; background: ${v('colorPrimary')}; }
      .s-title { color: ${v('colorText')}; max-width: 82cqi; }
      .s-mega { color: ${v('colorText')}; }
      .s-lede { font-size: 1.95cqi; line-height: 1.5; color: ${v('colorTextSecondary')}; max-width: 66cqi; margin-top: 2.4cqi; }
      .s-note { font-size: 1.45cqi; line-height: 1.5; color: ${v('colorTextTertiary')}; max-width: 72cqi; margin-top: 2.4cqi; }

      .s-grid { display: grid; gap: 2cqi; margin-top: 3.6cqi; }
      .s-grid.two { grid-template-columns: 1fr 1fr; }
      .s-grid.three { grid-template-columns: repeat(3, 1fr); }
      .s-grid.four { grid-template-columns: repeat(4, 1fr); }
      .s-card { background: ${v('colorBgContainer')}; border: ${v('lineWidth')} solid ${v('colorBorderSecondary')}; border-radius: 1.4cqi; padding: 2.6cqi; min-width: 0; }
      .s-card h3 { margin-bottom: 1cqi; }
      .s-card p { font-size: 1.55cqi; line-height: 1.5; color: ${v('colorTextSecondary')}; }
      .s-num { font-family: var(--display-family); font-size: 3cqi; font-weight: ${v('fontWeightStrong')}; line-height: 1; color: ${v('colorPrimaryInk')}; margin-bottom: 1.2cqi; letter-spacing: -0.02em; }
      .s-pills { display: flex; flex-wrap: wrap; gap: 1.2cqi; margin-top: 3.6cqi; }
      .s-pill { display: inline-flex; align-items: center; gap: 1cqi; padding: 1.2cqi 2.2cqi; border-radius: 6cqi; border: ${v('lineWidth')} solid ${v('colorBorder')}; font-size: 1.75cqi; font-weight: ${v('fontWeightStrong')}; color: ${v('colorTextSecondary')}; }
      .s-pill .dot { width: 1cqi; height: 1cqi; border-radius: 50%; background: ${v('colorPrimary')}; }
      .s-person img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 1.2cqi; margin-bottom: 1.4cqi; }
      .s-person .nm { display: block; font-family: var(--display-family); font-weight: ${v('fontWeightStrong')}; font-size: 1.95cqi; letter-spacing: -0.01em; }
      .s-person .rl { display: block; font-size: 1.45cqi; color: ${v('colorPrimaryInk')}; margin-bottom: 0.8cqi; }
      .s-person .bi { font-size: 1.4cqi; line-height: 1.45; color: ${v('colorTextSecondary')}; }
      .s-plan .amt { font-family: var(--display-family); font-size: 4.4cqi; font-weight: ${v('fontWeightStrong')}; letter-spacing: -0.03em; line-height: 1; }
      .s-plan .per { font-size: 1.45cqi; color: ${v('colorTextTertiary')}; margin-top: 0.8cqi; }
      .s-plan h3 { font-size: 1.9cqi; margin-bottom: 1.4cqi; }
      .s-cta { display: inline-flex; align-items: center; height: 6cqi; padding: 0 3.4cqi; border-radius: 6cqi; background: ${v('colorPrimaryContrast')}; color: ${v('colorPrimary')}; font-family: var(--display-family); font-weight: ${v('fontWeightStrong')}; font-size: 2.1cqi; letter-spacing: -0.01em; margin-top: 3.4cqi; }
      .s-link { display: inline-block; margin-top: 2cqi; font-size: 1.6cqi; color: color-mix(in srgb, ${v('colorPrimaryContrast')} 86%, transparent); text-decoration: underline; }

      .deck-ui { position: fixed; right: 24px; bottom: 20px; z-index: 30; display: flex; align-items: center; gap: 10px; }
      .deck-ui button { width: 38px; height: 38px; border-radius: 50%; cursor: pointer; border: ${v('lineWidth')} solid ${v('colorBorder')}; background: ${v('colorBgContainer')}; color: ${v('colorTextSecondary')}; font-size: 15px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; }
      .deck-ui button:hover { border-color: ${v('colorPrimaryInk')}; color: ${v('colorPrimaryInk')}; }
      .deck-counter { font-size: 12px; color: ${v('colorTextTertiary')}; font-variant-numeric: tabular-nums; min-width: 48px; text-align: center; letter-spacing: 0.04em; }
      .deck-dots { position: fixed; left: 50%; transform: translateX(-50%); bottom: 26px; z-index: 30; display: flex; gap: 8px; }
      .deck-dot { width: 8px; height: 8px; border-radius: 50%; background: ${v('colorFill')}; cursor: pointer; border: 0; padding: 0; }
      .deck-dot.on { background: ${v('colorPrimary')}; transform: scale(1.3); }
      /* A 16:9 frame on a 390px screen renders every slide at about 5px: the deck keeps its
         proportions where a deck is presented, and becomes a readable stack on a phone. */
      @media (max-width: 720px) {
        .slide { height: auto; min-height: 100vh; padding: 12px; }
        .frame { width: 100%; aspect-ratio: auto; min-height: calc(100vh - 24px); container-type: normal; }
        .f-head { padding: 20px 20px 0; font-size: 12px; }
        .f-head .wm { font-size: 14px; }
        .f-body { padding: 24px 20px 76px; }
        .f-foot { padding: 0 20px 20px; font-size: 11px; }
        .s-kicker { font-size: 11px; margin-bottom: 12px; }
        .s-kicker::before { width: 18px; height: 2px; }
        .s-lede { font-size: 15px; margin-top: 14px; }
        .s-note { font-size: 12px; margin-top: 16px; }
        .s-grid, .s-grid.two, .s-grid.three, .s-grid.four { grid-template-columns: 1fr; gap: 12px; margin-top: 20px; }
        .s-card { padding: 16px; border-radius: 12px; }
        .s-card h3 { margin-bottom: 6px; }
        .s-card p { font-size: 14px; }
        .s-num { font-size: 20px; margin-bottom: 8px; }
        .s-pills { gap: 8px; margin-top: 20px; }
        .s-pill { font-size: 13px; padding: 8px 14px; }
        .s-pill .dot { width: 6px; height: 6px; }
        .s-person img { aspect-ratio: 3 / 2; margin-bottom: 10px; border-radius: 10px; }
        .s-person .nm { font-size: var(--text-base); }
        .s-person .rl { font-size: 13px; }
        .s-person .bi { font-size: 13px; }
        .s-plan .amt { font-size: 30px; }
        .s-plan .per { font-size: 13px; }
        .s-plan h3 { font-size: 16px; }
        .s-cta { height: 44px; padding: 0 22px; font-size: 15px; border-radius: 999px; margin-top: 20px; }
        .s-link { font-size: 14px; margin-top: 14px; }
        .deck-dots { display: none; }
      }
`

const DECK_SCRIPT = `
(function () {
  var deck = document.querySelector('.deck');
  var slides = [].slice.call(document.querySelectorAll('.slide'));
  var counter = document.querySelector('.deck-counter');
  var dots = [].slice.call(document.querySelectorAll('.deck-dot'));
  /* Slide offsets, not viewport multiples: below 640px a slide is a stack taller than the screen,
     and a viewport multiple then points into the middle of a different slide. */
  function top(i) { return slides[i].offsetTop - slides[0].offsetTop; }
  function current() {
    var best = 0, gap = Infinity;
    for (var i = 0; i < slides.length; i++) {
      var d = Math.abs(top(i) - deck.scrollTop);
      if (d < gap) { gap = d; best = i; }
    }
    return best;
  }
  function go(i) {
    var n = Math.max(0, Math.min(slides.length - 1, i));
    deck.scrollTo({ top: top(n), behavior: 'smooth' });
  }
  function sync() {
    var i = current();
    counter.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(slides.length).padStart(2, '0');
    dots.forEach(function (d, n) { d.classList.toggle('on', n === i); });
  }
  deck.addEventListener('scroll', sync, { passive: true });
  dots.forEach(function (d, n) { d.addEventListener('click', function () { go(n); }); });
  document.querySelector('[data-deck-prev]').addEventListener('click', function () { go(current() - 1); });
  document.querySelector('[data-deck-next]').addEventListener('click', function () { go(current() + 1); });
  addEventListener('keydown', function (e) {
    var keys = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 };
    if (e.key === 'Home') { go(0); e.preventDefault(); return; }
    if (e.key === 'End') { go(slides.length - 1); e.preventDefault(); return; }
    if (keys[e.key]) { go(current() + keys[e.key]); e.preventDefault(); }
  });
  /* Shrink-to-fit: no slide may clip its frame, whatever length the contract's copy has. */
  function fit() {
    slides.forEach(function (slide) {
      var box = slide.querySelector('.f-body');
      var layer = slide.querySelector('.f-fit');
      if (!box || !layer) return;
      layer.style.transform = 'none';
      var scale = Math.min(1, box.clientHeight / layer.scrollHeight);
      if (scale < 1) layer.style.transform = 'scale(' + scale.toFixed(4) + ')';
    });
  }
  addEventListener('resize', function () { fit(); sync(); });
  addEventListener('load', fit);
  fit();
  sync();
})();
`

function slide(index, total, { accent, surface, wordmark, disclosure, inner }) {
  const cls = `frame${accent ? ' frame--accent' : surface ? ' frame--surface' : ''}`
  return `      <section class="slide">
        <div class="${cls}">
          <div class="f-head"><span class="wm" data-field="company.name">${esc(wordmark)}</span><span class="rule"></span><span class="ix">${String(
            index
          ).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span></div>
          <div class="f-body"><div class="f-fit">
${inner}
          </div></div>
          <div class="f-foot"><span>${disclosure}</span><span class="rule"></span></div>
        </div>
      </section>`
}

export function renderDeck(fields, tokens, _brand, mode) {
  const wordmark = need(fields, 'company.name')
  const total = 11
  const shortDemo = 'Studio demo · illustrative content'
  const fullDisclosure = text(fields, 'disclosure', 'span')

  const slides = []
  slides.push(
    slide(1, total, {
      accent: true,
      wordmark,
      disclosure: fullDisclosure,
      inner: `            ${text(fields, 'cover.kicker', 'span', 'class="s-kicker"')}
            ${text(fields, 'cover.title', 'h1', 'class="s-mega"')}
            ${text(fields, 'cover.lede', 'p', 'class="s-lede"')}`
    })
  )
  slides.push(
    slide(2, total, {
      wordmark,
      disclosure: shortDemo,
      inner: `            ${text(fields, 'audience.kicker', 'span', 'class="s-kicker"')}
            ${text(fields, 'audience.title', 'h2', 'class="s-title"')}
            ${text(fields, 'audience.body', 'p', 'class="s-lede"')}`
    })
  )
  slides.push(
    slide(3, total, {
      surface: true,
      wordmark,
      disclosure: shortDemo,
      inner: `            ${text(fields, 'offer.kicker', 'span', 'class="s-kicker"')}
            ${text(fields, 'offer.title', 'h2', 'class="s-title"')}
            <div class="s-pills">
              ${[1, 2, 3, 4, 5, 6]
                .map(
                  (i) =>
                    `<span class="s-pill"><span class="dot"></span>${text(fields, `offer.item${i}`, 'span')}</span>`
                )
                .join('\n              ')}
            </div>`
    })
  )
  for (const [n, pair] of [
    [4, [1, 2]],
    [5, [3, 4]],
    [6, [5, 6]]
  ]) {
    slides.push(
      slide(n, total, {
        wordmark,
        disclosure: shortDemo,
        inner: `            <span class="s-kicker">Services ${pair[0]} and ${pair[1]} of 6</span>
            <div class="s-grid two">
              ${pair
                .map(
                  (i) => `<article class="s-card">
                <div class="s-num">${String(i).padStart(2, '0')}</div>
                ${text(fields, `service${i}.name`, 'h3')}
                ${text(fields, `service${i}.body`, 'p')}
              </article>`
                )
                .join('\n              ')}
            </div>`
      })
    )
  }
  slides.push(
    slide(7, total, {
      surface: true,
      wordmark,
      disclosure: shortDemo,
      inner: `            ${text(fields, 'product.kicker', 'span', 'class="s-kicker"')}
            ${text(fields, 'product.title', 'h2', 'class="s-title"')}
            ${text(fields, 'product.body', 'p', 'class="s-lede"')}`
    })
  )
  slides.push(
    slide(8, total, {
      wordmark,
      disclosure: shortDemo,
      inner: `            ${text(fields, 'process.kicker', 'span', 'class="s-kicker"')}
            ${text(fields, 'process.title', 'h2', 'class="s-title"')}
            <div class="s-grid four">
              ${[1, 2, 3, 4]
                .map(
                  (i) => `<article class="s-card">
                <div class="s-num">${String(i).padStart(2, '0')}</div>
                ${text(fields, `step${i}.name`, 'h3')}
                ${text(fields, `step${i}.body`, 'p')}
              </article>`
                )
                .join('\n              ')}
            </div>`
    })
  )
  slides.push(
    slide(9, total, {
      surface: true,
      wordmark,
      disclosure: shortDemo,
      inner: `            ${text(fields, 'team.kicker', 'span', 'class="s-kicker"')}
            ${text(fields, 'team.title', 'h2', 'class="s-title"')}
            <div class="s-grid four">
              ${[1, 2, 3, 4]
                .map(
                  (i) => `<article class="s-card s-person">
                <img ${attr(fields, `team${i}.image`, 'src')} ${attr(fields, `team${i}.image-alt`, 'alt')} />
                ${text(fields, `team${i}.name`, 'span', 'class="nm"')}
                ${text(fields, `team${i}.role`, 'span', 'class="rl"')}
                ${text(fields, `team${i}.bio`, 'p', 'class="bi"')}
              </article>`
                )
                .join('\n              ')}
            </div>`
    })
  )
  slides.push(
    slide(10, total, {
      wordmark,
      disclosure: shortDemo,
      inner: `            ${text(fields, 'pricing.kicker', 'span', 'class="s-kicker"')}
            ${text(fields, 'pricing.title', 'h2', 'class="s-title"')}
            <div class="s-grid three">
              ${[1, 2, 3]
                .map(
                  (i) => `<article class="s-card s-plan">
                ${text(fields, `plan${i}.name`, 'h3')}
                ${text(fields, `plan${i}.amount`, 'div', 'class="amt"')}
                ${text(fields, `plan${i}.period`, 'div', 'class="per"')}
              </article>`
                )
                .join('\n              ')}
            </div>
            ${text(fields, 'pricing.notice', 'p', 'class="s-note"')}`
    })
  )
  slides.push(
    slide(11, total, {
      accent: true,
      wordmark,
      disclosure: fullDisclosure,
      inner: `            ${text(fields, 'ask.kicker', 'span', 'class="s-kicker"')}
            ${text(fields, 'ask.title', 'h2', 'class="s-title"')}
            ${text(fields, 'ask.body', 'p', 'class="s-lede"')}
            <a class="s-cta" ${attr(fields, 'cta.href', 'href')}><span data-field="cta.label">${esc(
              need(fields, 'cta.label')
            )}</span></a>
            <a class="s-link" ${attr(fields, 'services.href', 'href')}><span data-field="services.label">${esc(
              need(fields, 'services.label')
            )}</span></a>`
    })
  )

  const body = `    <div class="deck">
${slides.join('\n')}
    </div>
    <div class="deck-dots">${slides
      .map((_, i) => `<button class="deck-dot${i === 0 ? ' on' : ''}" aria-label="Slide ${i + 1}"></button>`)
      .join('')}</div>
    <div class="deck-ui">
      <button data-deck-prev aria-label="Previous slide">&larr;</button>
      <span class="deck-counter">01 / ${String(total).padStart(2, '0')}</span>
      <button data-deck-next aria-label="Next slide">&rarr;</button>
    </div>`

  return documentShell({
    title: `${wordmark} — Deck`,
    tokens,
    body,
    css: DECK_CSS,
    script: DECK_SCRIPT,
    mode,
    scale: 'deck'
  })
}

// ─────────────────────────── form ───────────────────────────────────────────

const FORM_CSS = `
      .form-split { display: grid; grid-template-columns: 1fr 1fr; min-height: 100vh; }
      @media (max-width: 900px) { .form-split { grid-template-columns: 1fr; } }
      .form-brand { background: ${v('colorPrimary')}; color: ${v('colorPrimaryContrast')}; padding: clamp(32px, 5vw, 64px); display: flex; flex-direction: column; justify-content: space-between; gap: ${v('sizeXL')}; position: relative; overflow: hidden; }
      .form-brand h1 { color: ${v('colorPrimaryContrast')}; margin-bottom: ${v('sizeMD')}; }
      .form-brand .lede { color: color-mix(in srgb, ${v('colorPrimaryContrast')} 86%, transparent); font-size: ${v('fontSizeLG')}; line-height: 1.55; margin-bottom: ${v('sizeLG')}; }
      .form-brand ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: ${v('sizeSM')}; }
      .form-brand li { display: flex; gap: ${v('sizeSM')}; align-items: flex-start; color: color-mix(in srgb, ${v('colorPrimaryContrast')} 92%, transparent); line-height: 1.5; }
      .form-brand .wm { display: flex; align-items: center; gap: ${v('sizeSM')}; font-family: var(--display-family); font-weight: ${v('fontWeightStrong')}; font-size: ${v('fontSizeLG')}; }
      .form-brand .wm .dot { width: 10px; height: 10px; border-radius: 50%; background: ${v('colorPrimaryContrast')}; }
      .form-brand .aud { color: color-mix(in srgb, ${v('colorPrimaryContrast')} 72%, transparent); font-size: ${v('fontSizeSM')}; line-height: 1.5; }
      .form-side { display: flex; align-items: center; justify-content: center; padding: clamp(24px, 4vw, 64px); background: ${v('colorBgLayout')}; }
      .form-card { width: 100%; max-width: 520px; background: ${v('colorBgContainer')}; border: ${v('lineWidth')} solid ${v('colorBorderSecondary')}; border-radius: ${v('borderRadiusLG')}; padding: clamp(28px, 4vw, 44px); box-shadow: 0 24px 60px ${v('colorFillQuaternary')}; }
      .form-card h2 { margin-bottom: ${v('sizeXS')}; }
      .form-card .sub { color: ${v('colorTextTertiary')}; margin-bottom: ${v('sizeLG')}; }
      .fld { display: flex; flex-direction: column; gap: ${v('sizeXXS')}; margin-bottom: ${v('sizeLG')}; }
      .fld > label { font-size: ${v('fontSizeSM')}; font-weight: ${v('fontWeightStrong')}; color: ${v('colorText')}; }
      .fld input, .fld select, .fld textarea { box-sizing: border-box; width: 100%; font-family: ${v('fontFamily')}; font-size: ${v('fontSize')}; color: ${v('colorText')}; background: ${v('colorBgContainer')}; border: ${v('lineWidth')} solid ${v('colorBorder')}; border-radius: ${v('borderRadius')}; padding: 0 ${v('size')}; height: ${v('controlHeightLG')}; }
      .fld textarea { height: auto; padding: ${v('sizeSM')} ${v('size')}; resize: vertical; }
      .fld input:focus, .fld select:focus, .fld textarea:focus { outline: 2px solid ${v('colorPrimary')}; outline-offset: 1px; }
      .form-submit { display: flex; align-items: center; justify-content: center; width: 100%; height: ${v('controlHeightLG')}; border-radius: 999px; border: ${v('lineWidth')} dashed ${v('colorBorder')}; background: ${v('colorFillQuaternary')}; color: ${v('colorTextSecondary')}; font-family: ${v('fontFamily')}; font-size: ${v('fontSize')}; font-weight: ${v('fontWeightStrong')}; cursor: not-allowed; }
      .form-status { margin-top: ${v('sizeSM')}; font-size: ${v('fontSizeSM')}; line-height: 1.5; color: ${v('colorTextSecondary')}; }
      .form-real { margin-top: ${v('sizeLG')}; padding-top: ${v('sizeLG')}; border-top: ${v('lineWidth')} solid ${v('colorBorderSecondary')}; display: flex; flex-direction: column; gap: ${v('sizeSM')}; align-items: flex-start; }
`

/** No action, no success state: a sample must never look like it delivered a message. */
const FORM_SCRIPT = `
(function () {
  var form = document.querySelector('[data-sample-form]');
  if (!form) return;
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    form.querySelector('[data-form-status]').hidden = false;
  });
})();
`

export function renderForm(fields, tokens, _brand, mode) {
  const body = `    <div class="form-split">
      <div class="form-brand">
        <span class="wm"><span class="dot"></span>${text(fields, 'panel.wordmark', 'span')}</span>
        <div style="max-width:46ch;">
          ${text(fields, 'panel.title', 'h1')}
          ${text(fields, 'panel.blurb', 'p', 'class="lede"')}
          <ul>
            ${[1, 2, 3]
              .map(
                (i) =>
                  `<li><svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" style="flex:0 0 auto;margin-top:4px;"><path d="M3.5 9.5L7 13l7.5-8" stroke="${v(
                    'colorPrimaryContrast'
                  )}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>${text(
                    fields,
                    `panel.reason${i}`,
                    'span'
                  )}</li>`
              )
              .join('\n            ')}
          </ul>
        </div>
        ${text(fields, 'panel.audience', 'p', 'class="aud"')}
      </div>

      <div class="form-side">
        <div class="form-card">
          ${text(fields, 'form.title', 'h2')}
          ${text(fields, 'form.sub', 'p', 'class="sub"')}

          <form data-sample-form>
            <div class="fld">
              ${text(fields, 'field.name.label', 'label', 'for="sample-name"')}
              <input id="sample-name" type="text" autocomplete="off" />
            </div>
            <div class="fld">
              ${text(fields, 'field.email.label', 'label', 'for="sample-email"')}
              <input id="sample-email" type="email" autocomplete="off" />
            </div>
            <div class="fld">
              ${text(fields, 'field.topic.label', 'label', 'for="sample-topic"')}
              <select id="sample-topic">
                <option value="" selected disabled data-field="field.topic.prompt">${esc(
                  need(fields, 'field.topic.prompt')
                )}</option>
                ${[1, 2, 3, 4]
                  .map((i) => text(fields, `field.topic.option${i}`, 'option'))
                  .join('\n                ')}
              </select>
            </div>
            <div class="fld">
              ${text(fields, 'field.message.label', 'label', 'for="sample-message"')}
              <textarea id="sample-message" rows="4"></textarea>
            </div>
            <button class="form-submit" type="submit"><span data-field="submit.label">${esc(
              need(fields, 'submit.label')
            )}</span></button>
            ${text(fields, 'notice.recipient', 'p', 'class="form-status"')}
            ${text(
              fields,
              'notice.preview',
              'p',
              'class="form-status" data-form-status role="status" aria-live="polite" hidden'
            )}
          </form>

          <div class="form-real">
            ${ctaButton(fields)}
            ${text(fields, 'disclosure', 'p', 'class="disclosure"')}
          </div>
        </div>
      </div>
    </div>`

  return documentShell({
    title: `${need(fields, 'panel.wordmark')} — Enquiry form`,
    tokens,
    body,
    css: FORM_CSS,
    script: FORM_SCRIPT,
    mode
  })
}

// ─────────────────────────── typography ─────────────────────────────────────

const TYPE_CSS = `
      .t-wrap { max-width: 960px; margin: 0 auto; padding: clamp(28px, 6vw, 72px) clamp(20px, 4vw, 40px) 96px; }
      .t-head { padding-bottom: ${v('sizeXL')}; border-bottom: ${v('lineWidth')} solid ${v('colorBorderSecondary')}; margin-bottom: ${v('sizeXXL')}; }
      .t-name { letter-spacing: var(--tracking-display); }
      .t-tag { margin-top: ${v('sizeSM')}; font-size: ${v('fontSizeLG')}; color: ${v('colorTextSecondary')}; max-width: 52ch; }
      .t-sec { margin-bottom: ${v('sizeXXL')}; }
      .t-sec > h2 { margin-bottom: ${v('sizeLG')}; }
      .t-row { display: grid; grid-template-columns: 9rem 1fr; gap: ${v('sizeMD')}; align-items: baseline; padding: ${v('sizeSM')} 0; border-top: ${v('lineWidth')} solid ${v('colorBorderSecondary')}; }
      .t-meta { font-family: ${v('fontFamilyCode')}; font-size: ${v('fontSizeSM')}; color: ${v('colorTextTertiary')}; }
      /* Specimen rows are paragraphs, not headings: a type specimen shows the ladder, it does not
         structure the document, and a fake <h1> would have to obey the artifact headline role and
         so could never show the display step. */
      .t-spec { font-family: var(--font-display-stack); font-weight: 700; line-height: var(--leading-tight); letter-spacing: var(--tracking-display); }
      .t-display { font-size: var(--text-4xl); }
      .t-page { font-size: var(--text-3xl); }
      .t-section { font-size: var(--text-2xl); }
      .t-card { font-size: var(--text-xl); }
      .t-lg { font-size: var(--text-lg); line-height: var(--leading-body); }
      .t-base { font-size: var(--text-base); line-height: var(--leading-body); }
      .t-sm { font-size: var(--text-sm); line-height: var(--leading-body); color: ${v('colorTextSecondary')}; }
      .t-faces { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: ${v('sizeMD')}; }
      .t-face { padding: ${v('sizeLG')}; background: ${v('colorBgContainer')}; border: ${v('lineWidth')} solid ${v('colorBorderSecondary')}; border-radius: ${v('borderRadiusLG')}; }
      .t-face .glyphs { font-size: var(--text-xl); line-height: 1.1; margin-bottom: ${v('sizeSM')}; overflow-wrap: anywhere; }
      .t-face.display .glyphs { font-family: var(--display-family); font-weight: ${v('fontWeightStrong')}; }
      .t-face.body .glyphs { font-family: ${v('fontFamily')}; }
      .t-face.mono .glyphs { font-family: ${v('fontFamilyCode')}; }
      .t-swatches { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: ${v('sizeMD')}; }
      .t-swatch { border: ${v('lineWidth')} solid ${v('colorBorderSecondary')}; border-radius: ${v('borderRadiusLG')}; overflow: hidden; background: ${v('colorBgContainer')}; }
      .t-swatch .chip { height: 72px; }
      .t-swatch .label { padding: ${v('sizeSM')} ${v('sizeMD')}; }
      .t-swatch .label strong { display: block; font-size: ${v('fontSizeSM')}; }
      .t-ladder { display: flex; align-items: flex-end; gap: ${v('sizeSM')}; flex-wrap: wrap; }
      .t-step { background: ${v('colorPrimary')}; opacity: .85; border-radius: ${v('borderRadiusXS')}; }
      .t-radii { display: flex; gap: ${v('sizeMD')}; flex-wrap: wrap; margin-top: ${v('sizeLG')}; }
      .t-radius { width: 88px; height: 56px; border: 2px solid ${v('colorPrimary')}; display: grid; place-items: center; font-family: ${v('fontFamilyCode')}; font-size: ${v('fontSizeSM')}; color: ${v('colorTextSecondary')}; }
      .t-voice { display: flex; flex-direction: column; gap: ${v('sizeSM')}; max-width: 72ch; }
      .t-voice li { display: flex; gap: ${v('sizeSM')}; align-items: flex-start; color: ${v('colorTextSecondary')}; line-height: 1.55; }
      .t-voice li::before { content: ""; flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: ${v('colorPrimary')}; margin-top: 8px; }
      .t-source { margin-top: ${v('sizeLG')}; padding-top: ${v('sizeLG')}; border-top: ${v('lineWidth')} solid ${v('colorBorderSecondary')}; }
      /* A display specimen at 80px cannot share a 144px label column on a 390px screen, and an
         overflowing document makes Chrome report a zoomed-out viewport — the measurement of every
         other property on the page goes with it. */
      @media (max-width: 639px) {
        .t-wrap { padding-left: 16px; padding-right: 16px; }
        .t-row { grid-template-columns: 1fr; gap: 4px; }
        .t-spec, .t-lg, .t-base, .t-sm { overflow-wrap: anywhere; }
        .t-face .glyphs { overflow-wrap: anywhere; }
        /* The site publishes phone steps for the three largest roles; a specimen that showed the
           desktop step on a phone would document a size this design system never uses there. */
        .t-display { font-size: var(--text-4xl-phone); }
        .t-page { font-size: var(--text-4xl-phone); }
        .t-section { font-size: var(--text-3xl-phone); }
        .t-card { font-size: var(--text-2xl-phone); }
      }
`

export function renderTypographySpecimen(fields, tokens, brand, mode) {
  const display = 'SF Pro Display'
  const bodyFace = 'SF Pro Text'
  const mono = 'SF Mono'

  const specimen = `      <section class="t-sec">
        <h2>Type scale</h2>
        <div class="t-row"><span class="t-meta">Display · ${SITE_SCALE['--text-4xl']} / ${SITE_SCALE['--text-4xl-phone']}</span>${text(
          fields,
          'specimen.display',
          'p',
          'class="t-spec t-display"'
        )}</div>
        <div class="t-row"><span class="t-meta">Page title · ${SITE_SCALE['--text-3xl']} / ${SITE_SCALE['--text-4xl-phone']}</span>${text(
          fields,
          'specimen.page',
          'p',
          'class="t-spec t-page"'
        )}</div>
        <div class="t-row"><span class="t-meta">Section · ${SITE_SCALE['--text-2xl']} / ${SITE_SCALE['--text-3xl-phone']}</span>${text(
          fields,
          'specimen.section',
          'p',
          'class="t-spec t-section"'
        )}</div>
        <div class="t-row"><span class="t-meta">Card · ${SITE_SCALE['--text-xl']} / ${SITE_SCALE['--text-2xl-phone']}</span>${text(
          fields,
          'specimen.card',
          'p',
          'class="t-spec t-card"'
        )}</div>
        <div class="t-row"><span class="t-meta">Lead · ${SITE_SCALE['--text-lg']}</span>${text(
          fields,
          'specimen.lead',
          'p',
          'class="t-lg"'
        )}</div>
        <div class="t-row"><span class="t-meta">Body · ${SITE_SCALE['--text-base']}</span>${text(
          fields,
          'specimen.body',
          'p',
          'class="t-base"'
        )}</div>
        <div class="t-row"><span class="t-meta">Caption · ${SITE_SCALE['--text-sm']}</span>${text(
          fields,
          'specimen.caption',
          'p',
          'class="t-sm"'
        )}</div>
      </section>`

  const faces = `      <section class="t-sec">
        <h2>Faces</h2>
        <div class="t-faces">
          <div class="t-face display"><div class="glyphs">Aa Bb Qq 0123</div><strong>${esc(
            display
          )}</strong><p class="t-sm">Display · headings, 400 / 700</p></div>
          <div class="t-face body"><div class="glyphs">Aa Bb Qq 0123</div><strong>${esc(
            bodyFace
          )}</strong><p class="t-sm">Body · paragraphs and UI, 400 / 700</p></div>
          <div class="t-face mono"><div class="glyphs">Aa Bb Qq 0123</div><strong>${esc(
            mono
          )}</strong><p class="t-sm">Mono · code, tabular figures</p></div>
        </div>
      </section>`

  const swatches = [
    ['Background', '--bg', 'page canvas'],
    ['Surface', '--surface', 'cards and raised surfaces'],
    ['Foreground', '--fg', 'body text'],
    ['Muted', '--muted', 'secondary text'],
    ['Border', '--border', 'hairlines and dividers'],
    ['Accent', '--accent', 'primary actions'],
    ['Accent on', '--accent-on', 'text on an accent surface']
  ]
    .map(
      ([name, token, usage]) =>
        `          <div class="t-swatch"><div class="chip" style="background:var(${token})"></div><div class="label"><strong>${esc(
          name
        )}</strong><span class="t-meta">${esc(token)}</span><p class="t-sm">${esc(usage)}</p></div></div>`
    )
    .join('\n')

  const steps = [1, 2, 3, 4, 5, 6, 8, 12].map((step) => Number.parseInt(SITE_SCALE[`--space-${step}`], 10))
  const ladder = steps
    .map((step) => `<span class="t-step" style="width:${step}px;height:${step}px;" title="${step}px"></span>`)
    .join('')
  const radii = [
    ['sm', SITE_SCALE['--radius-sm']],
    ['md', SITE_SCALE['--radius-md']],
    ['lg', SITE_SCALE['--radius-lg']],
    ['pill', SITE_SCALE['--radius-pill']]
  ]
    .map(
      ([label, value]) => `<span class="t-radius" style="border-radius:${value};">${label} ${value}</span>`
    )
    .join('')

  const body = `    <div class="t-wrap">
      <header class="t-head">
        <span class="kicker">Design language</span>
        ${text(fields, 'title', 'h1', 'class="t-name" style="margin-top:12px;"')}
        ${text(fields, 'summary', 'p', 'class="t-tag"')}
      </header>
${specimen}
${faces}
      <section class="t-sec">
        <h2>Colour roles</h2>
        <div class="t-swatches">
${swatches}
        </div>
      </section>
      <section class="t-sec">
        <h2>Spacing and radius</h2>
        <div class="t-ladder">${ladder}</div>
        <p class="t-sm" style="margin-top:12px;">${steps.map((step) => `${step}px`).join(' · ')}</p>
        <div class="t-radii">${radii}</div>
      </section>
      <section class="t-sec">
        ${text(fields, 'voice.title', 'h2')}
        <ul class="t-voice" style="list-style:none;padding:0;">
          <li>${text(fields, 'voice.rule1', 'span')}</li>
          <li>${text(fields, 'voice.rule2', 'span')}</li>
          <li>${text(fields, 'voice.rule3', 'span')}</li>
        </ul>
        ${text(fields, 'services.summary', 'p', `class="t-sm" style="margin-top:${v('sizeLG')};"`)}
        <div class="t-source">
          ${text(fields, 'company.name', 'p', `style="font-weight:${v('fontWeightStrong')};margin-bottom:6px;"`)}
          ${text(fields, 'disclosure', 'p', 'class="disclosure"')}
          <p class="t-sm" style="margin-top:10px;">Type, colour and spacing follow the ${esc(
            brand.name
          )} design inspiration from Tracy's design library.</p>
        </div>
      </section>
    </div>`

  return documentShell({ title: need(fields, 'title'), tokens, body, css: TYPE_CSS, mode })
}

export const RENDERERS = {
  newsletter: renderNewsletter,
  email: renderEmail,
  poster: renderPoster,
  deck: renderDeck,
  form: renderForm,
  typography: renderTypographySpecimen
}
