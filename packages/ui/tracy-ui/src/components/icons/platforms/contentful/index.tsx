import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { ContentfulAvatar } from './avatar'
import { ContentfulDark } from './dark'
import { ContentfulLight } from './light'

const Contentful = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <ContentfulLight {...props} className={className} />
  if (variant === 'dark') return <ContentfulDark {...props} className={className} />
  return (
    <>
      <ContentfulLight className={cn('dark:hidden', className)} {...props} />
      <ContentfulDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const ContentfulIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Contentful, {
  Avatar: ContentfulAvatar,
  colorPrimary: '#2478CC'
})

export default ContentfulIcon
