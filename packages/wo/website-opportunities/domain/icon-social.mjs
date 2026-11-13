// Social network icons of an AI quickstart build (ticket #595, spec #577). A social icon stands for the network of the
// link beside it, not for the content of an item, so it is never ranked by a model: code reads the network from the
// link's host and takes that network's mark from the icon library. A link whose host is no known network, or a mark the
// library lacks, leaves the icon hidden with the reason. Pure.

/** The networks code recognises, by host, and the icon library name of each one's mark. */
export const SOCIAL_NETWORKS = Object.freeze([
  { network: 'facebook', hosts: ['facebook.com', 'fb.com', 'fb.me'], icon: 'facebook-logo' },
  { network: 'instagram', hosts: ['instagram.com', 'instagr.am'], icon: 'instagram-logo' },
  { network: 'x', hosts: ['x.com', 'twitter.com'], icon: 'x-logo' },
  { network: 'tiktok', hosts: ['tiktok.com'], icon: 'tiktok-logo' },
  { network: 'youtube', hosts: ['youtube.com', 'youtu.be'], icon: 'youtube-logo' },
  { network: 'linkedin', hosts: ['linkedin.com'], icon: 'linkedin-logo' },
  { network: 'pinterest', hosts: ['pinterest.com'], icon: 'pinterest-logo' },
  { network: 'threads', hosts: ['threads.net', 'threads.com'], icon: 'threads-logo' },
  { network: 'whatsapp', hosts: ['wa.me', 'whatsapp.com'], icon: 'whatsapp-logo' },
  { network: 'telegram', hosts: ['t.me', 'telegram.me', 'telegram.org'], icon: 'telegram-logo' },
  { network: 'snapchat', hosts: ['snapchat.com'], icon: 'snapchat-logo' }
])

/** The icon names of every network mark: the only names a social icon field may hold. */
export const SOCIAL_ICON_NAMES = Object.freeze(SOCIAL_NETWORKS.map((n) => n.icon))

/**
 * The network of a social link, or null when its host is no known network (or it is not a link).
 * @param {unknown} url
 * @returns {{network: string, icon: string} | null}
 */
export function networkOf(url) {
  if (typeof url !== 'string') return null
  let host
  try {
    host = new URL(url.trim()).hostname.toLowerCase().replace(/^(www|m|mobile)\./, '')
  } catch {
    return null
  }
  const found = SOCIAL_NETWORKS.find((n) => n.hosts.some((h) => host === h || host.endsWith(`.${h}`)))
  return found ? { network: found.network, icon: found.icon } : null
}
