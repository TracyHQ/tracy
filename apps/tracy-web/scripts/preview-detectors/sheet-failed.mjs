/**
 * Stylesheets of the preview that did not load (PR 2, 14/10/2026: every fleet01 stylesheet answered 502
 * through the asset door and the popup showed the page unstyled). In the page: every
 * `<link rel="stylesheet">` the worn page asks for whose sheet never arrived (no sheet, or its resource
 * answered 400 or more, 404 aside: Chrome keeps an empty sheet for an error answer, and a 404 is a file
 * the demo itself has not got). A finding is one such sheet.
 *
 * The measuring machine reads stylesheets through its own copy of the asset door, so this catches a
 * demo that cannot serve a sheet; a broken product door is caught on the server itself
 * (`src/lib/preview-door-health.js`), which this machine cannot see.
 */
export const kind = 'sheet-failed'

export const probe = `(() => {
  // a sheet answered with an error: Chrome keeps an empty sheet, so its resource entry's status says it
  const status = new Map(performance.getEntriesByType('resource').map((e) => [e.name, e.responseStatus || 0]))
  return [...document.querySelectorAll('link[rel~="stylesheet"][href]')]
    .filter((l) => !l.disabled && (!l.media || matchMedia(l.media).matches))
    // 404: the demo itself has no such file (the asset door passes its 404 on), not a preview failure
    .filter((l) => { const st = status.get(l.href) ?? 200; return st !== 404 && (!l.sheet || st >= 400) })
    .map((l) => { let p = l.getAttribute('href') || ''; try { const u = new URL(l.href); p = u.searchParams.get('path') || u.pathname } catch {} return p })
    .slice(0, 40)
})()`

/** @param {{ worn: any }} input */
export function detect({ worn }) {
  const findings = [...new Set(worn?.data ?? [])].map((path) => ({ at: `link ${path}` }))
  return { count: findings.length, findings }
}
