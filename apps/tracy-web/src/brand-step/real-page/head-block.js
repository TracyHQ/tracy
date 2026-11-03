// The head injection block of the kit (kit site.head.injection: a free-HTML block on every page): the tab icons the
// favicon set needs (PNG 32, PNG 512, phone icon 180, and the .ico) as link tags between two markers, so a rerun
// replaces the block instead of adding to it. The optional CSS is the fallback for a template that ignores the T4
// small-logo settings (#322).
export const HEAD_START = '<!-- tracy-brand-head:start -->'
export const HEAD_END = '<!-- tracy-brand-head:end -->'

const attr = (s) => String(s).replace(/[^\w./:-]/g, '')

/** @param {{ ico: string, png32: string, png512: string, phone180: string, menuCss?: string | null }} paths site paths */
export function headBlock({ ico, png32, png512, phone180, menuCss = null }) {
  const u = (p) => `/${attr(p).replace(/^\/+/, '')}`
  return [
    HEAD_START,
    `<link rel="shortcut icon" type="image/x-icon" href="${u(ico)}">`,
    `<link rel="icon" type="image/png" sizes="32x32" href="${u(png32)}">`,
    `<link rel="icon" type="image/png" sizes="512x512" href="${u(png512)}">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="${u(phone180)}">`,
    ...(menuCss ? [`<style>${menuCss}</style>`] : []),
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

/** The CSS that shows a picture in the phone menu when the template ignores the small-logo settings. */
export const menuCssFor = (paths) =>
  `.offcanvas .navbar-brand img,.t4-off-canvas-body .navbar-brand img,.t4-offcanvas .navbar-brand img{content:url(/${attr(paths.light ?? paths.dark).replace(/^\/+/, '')});height:auto}` +
  (paths.dark && paths.light
    ? `.dark-active .offcanvas .navbar-brand img,.dark-active .t4-offcanvas .navbar-brand img{content:url(/${attr(paths.dark).replace(/^\/+/, '')})}`
    : '')

/** The module id the kit's head block lives in ("block-170" → 170), or null. */
export const headModuleId = (kit) => {
  const m = /^block-(\d+)$/.exec(String(kit?.site?.head?.injection?.position?.block ?? ''))
  return m ? Number(m[1]) : null
}
