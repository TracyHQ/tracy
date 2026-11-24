import { defineLiveCollection } from 'astro:content'
import { emdashLoader } from 'emdash/runtime'

// EmDash content is a live collection: entries are read from the database at request time.
export const collections = {
  _emdash: defineLiveCollection({ loader: emdashLoader() })
}
