import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { MediumAvatar } from './avatar'
import { MediumDark } from './dark'
import { MediumLight } from './light'

const Medium = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <MediumLight {...props} className={className} />
  if (variant === 'dark') return <MediumDark {...props} className={className} />
  return (
    <>
      <MediumLight className={cn('dark:hidden', className)} {...props} />
      <MediumDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const MediumIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Medium, {
  Avatar: MediumAvatar,
  colorPrimary: '#000000'
})

export default MediumIcon
