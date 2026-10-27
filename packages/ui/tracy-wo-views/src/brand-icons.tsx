/**
 * Brand marks for CMS names and social networks, from @tracy/ui's platform icons (one import per
 * icon, so a bundle carries only these). Names that have no mark get a generic code icon.
 */
import { BloggerIcon } from '@tracy/ui/icons/platforms/blogger'
import { DrupalIcon } from '@tracy/ui/icons/platforms/drupal'
import { FacebookIcon } from '@tracy/ui/icons/platforms/facebook'
import { InstagramIcon } from '@tracy/ui/icons/platforms/instagram'
import { JoomlaIcon } from '@tracy/ui/icons/platforms/joomla'
import { ShopifyIcon } from '@tracy/ui/icons/platforms/shopify'
import { SquarespaceIcon } from '@tracy/ui/icons/platforms/squarespace'
import { TiktokIcon } from '@tracy/ui/icons/platforms/tiktok'
import { WebflowIcon } from '@tracy/ui/icons/platforms/webflow'
import { WhatsappIcon } from '@tracy/ui/icons/platforms/whatsapp'
import { WixIcon } from '@tracy/ui/icons/platforms/wix'
import { WordpressIcon } from '@tracy/ui/icons/platforms/wordpress'
import { YoutubeIcon } from '@tracy/ui/icons/platforms/youtube'
import { Code2Icon } from 'lucide-react'

import type { SocialNetwork } from './types.ts'

type Mark = (props: { className?: string; 'aria-hidden'?: boolean }) => React.JSX.Element

const CMS_MARK: Record<string, Mark> = {
  blogger: BloggerIcon,
  drupal: DrupalIcon,
  joomla: JoomlaIcon,
  shopify: ShopifyIcon,
  squarespace: SquarespaceIcon,
  webflow: WebflowIcon,
  wix: WixIcon,
  wordpress: WordpressIcon
}

export const SOCIAL_MARK: Record<SocialNetwork, Mark> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  tiktok: TiktokIcon,
  youtube: YoutubeIcon
}

/** Product names, shown as written in every language. */
export const SOCIAL_NAME: Record<SocialNetwork, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube'
}

export const WhatsappMark: Mark = WhatsappIcon

/** The CMS name with its mark: "[Blogger icon] Blogger". */
export function CmsTag({ name }: { name: string }) {
  const MarkIcon = CMS_MARK[name.toLowerCase()]
  return (
    <span className="tracy-wo-cms">
      {MarkIcon ? (
        <MarkIcon className="tracy-wo-glyph" aria-hidden />
      ) : (
        <Code2Icon className="tracy-wo-glyph" aria-hidden />
      )}
      {name}
    </span>
  )
}

export function SocialMark({ network, className }: { network: SocialNetwork; className?: string }) {
  const MarkIcon = SOCIAL_MARK[network]
  return <MarkIcon className={className ?? 'tracy-wo-glyph'} aria-hidden />
}
