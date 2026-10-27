import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { PrestashopAvatar } from './avatar'
import { PrestashopDark } from './dark'
import { PrestashopLight } from './light'

const Prestashop = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <PrestashopLight {...props} className={className} />
  if (variant === 'dark') return <PrestashopDark {...props} className={className} />
  return (
    <>
      <PrestashopLight className={cn('dark:hidden', className)} {...props} />
      <PrestashopDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const PrestashopIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Prestashop, {
  Avatar: PrestashopAvatar,
  colorPrimary: '#DF0067'
})

export default PrestashopIcon
