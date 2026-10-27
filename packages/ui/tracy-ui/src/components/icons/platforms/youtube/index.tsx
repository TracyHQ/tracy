import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { YoutubeAvatar } from './avatar'
import { YoutubeDark } from './dark'
import { YoutubeLight } from './light'

const Youtube = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <YoutubeLight {...props} className={className} />
  if (variant === 'dark') return <YoutubeDark {...props} className={className} />
  return (
    <>
      <YoutubeLight className={cn('dark:hidden', className)} {...props} />
      <YoutubeDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const YoutubeIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Youtube, {
  Avatar: YoutubeAvatar,
  colorPrimary: '#FF0000'
})

export default YoutubeIcon
