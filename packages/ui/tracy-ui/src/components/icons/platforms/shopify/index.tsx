import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { ShopifyAvatar } from './avatar'
import { ShopifyDark } from './dark'
import { ShopifyLight } from './light'

const Shopify = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <ShopifyLight {...props} className={className} />
  if (variant === 'dark') return <ShopifyDark {...props} className={className} />
  return (
    <>
      <ShopifyLight className={cn('dark:hidden', className)} {...props} />
      <ShopifyDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const ShopifyIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Shopify, {
  Avatar: ShopifyAvatar,
  colorPrimary: '#7AB55C'
})

export default ShopifyIcon
