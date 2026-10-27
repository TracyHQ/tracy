/**
 * Validate and normalise the URL a customer pastes as their design-reference site.
 *
 * 🔒 PURE JAVASCRIPT, NOT TYPESCRIPT — same reason as `site-label.mjs`: the validation rules
 * must be copyable verbatim to other boundaries without a compile step. Any change here is a
 * vocabulary change; read `vocabulary.md` §2 before touching the refusal strings.
 *
 * Three refusal reasons, each a distinct sentence in the UI:
 *   shape  — not a recognisable URL or hostname (no http/https scheme after normalisation, host
 *            has no dot, or a non-http scheme was given explicitly)
 *   local  — a loopback, RFC 1918 address, `localhost`, `*.local`, or `*.internal` — anything
 *            that resolves only inside a private network. Mirrors the host-rule of
 *            `packages/design/tracy-brand-engine/src/host/pipeline.mjs` `brandHostOf`.
 *   tracy  — `*.<zone>` or `<zone>` itself — a Tracy lane is not a site to fork from.
 *
 * `null` means "accept".
 *
 * `zone` (Task 11) defaults to `'tracy.ai'` — production's own value — but is a parameter, not a
 * constant: the caller reads the deployment's real zone from `tracyConfig().siteDomain` and
 * passes it in, the same shape `apps/tracy-web/src/sites/label.js`'s `fleetLabel(siteKey, zone)`
 * already takes on the server side.
 */

/** Matches a purely numeric dotted-quad IPv4 address. Any IP literal is refused as local. */
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/

/**
 * Extract the host from an input that may be a URL or a bare hostname.
 * Returns `null` when the input cannot be parsed.
 * @param {string} raw
 * @returns {{ host: string, href: string } | null}
 */
function parseInput(raw) {
  // Explicit scheme present — must be http or https.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    if (!/^https?:\/\//i.test(raw)) return null
    try {
      const u = new URL(raw)
      return { host: u.hostname.toLowerCase(), href: u.href }
    } catch {
      return null
    }
  }
  // Bare host or host/path — prepend https:// and try again.
  try {
    const u = new URL(`https://${raw}`)
    return { host: u.hostname.toLowerCase(), href: u.href }
  } catch {
    return null
  }
}

/**
 * Why this URL cannot be used as a fork reference, or `null` when it is acceptable.
 *
 * The function does NOT normalise: call `normalizeForkUrl` separately, like `siteLabelRefusal`.
 * @param {string} input The URL or hostname the customer typed.
 * @param {string} [zone] The deployment's own zone — `tracyConfig().siteDomain`. Defaults to
 *   production's `'tracy.ai'`.
 * @returns {'shape' | 'local' | 'tracy' | null}
 */
export function forkUrlRefusal(input, zone = 'tracy.ai') {
  const raw = String(input ?? '').trim()
  if (!raw) return 'shape'

  const parsed = parseInput(raw)
  if (!parsed) return 'shape'
  const { host } = parsed

  // The host must contain at least one dot (bare labels like "justaplainword" are not sites).
  if (!host.includes('.')) {
    // `localhost` has no dot but is explicitly local.
    if (host === 'localhost') return 'local'
    return 'shape'
  }

  // IP literals.
  if (IPV4_RE.test(host)) {
    // All IPs are refused as local (loopback, private, or simply not a site to fork).
    return 'local'
  }

  // Private hostnames.
  if (host === 'localhost') return 'local'
  if (host.endsWith('.local') || host === 'local') return 'local'
  if (host.endsWith('.internal') || host === 'internal') return 'local'

  // Tracy lanes.
  if (host === zone || host.endsWith(`.${zone}`)) return 'tracy'

  return null
}

/**
 * The canonical URL to use for this input, or `null` when `forkUrlRefusal` is non-null.
 *
 * Bare hosts get `https://` prepended. `http://` URLs are kept. A URL with a path is kept.
 * @param {string} input
 * @param {string} [zone] Same as {@link forkUrlRefusal}'s.
 * @returns {string | null}
 */
export function normalizeForkUrl(input, zone = 'tracy.ai') {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  if (forkUrlRefusal(raw, zone) !== null) return null
  const parsed = parseInput(raw)
  if (!parsed) return null
  return parsed.href
}
