import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { JoomlaAvatar } from './avatar'
import { JoomlaDark } from './dark'
import { JoomlaLight } from './light'

const Joomla = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <JoomlaLight {...props} className={className} />
  if (variant === 'dark') return <JoomlaDark {...props} className={className} />
  return (
    <>
      <JoomlaLight className={cn('dark:hidden', className)} {...props} />
      <JoomlaDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const JoomlaIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Joomla, {
  Avatar: JoomlaAvatar,
  colorPrimary: '#5091CD'
})

export default JoomlaIcon
