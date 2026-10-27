import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { WoocommerceAvatar } from './avatar'
import { WoocommerceDark } from './dark'
import { WoocommerceLight } from './light'

const Woocommerce = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <WoocommerceLight {...props} className={className} />
  if (variant === 'dark') return <WoocommerceDark {...props} className={className} />
  return (
    <>
      <WoocommerceLight className={cn('dark:hidden', className)} {...props} />
      <WoocommerceDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const WoocommerceIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Woocommerce, {
  Avatar: WoocommerceAvatar,
  colorPrimary: '#96588A'
})

export default WoocommerceIcon
