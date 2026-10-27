import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { TumblrAvatar } from './avatar'
import { TumblrDark } from './dark'
import { TumblrLight } from './light'

const Tumblr = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <TumblrLight {...props} className={className} />
  if (variant === 'dark') return <TumblrDark {...props} className={className} />
  return (
    <>
      <TumblrLight className={cn('dark:hidden', className)} {...props} />
      <TumblrDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const TumblrIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Tumblr, {
  Avatar: TumblrAvatar,
  colorPrimary: '#36465D'
})

export default TumblrIcon
