/** Product names: shown as is in every language. */
export const CMS_LABEL: Readonly<Record<string, string>> = {
  joomla: 'Joomla',
  wordpress: 'WordPress',
  emdash: 'EmDash'
}

/** Social platforms, maps and chat apps: product names, shown as is in every language. */
const SOCIAL_LABEL: Readonly<Record<string, string>> = {
  tripadvisor: 'TripAdvisor',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  'google-places': 'Google Places',
  'google-maps': 'Google Maps',
  osm: 'OpenStreetMap',
  zalo: 'Zalo',
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  line: 'LINE'
}

/** The host of an http(s) address without its www., or null. */
function hostOf(ref: string | null | undefined): string | null {
  if (typeof ref !== 'string' || !/^https?:\/\//i.test(ref)) return null
  try {
    return new URL(ref).hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/**
 * A source's name: the translated word for a website, a platform's own name, else the server's word. A listing
 * page (`listing`, magicpin and the like) is named with the host of its address, `ref`.
 */
export function sourceLabel(
  t: (key: string, params?: Record<string, unknown>) => string,
  source: string,
  ref?: string | null
): string {
  if (source === 'website') return t('source.website')
  if (source === 'listing') {
    const host = hostOf(ref)
    return host === null ? t('source.listingPlain') : t('source.listing', { host })
  }
  if (source === 'url') return t('source.link')
  if (source === 'facebook-search') return t('source.facebookSearch')
  if (source === 'instagram-search') return t('source.instagramSearch')
  if (source === 'menu-file') return t('source.menuFile')
  if (source === 'menu-photos') return t('source.menuPhotos')
  // A photo or video the seller added themself (#537).
  if (source === 'owner') return t('source.owner')
  return SOCIAL_LABEL[source] ?? source
}
