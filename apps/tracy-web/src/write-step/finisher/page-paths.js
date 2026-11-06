// Pages compared as addresses (spec #418): the site check names a Joomla page as it answers (`/index.php/services`), the
// finder and the kit name it as a kept page says it (`/services`). Both are one page, and so are a trailing slash and the
// front page as `/index.php`. Every place the finisher compares pages compares them here.
import { pagePath } from '../../lib/hidden-page-links.js'

/** The page as a kept page says it, or null when there is none. */
export const pageOf = (page) => (typeof page === 'string' && page ? pagePath(page) : null)

/** Whether two pages are one: false when either is unnamed. */
export const samePage = (a, b) => pageOf(a) !== null && pageOf(a) === pageOf(b)
