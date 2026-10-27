// Social profile URL → the identifier each network's providers look a profile up by. Pure, no I/O.

const HOSTS = {
  facebook: ['facebook.com', 'fb.com'],
  instagram: ['instagram.com'],
  tiktok: ['tiktok.com'],
  youtube: ['youtube.com']
}
// First path segments that are features, not a page or a user.
const FB_RESERVED = new Set([
  'sharer',
  'sharer.php',
  'share',
  'share.php',
  'photo',
  'photo.php',
  'photos',
  'reel',
  'reels',
  'watch',
  'video.php',
  'videos',
  'groups',
  'events',
  'login',
  'login.php',
  'plugins',
  'tr',
  'dialog',
  'story.php',
  'permalink.php',
  'hashtag',
  'marketplace',
  'help',
  'policies',
  'privacy',
  'home.php',
  'gaming',
  'search',
  'notes',
  'stories',
  'business',
  'ads',
  'l.php',
  // Account features a site's footer links by mistake (dev round L4, 19/10/2026: `facebook.com/messages`).
  'messages',
  'messenger',
  'me',
  'friends',
  'settings',
  'notifications',
  'bookmarks'
])
const IG_RESERVED = new Set([
  'p',
  'reel',
  'reels',
  'stories',
  'explore',
  'tv',
  'accounts',
  'direct',
  'about',
  'developer',
  'legal',
  'web',
  'challenge'
])
const IG_USER = /^[a-z0-9._]{1,30}$/
const TT_USER = /^[a-z0-9._]{2,24}$/
const YT_HANDLE = /^[a-z0-9._-]{3,30}$/
const YT_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/
const FB_SLUG = /^[A-Za-z0-9.-]{2,80}$/
const DIGITS = /^\d{5,20}$/

function networkOfHost(host) {
  const h = host.toLowerCase()
  for (const [net, list] of Object.entries(HOSTS)) {
    if (list.some((d) => h === d || h.endsWith(`.${d}`))) return net
  }
  return null
}

function toUrl(value) {
  const v = value.trim()
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`)
  } catch {
    return null
  }
}

const safeDecode = (s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

const fbPage = (pageId) => ({
  network: 'facebook',
  pageId,
  url: `https://www.facebook.com/profile.php?id=${pageId}`
})

function facebook(u, segs) {
  const [first, second, third] = segs
  if (!first) return null
  if (first === 'profile.php') {
    const id = u.searchParams.get('id')
    return id && DIGITS.test(id) ? fbPage(id) : null
  }
  if (first === 'pages' || first === 'people') {
    const id = [third, second].find((s) => s && DIGITS.test(s))
    return id ? fbPage(id) : null
  }
  if (first === 'p' && second) {
    const id = /-(\d{5,20})$/.exec(second)?.[1]
    return id ? fbPage(id) : null
  }
  if (FB_RESERVED.has(first.toLowerCase()) || !FB_SLUG.test(first)) return null
  return { network: 'facebook', pageSlug: first, url: `https://www.facebook.com/${first}` }
}

function instagram(segs) {
  const h = segs[0]?.replace(/^@/, '').toLowerCase()
  if (!h || IG_RESERVED.has(h) || !IG_USER.test(h)) return null
  return { network: 'instagram', handle: h, url: `https://www.instagram.com/${h}/` }
}

function tiktok(segs, bare) {
  const first = segs[0] ?? ''
  if (!bare && !first.startsWith('@')) return null
  const h = first.replace(/^@/, '').toLowerCase()
  if (!TT_USER.test(h)) return null
  return { network: 'tiktok', handle: h, url: `https://www.tiktok.com/@${h}` }
}

function youtube(segs, bare) {
  const [first, second] = segs
  if (!first) return null
  if (first.startsWith('@') || bare) {
    const h = first.replace(/^@/, '').toLowerCase()
    return YT_HANDLE.test(h) ? { network: 'youtube', handle: h, url: `https://www.youtube.com/@${h}` } : null
  }
  if (first === 'channel') {
    return second && YT_CHANNEL_ID.test(second)
      ? { network: 'youtube', channelId: second, url: `https://www.youtube.com/channel/${second}` }
      : null
  }
  if ((first === 'c' || first === 'user') && second && /^[A-Za-z0-9._-]{1,100}$/.test(second)) {
    return {
      network: 'youtube',
      legacy: first,
      name: second,
      url: `https://www.youtube.com/${first}/${second}`
    }
  }
  return null
}

/**
 * Parses a profile URL of Facebook, Instagram, TikTok or YouTube. A bare handle (`@phin.coffee`) is accepted
 * only with `{network}`. Returns `{network, url, handle | pageSlug | pageId | channelId | legacy+name}` (`url`
 * normalised) or null for junk, other hosts, posts, videos and short links (which need a redirect to resolve).
 */
export function parseSocialUrl(value, { network } = {}) {
  if (typeof value !== 'string' || !value.trim()) return null
  const v = value.trim()
  const looksLikeUrl = /^https?:\/\//i.test(v) || /^[\w-]+(\.[\w-]+)+\//.test(v)
  if (!looksLikeUrl) {
    if (!network || /\s/.test(v)) return null
    const segs = [v]
    if (network === 'facebook')
      return FB_SLUG.test(v) && !FB_RESERVED.has(v.toLowerCase())
        ? facebook(new URL('https://x'), segs)
        : null
    if (network === 'instagram') return instagram(segs)
    if (network === 'tiktok') return tiktok(segs, true)
    if (network === 'youtube') return youtube(segs, true)
    return null
  }
  const u = toUrl(v)
  if (!u || !/^https?:$/.test(u.protocol)) return null
  const net = networkOfHost(u.hostname)
  if (!net || (network && network !== net)) return null
  const segs = u.pathname.split('/').filter(Boolean).map(safeDecode)
  if (net === 'facebook') return facebook(u, segs)
  if (net === 'instagram') return instagram(segs)
  if (net === 'tiktok') return u.hostname.toLowerCase().startsWith('vm.') ? null : tiktok(segs, false)
  return youtube(segs, false)
}
