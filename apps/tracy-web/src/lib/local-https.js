/** Redirect local browser bookmarks only; internal calls and customer hostnames keep their routes. */
export function localHttpsNavigation(config) {
  const target = new URL(config.origin)
  return async (c, next) => {
    const documentDoor =
      /^(?:\/|\/widget\/?|\/login\/?|\/signin(?:\/[^/]+)?\/?|\/new\/?|\/ops(?:\/[^/]+)?\/?)$/.test(c.req.path)
    const browserDocument =
      (c.req.header('sec-fetch-mode') === 'navigate' && c.req.header('sec-fetch-dest') === 'document') ||
      (documentDoor &&
        /Mozilla\//.test(c.req.header('user-agent') || '') &&
        (c.req.header('accept') || '').includes('text/html'))
    if (
      target.protocol === 'https:' &&
      target.hostname === 'tracy.test' &&
      c.req.header('host') === 'tracy.test:8080' &&
      ['GET', 'HEAD'].includes(c.req.method) &&
      c.req.header('x-forwarded-proto') !== 'https' &&
      documentDoor &&
      browserDocument
    ) {
      const source = new URL(c.req.url)
      const destination = new URL(target.origin)
      destination.pathname = source.pathname
      destination.search = source.search
      return c.redirect(destination.href, 308)
    }
    await next()
  }
}
