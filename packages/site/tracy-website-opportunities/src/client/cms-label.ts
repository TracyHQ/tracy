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

/** A source's name: the translated word for a website, a platform's own name, else the server's word. */
export function sourceLabel(t: (key: string) => string, source: string): string {
  if (source === 'website') return t('source.website')
  if (source === 'url') return t('source.link')
  if (source === 'facebook-search') return t('source.facebookSearch')
  if (source === 'instagram-search') return t('source.instagramSearch')
  if (source === 'menu-file') return t('source.menuFile')
  if (source === 'menu-photos') return t('source.menuPhotos')
  return SOCIAL_LABEL[source] ?? source
}
