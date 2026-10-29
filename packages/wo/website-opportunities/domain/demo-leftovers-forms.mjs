// C21 of the demo-leftover check (spec TracyHQ/tracy#189): a visible form that leads nowhere for this business. A sign-up
// form (an email field, no message box) with no email-marketing account in the brief, a login form, or any form whose action
// is empty, `#` or a script. The site's contact form (a message box), a search and a form of a destination the brief holds
// are never reported. Read from the served HTML, so a block taken off the page is simply not there. Coverage: basic (forms
// drawn by script after the page loads are not in the served HTML).

const FORM = /<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi
const attrOf = (attrs, name) =>
  attrs.match(new RegExp(`\\s${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))?.[2]?.trim() ?? null
const words = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * @param {{served: Array<{path: string, html: string}>, destinations?: {newsletter?: boolean}}} ctx
 * @returns {Array<{page: string, place: string, found: string}>}
 */
export function formLeftovers(ctx) {
  const out = []
  for (const page of ctx.served)
    for (const [, attrs, inner] of page.html.matchAll(FORM)) {
      const action = attrOf(attrs, 'action')
      const body = inner.toLowerCase()
      const search =
        /role\s*=\s*["']?search/i.test(attrs) ||
        /type\s*=\s*["']?search/.test(body) ||
        /search|finder/i.test(action ?? '')
      if (search) continue
      const dead = action === null || action === '' || action === '#' || /^javascript:/i.test(action)
      const message = /<textarea\b/.test(body)
      const email = /type\s*=\s*["']?email/.test(body) || /name\s*=\s*["'][^"']*e-?mail/.test(body)
      const login = /type\s*=\s*["']?password/.test(body)
      const signup = email && !message && !login
      const found = words(inner).slice(0, 60) || (action ?? 'form')
      const place = `form[action="${action ?? ''}"]`
      if (dead && !message) out.push({ page: page.path, place, found })
      else if (login) out.push({ page: page.path, place, found })
      else if (signup && !ctx.destinations?.newsletter) out.push({ page: page.path, place, found })
    }
  return out
}
