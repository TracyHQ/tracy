import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { SquarespaceAvatar } from './avatar'
import { SquarespaceDark } from './dark'
import { SquarespaceLight } from './light'

const Squarespace = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <SquarespaceLight {...props} className={className} />
  if (variant === 'dark') return <SquarespaceDark {...props} className={className} />
  return (
    <>
      <SquarespaceLight className={cn('dark:hidden', className)} {...props} />
      <SquarespaceDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const SquarespaceIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Squarespace, {
  Avatar: SquarespaceAvatar,
  colorPrimary: '#000000'
})

export default SquarespaceIcon
