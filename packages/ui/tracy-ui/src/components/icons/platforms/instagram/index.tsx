import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { InstagramAvatar } from './avatar'
import { InstagramDark } from './dark'
import { InstagramLight } from './light'

const Instagram = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <InstagramLight {...props} className={className} />
  if (variant === 'dark') return <InstagramDark {...props} className={className} />
  return (
    <>
      <InstagramLight className={cn('dark:hidden', className)} {...props} />
      <InstagramDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const InstagramIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Instagram, {
  Avatar: InstagramAvatar,
  colorPrimary: '#FF0069'
})

export default InstagramIcon
