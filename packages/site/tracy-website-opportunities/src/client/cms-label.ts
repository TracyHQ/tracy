/** Product names: shown as is in every language. */
export const CMS_LABEL: Readonly<Record<string, string>> = {
  joomla: 'Joomla',
  wordpress: 'WordPress',
  emdash: 'EmDash'
}

/** Social platforms, maps and chat apps: product names, shown as is in every language. */
export const SOCIAL_LABEL: Readonly<Record<string, string>> = {
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

/**
 * A source's name: the translated word for a website, a platform's own name, else the server's word. A listing
 * page (`listing`, magicpin and the like) is just a "Website": the link beside the name already shows the host.
 * A kind with no own name whose `ref` is a web address is a "Website" too.
 */
export function sourceLabel(
  t: (key: string, params?: Record<string, unknown>) => string,
  source: string,
  ref?: string | null
): string {
  if (source === 'website') return t('source.website')
  if (source === 'listing') return t('source.website')
  if (source === 'url') return t('source.link')
  if (source === 'facebook-search') return t('source.facebookSearch')
  if (source === 'instagram-search') return t('source.instagramSearch')
  if (source === 'menu-file') return t('source.menuFile')
  if (source === 'menu-photos') return t('source.menuPhotos')
  // A photo or video the seller added themself (#537).
  if (source === 'owner') return t('source.owner')
  const own = SOCIAL_LABEL[source]
  if (own !== undefined) return own
  return typeof ref === 'string' && /^https?:\/\//i.test(ref) ? t('source.website') : source
}
