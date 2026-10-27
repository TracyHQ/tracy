import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { ThreadsAvatar } from './avatar'
import { ThreadsDark } from './dark'
import { ThreadsLight } from './light'

const Threads = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <ThreadsLight {...props} className={className} />
  if (variant === 'dark') return <ThreadsDark {...props} className={className} />
  return (
    <>
      <ThreadsLight className={cn('dark:hidden', className)} {...props} />
      <ThreadsDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const ThreadsIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Threads, {
  Avatar: ThreadsAvatar,
  colorPrimary: '#000000'
})

export default ThreadsIcon
