import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { WixAvatar } from './avatar'
import { WixDark } from './dark'
import { WixLight } from './light'

const Wix = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <WixLight {...props} className={className} />
  if (variant === 'dark') return <WixDark {...props} className={className} />
  return (
    <>
      <WixLight className={cn('dark:hidden', className)} {...props} />
      <WixDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const WixIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Wix, {
  Avatar: WixAvatar,
  colorPrimary: '#0C6EFC'
})

export default WixIcon
