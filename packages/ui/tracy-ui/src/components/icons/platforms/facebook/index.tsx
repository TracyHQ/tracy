import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { FacebookAvatar } from './avatar'
import { FacebookDark } from './dark'
import { FacebookLight } from './light'

const Facebook = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <FacebookLight {...props} className={className} />
  if (variant === 'dark') return <FacebookDark {...props} className={className} />
  return (
    <>
      <FacebookLight className={cn('dark:hidden', className)} {...props} />
      <FacebookDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const FacebookIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Facebook, {
  Avatar: FacebookAvatar,
  colorPrimary: '#0866FF'
})

export default FacebookIcon
