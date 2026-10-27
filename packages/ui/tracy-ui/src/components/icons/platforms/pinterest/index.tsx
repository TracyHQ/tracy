import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { PinterestAvatar } from './avatar'
import { PinterestDark } from './dark'
import { PinterestLight } from './light'

const Pinterest = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <PinterestLight {...props} className={className} />
  if (variant === 'dark') return <PinterestDark {...props} className={className} />
  return (
    <>
      <PinterestLight className={cn('dark:hidden', className)} {...props} />
      <PinterestDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const PinterestIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Pinterest, {
  Avatar: PinterestAvatar,
  colorPrimary: '#BD081C'
})

export default PinterestIcon
