import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { RedditAvatar } from './avatar'
import { RedditDark } from './dark'
import { RedditLight } from './light'

const Reddit = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <RedditLight {...props} className={className} />
  if (variant === 'dark') return <RedditDark {...props} className={className} />
  return (
    <>
      <RedditLight className={cn('dark:hidden', className)} {...props} />
      <RedditDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const RedditIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Reddit, {
  Avatar: RedditAvatar,
  colorPrimary: '#FF4500'
})

export default RedditIcon
