/** Explicit Tracy doors used by the native creation surface; this is not a general authenticated proxy. */
const READ = new Set([
  '/auth/me',
  '/api/sites',
  '/api/team',
  '/api/templates',
  '/api/design-system/library',
  '/api/design-system/support',
  '/api/design-system/preview',
  '/api/sites/questions',
  '/api/sites/design-plan'
])
const WRITE = new Set(['/api/sites', '/api/sites/claim', '/api/sites/wizard', '/api/sites/brief/rewrite'])
const SITE = '[a-z0-9][a-z0-9.-]*'
const ID = '[A-Za-z0-9_-]+'
const read = new RegExp(`^/api/sites/${SITE}/(?:jobs/${ID}|press)$`)
const write = new RegExp(`^/api/sites/${SITE}/(?:agent|design-system)$`)
// Encoded dot, slash or backslash and dot segments are refused in the PATH only: a query value carries a slash as %2F
// (URLSearchParams on the quickstart tag quickstart/ja-kinetic/j6, the Design system support and preview doors).
export function nativeBackendPath(method, rawPath) {
  if (
    typeof rawPath !== 'string' ||
    !rawPath.startsWith('/') ||
    rawPath.startsWith('//') ||
    /\\|#/.test(rawPath)
  )
    return null
  const query = rawPath.indexOf('?')
  if (/%(?:2e|2f|5c)|\/\.\.?\//i.test(query === -1 ? rawPath : rawPath.slice(0, query))) return null
  const url = new URL(rawPath, 'https://tracy.invalid')
  const allowed = ['GET', 'HEAD'].includes(method)
    ? READ.has(url.pathname) || read.test(url.pathname)
    : method === 'POST' && (WRITE.has(url.pathname) || write.test(url.pathname))
  return allowed ? url.pathname + url.search : null
}
