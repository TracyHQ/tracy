import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { LinkedinAvatar } from './avatar'
import { LinkedinDark } from './dark'
import { LinkedinLight } from './light'

const Linkedin = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <LinkedinLight {...props} className={className} />
  if (variant === 'dark') return <LinkedinDark {...props} className={className} />
  return (
    <>
      <LinkedinLight className={cn('dark:hidden', className)} {...props} />
      <LinkedinDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const LinkedinIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Linkedin, {
  Avatar: LinkedinAvatar,
  colorPrimary: '#0A66C2'
})

export default LinkedinIcon
