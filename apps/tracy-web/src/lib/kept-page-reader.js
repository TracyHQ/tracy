/**
 * One served-route resolver for post-build page scanners. Kept paths describe pages, while Joomla can serve those pages
 * under /index.php/. Prefer a route the home page actually links to; retain clean URLs and never rewrite asset reads.
 * Failures retain the planned path and attempted routes so a scanner cannot silently report an unread page as clean.
 */
export function keptPageReader(readPage) {
  const cache = new Map()
  const routes = new Map()
  const key = (path) => path.replace(/^\/index\.php(?=\/)/, '').replace(/\/+$/, '') || '/'
  const read = (path) => {
    if (!cache.has(path))
      cache.set(
        path,
        Promise.resolve()
          .then(() => readPage(path))
          .catch(() => null)
      )
    return cache.get(path)
  }
  let home
  let indexRoutes = false
  const discover = async () => {
    home ??= read('/').then((page) => {
      if (page?.status !== 200) return
      for (const [, href] of String(page.html).matchAll(/<a\b[^>]*\shref\s*=\s*["']([^"'#]+)["']/gi)) {
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href) || href.includes('?')) continue
        const route = href.startsWith('/') ? href : `/${href}`
        if (route.startsWith('/index.php/')) indexRoutes = true
        routes.set(key(route), route)
      }
    })
    await home
  }
  return async (path) => {
    await discover()
    const wanted = `/${String(path).replace(/^\/+/, '')}`
    const candidates = [
      ...new Set(
        [
          routes.get(key(wanted)),
          wanted,
          ...(indexRoutes && wanted !== '/' && !/^\/index\.php\b/.test(wanted) && !/[?#]/.test(wanted)
            ? [`/index.php${wanted}`]
            : [])
        ].filter(Boolean)
      )
    ]
    let last = null
    const attempts = []
    for (const route of candidates) {
      const page = await read(route)
      attempts.push({ path: route, status: page?.status ?? null })
      if (page?.status === 200 && String(page.html ?? '').trim())
        return { ...page, servedPath: route, attempts }
      if (page) last = page
      if (page?.status >= 500) break
    }
    return { status: last?.status ?? null, html: '', servedPath: null, attempts }
  }
}
