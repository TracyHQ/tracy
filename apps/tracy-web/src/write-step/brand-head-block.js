// The tab icons in the kit's head injection block, a free-HTML block on every page: link tags between two markers, so a
// rewrite replaces the block instead of adding to it. The optional CSS shows the phone menu's own picture when the
// template's site profile has no small-logo settings.
export const HEAD_START = '<!-- tracy-brand-head:start -->'
export const HEAD_END = '<!-- tracy-brand-head:end -->'

const attr = (s) => String(s).replace(/[^\w./:-]/g, '')
const url = (p) => `/${attr(p).replace(/^\/+/, '')}`

const LINKS = {
  ico: (p) => `<link rel="shortcut icon" type="image/x-icon" href="${url(p)}">`,
  png32: (p) => `<link rel="icon" type="image/png" sizes="32x32" href="${url(p)}">`,
  png512: (p) => `<link rel="icon" type="image/png" sizes="512x512" href="${url(p)}">`,
  phone180: (p) => `<link rel="apple-touch-icon" sizes="180x180" href="${url(p)}">`
}

/** @param {Record<string, string>} paths site path by link name; @param {string | null} [menuCss] */
export function headBlock(paths, menuCss = null) {
  return [
    HEAD_START,
    ...Object.keys(LINKS)
      .filter((name) => paths[name])
      .map((name) => LINKS[name](paths[name])),
    `<style>${menuThemeCss}${menuCss ?? ''}</style>`,
    HEAD_END
  ].join('\n')
}

/** `content` with the block put in place of an earlier one, or added at the end. */
export function withBlock(content, block) {
  const text = String(content ?? '')
  const from = text.indexOf(HEAD_START)
  const to = text.indexOf(HEAD_END)
  if (from !== -1 && to > from) return text.slice(0, from) + block + text.slice(to + HEAD_END.length)
  return text === '' ? block : `${text}\n${block}`
}

/** The CSS that shows a picture in the phone menu when the profile has no small-logo settings. */
export const menuCssFor = ({ light, dark }) =>
  `.offcanvas .navbar-brand img,.t4-off-canvas-body .navbar-brand img,.t4-offcanvas .navbar-brand img{content:url(${url(light ?? dark)});height:auto}` +
  (dark && light
    ? `.dark-active .offcanvas .navbar-brand img,.dark-active .t4-offcanvas .navbar-brand img{content:url(${url(dark)})}`
    : '')

// Bootstrap's d-block helper on T4's phone logo wrappers overrides the theme's normal d-dark/d-light rule.
// Keep exactly the active theme's logo visible, including inside the off-canvas header without navbar-brand.
export const menuThemeCss =
  '.t4-offcanvas .t4-off-canvas-header .d-dark{display:none!important}' +
  '.dark-active .t4-offcanvas .t4-off-canvas-header .d-light{display:none!important}' +
  '@media(max-width:575.98px){.dark-active .t4-offcanvas .t4-off-canvas-header .d-dark.d-block{display:block!important}}' +
  '@media(min-width:576px){.dark-active .t4-offcanvas .t4-off-canvas-header .d-dark.d-sm-block{display:block!important}}'
