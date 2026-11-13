// Social network icons of an AI quickstart build (ticket #595, spec #577). A social icon stands for the network of the
// link beside it, not for the content of an item, so it is never ranked by a model: code reads the network from the
// link's host. A `storage: "class-name"` icon is decided as that network, which the write step writes as the class of the
// template's own icon font; an `image-file` one takes that network's mark from the icon library. A link whose host is
// no known network (or, for an image file, a mark the library lacks) leaves the icon hidden with the reason. Pure.

/**
 * The networks code recognises, by host, and the icon library name of each one's mark. `hosts` are the network's own
 * domains and its own short hosts (a subdomain of one is the network too: `m.facebook.com`, `vm.tiktok.com`);
 * `countries` names the network's base name when it also answers on a country domain (`facebook.co.uk`,
 * `youtube.de`). A look alike host (`instagram.com.example`, `evilinstagram.com`) is no network.
 */
export const SOCIAL_NETWORKS = Object.freeze([
  {
    network: 'facebook',
    hosts: ['facebook.com', 'fb.com', 'fb.me', 'fb.watch'],
    countries: 'facebook',
    icon: 'facebook-logo'
  },
  { network: 'instagram', hosts: ['instagram.com', 'instagr.am'], icon: 'instagram-logo' },
  { network: 'x', hosts: ['x.com', 'twitter.com'], icon: 'x-logo' },
  { network: 'tiktok', hosts: ['tiktok.com'], icon: 'tiktok-logo' },
  { network: 'youtube', hosts: ['youtube.com', 'youtu.be'], countries: 'youtube', icon: 'youtube-logo' },
  { network: 'linkedin', hosts: ['linkedin.com', 'lnkd.in'], icon: 'linkedin-logo' },
  {
    network: 'pinterest',
    hosts: ['pinterest.com', 'pin.it'],
    countries: 'pinterest',
    icon: 'pinterest-logo'
  },
  { network: 'threads', hosts: ['threads.net', 'threads.com'], icon: 'threads-logo' },
  { network: 'whatsapp', hosts: ['wa.me', 'whatsapp.com'], icon: 'whatsapp-logo' },
  { network: 'telegram', hosts: ['t.me', 'telegram.me', 'telegram.org'], icon: 'telegram-logo' },
  { network: 'snapchat', hosts: ['snapchat.com'], icon: 'snapchat-logo' }
])

/**
 * Shorteners that may lead to any site: `t.co` wraps every link shared on X, the others any link at all. A link through
 * one cannot be attributed to a network, so its icon is hidden with `social_link_shortened`.
 */
export const AMBIGUOUS_SHORTENERS = Object.freeze([
  't.co',
  'bit.ly',
  'tinyurl.com',
  'ow.ly',
  'buff.ly',
  'goo.gl',
  'is.gd',
  'rebrand.ly',
  'linktr.ee'
])

/** The icon names of every network mark: the only names a social icon field may hold. */
export const SOCIAL_ICON_NAMES = Object.freeze(SOCIAL_NETWORKS.map((n) => n.icon))

/** The host of a link, a link written without its scheme (`instagram.com/foo`) included; null for anything else. */
function hostOf(url) {
  if (typeof url !== 'string') return null
  const text = url.trim()
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text)
    ? text
    : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$|\?)/i.test(text)
      ? `https://${text}`
      : null
  if (!withScheme) return null
  try {
    const { protocol, hostname } = new URL(withScheme)
    if (protocol !== 'https:' && protocol !== 'http:') return null
    return hostname.toLowerCase().replace(/^(www|m|mobile)\./, '') || null
  } catch {
    return null
  }
}

/** Whether a host is a country domain of a network's base name: `facebook.co.uk`, `youtube.de`, `pinterest.com.au`. */
const isCountryHost = (host, base) => new RegExp(`(^|\\.)${base}\\.((co|com)\\.)?[a-z]{2}$`).test(host)

/**
 * The network of a social link, or null when its host is no known network (or it is not a link).
 * @param {unknown} url
 * @returns {{network: string, icon: string} | null}
 */
export function networkOf(url) {
  const host = hostOf(url)
  if (!host) return null
  const found = SOCIAL_NETWORKS.find(
    (n) =>
      n.hosts.some((h) => host === h || host.endsWith(`.${h}`)) ||
      (n.countries && isCountryHost(host, n.countries))
  )
  return found ? { network: found.network, icon: found.icon } : null
}

/**
 * Why a social link has no network mark: no link at all, a bare handle naming no network (`@studio`), a link that is no web link (`mailto:`), a shortener
 * that may lead anywhere, or a host that is no known network. Null when `networkOf` finds the network.
 * @param {unknown} url
 */
export function socialReasonOf(url) {
  if (typeof url !== 'string' || url.trim() === '') return 'no_social_link'
  if (networkOf(url)) return null
  const host = hostOf(url)
  if (!host) return /^@?[\w.]+$/.test(url.trim()) ? 'social_handle_without_network' : 'social_link_not_web'
  if (AMBIGUOUS_SHORTENERS.some((h) => host === h || host.endsWith(`.${h}`))) return 'social_link_shortened'
  return 'social_network_unknown'
}
