/**
 * A same-origin path+query to redirect to, resolved against `origin` — never the raw input.
 *
 * Lives in `lib/` (not `identity/`, where it was written) so more than one domain can call the
 * SAME sanitizer instead of growing a second one: `identity/route.js`'s `/login` page and its
 * `/signin/:provider` door were the original callers and still re-export it for their own
 * existing importers; `seats/pages.js`'s `joinPage` needs it too (review round 2, finding 3 — the
 * "Accept invitation" button's `next` destination), and `module-graph.test.mjs` forbids a domain
 * directory importing another domain directly (`identity/` included), so the shared function has
 * to live where both are allowed to reach it.
 *
 * Fix round 1 (Critical, original identity/route.js history): the previous version was a prefix
 * blocklist — `raw.startsWith('/') && !raw.startsWith('//')` — and blocklists of this shape
 * always have one more prefix waiting behind the ones already caught. `//evil.com` was refused,
 * but `/\evil.com` was not: the WHATWG URL parser treats a backslash exactly like a forward slash
 * when resolving a relative reference against an http(s) base
 * (`new URL('/\\evil.com', 'http://tracy.test').href` is `'http://evil.com/'` — confirmed live in
 * review, and reproduced in `oauth.test.mjs`), so a value the old check accepted still carried a
 * freshly-signed-in browser straight to an attacker's origin. Parsing `raw` against the app's own
 * origin with the SAME parser a browser uses, then checking the RESULT's origin, asks the one
 * question that actually matters — "does this still point at us?" — instead of enumerating every
 * spelling of "it doesn't" (a leading `\`, `/\/`, `\\`, a stray tab/newline before the slashes, a
 * percent-encoded variant, ...). Returns the resolved path-and-query, never the untouched `raw`
 * string, so a same-origin match that the parser reshaped (whitespace stripped, `\` folded to
 * `/`) can't smuggle anything through either.
 */
export function safePath(raw, origin) {
  let resolved
  try {
    resolved = new URL(typeof raw === 'string' ? raw : '', origin)
  } catch {
    return `${origin}/`
  }
  // Fix round 2: the origin check alone is not enough — it proves `raw` RESOLVES to our origin,
  // not that the STRING we hand back can only ever resolve there again. `.//evil.com` and
  // `/..//evil.com` both resolve correctly (a relative reference has no authority of its own to
  // fool the check with), but the WHATWG dot-segment algorithm reduces their `pathname` to the
  // literal text `//evil.com` — a safe RESULT, but an unsafe STRING, because the places this
  // value is handed to next (a redirect's `Location` header, a client-side `location.href=`)
  // each resolve it AGAIN with no memory that it was ever checked. A bare value starting with
  // `//` is scheme-relative to every browser, full stop — reflecting the resolved path back as a
  // fragment for a second parser to reinterpret is exactly the bug.
  //
  // The fix returns an ABSOLUTE same-origin URL instead of a relative path. An absolute URL has
  // its own scheme and authority already fixed in the string — there is no second resolution step
  // left for a `//`-shaped pathname to be mistaken for a fresh one; whatever comes after `origin`
  // is unambiguously a path on THIS origin, however it is later consumed. This closes the whole
  // class ("a checked value re-resolved somewhere that forgot it was checked"), not just the one
  // shape of it a `pathname` blocklist would catch.
  return resolved.origin === new URL(origin).origin
    ? `${resolved.origin}${resolved.pathname}${resolved.search}`
    : `${origin}/`
}
