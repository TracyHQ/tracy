import { cn } from '../../../../lib/utils'
import type { CompoundIcon, CompoundIconProps } from '../../types'
import { BloggerAvatar } from './avatar'
import { BloggerDark } from './dark'
import { BloggerLight } from './light'

const Blogger = ({ variant, className, ...props }: CompoundIconProps) => {
  if (variant === 'light') return <BloggerLight {...props} className={className} />
  if (variant === 'dark') return <BloggerDark {...props} className={className} />
  return (
    <>
      <BloggerLight className={cn('dark:hidden', className)} {...props} />
      <BloggerDark className={cn('hidden dark:block', className)} {...props} />
    </>
  )
}

export const BloggerIcon: CompoundIcon = /*#__PURE__*/ Object.assign(Blogger, {
  Avatar: BloggerAvatar,
  colorPrimary: '#FF5722'
})

export default BloggerIcon
