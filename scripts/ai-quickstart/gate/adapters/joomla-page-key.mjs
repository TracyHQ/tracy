// The Joomla page key of template quality (ticket #586): which template page a rendered page is, read from the classes
// Joomla and its templates print on the body element: the component (`com_content`), its view (`view-article`) and the
// layout of the template style (`layout-default`, `layout-home`). Two sites of the same template whose addresses differ
// give the same key to the same kind of page, so a quality failure is compared with the same page of the untouched
// template. Null when the page prints none of them. Pure.

const PART = /^(?:com_[a-z0-9_]+|view-[a-z0-9_-]+|layout-[a-z0-9_-]+)$/i

/** The page key of a page's markup, or null. */
export function joomlaPageKey(html) {
  const body = /<body\b[^>]*\bclass\s*=\s*(["'])([^"']*)\1/i.exec(String(html ?? ''))
  if (!body) return null
  const parts = [...new Set(body[2].split(/\s+/).filter((c) => PART.test(c)))].sort()
  return parts.length ? parts.join(' ') : null
}
