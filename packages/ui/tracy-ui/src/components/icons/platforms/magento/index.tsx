import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { MagentoAvatar } from './avatar'
import { MagentoDark } from './dark'
import { MagentoLight } from './light'

const Magento = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <MagentoLight {...props} className={className} />
  if (variant === 'dark') return <MagentoDark {...props} className={className} />
  return (
    <>
      <MagentoLight className={cn('dark:hidden', className)} {...props} />
      <MagentoDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const MagentoIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Magento, {
  Avatar: MagentoAvatar,
  colorPrimary: '#F26322'
})

export default MagentoIcon
