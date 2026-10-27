import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { WordpressAvatar } from './avatar'
import { WordpressDark } from './dark'
import { WordpressLight } from './light'

const Wordpress = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <WordpressLight {...props} className={className} />
  if (variant === 'dark') return <WordpressDark {...props} className={className} />
  return (
    <>
      <WordpressLight className={cn('dark:hidden', className)} {...props} />
      <WordpressDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const WordpressIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Wordpress, {
  Avatar: WordpressAvatar,
  colorPrimary: '#21759B'
})

export default WordpressIcon
