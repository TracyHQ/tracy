export interface SocialProfile {
  network: 'facebook' | 'instagram' | 'tiktok' | 'youtube'
  url: string
  handle?: string
  pageId?: string
  pageSlug?: string
  channelId?: string
  legacy?: string
  name?: string
}

export function parseSocialUrl(
  value: unknown,
  options?: { network?: SocialProfile['network'] }
): SocialProfile | null
