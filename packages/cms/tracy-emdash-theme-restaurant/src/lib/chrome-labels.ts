// The site entry's interface labels in the site's language (TCH #1013, T25b).
//
// Tracy Base keeps most of its interface words as CONTENT: the `site` entry's `read_more`, `prev_label`, `page_meta`…
// A root written in another language (`personalize` `as: { en: 'de' }`) rewrites the business's own words, not these,
// so a German site would still say "Read more". The rule here: a label that still holds the template's English default
// is the template's word, and it is shown in the site's language; a label someone changed (an editor, the model) is
// theirs and is shown as written.
//
// Pure, so a plain `node --test` holds it: tests/ui-words.test.mjs.
import { isEnglish, uiWords, type UiWords } from './ui-words.ts'

/** Each interface field of the `site` entry and the word it holds while nobody changed it. */
export const LABEL_FIELDS: Record<string, keyof UiWords> = {
  contact_label: 'contact',
  theme_dark_label: 'dark',
  theme_light_label: 'light',
  menu_label: 'menu',
  mega_search_label: 'search',
  mega_read_title: 'readLearn',
  mega_design_title: 'designInspiration',
  mega_help_title: 'helpSupport',
  mega_latest_title: 'latestFromBlog',
  mega_team_all_label: 'viewAllTeam',
  footer_product_title: 'product',
  footer_resources_title: 'resources',
  footer_company_title: 'company',
  social_heading: 'findUsOnline',
  breadcrumb_home: 'home',
  not_found_title: 'pageNotFound',
  search_title: 'search',
  search_placeholder: 'search',
  search_button: 'search',
  search_results_line: 'searchResultsLine',
  search_empty: 'searchEmpty',
  read_more: 'readMore',
  count_label: 'countArticles',
  page_meta: 'pageOf',
  prev_label: 'previous',
  next_label: 'next',
  related_title: 'relatedArticles',
  latest_title: 'latestArticles',
  sections_title: 'sections',
  sitemap_title: 'sitemap',
  skip_label: 'skipToContent',
  back_to_top: 'backToTop'
}

/** The site entry with every untouched English label replaced by the display language's word; English stays as is. */
export function localizeLabels(site: Record<string, any>, tag: string): Record<string, any> {
  if (isEnglish(tag)) return site
  const english = uiWords('en')
  const words = uiWords(tag)
  const out = { ...site }
  for (const [field, key] of Object.entries(LABEL_FIELDS))
    if (typeof site[field] === 'string' && site[field].trim() === english[key]) out[field] = words[key]
  return out
}
