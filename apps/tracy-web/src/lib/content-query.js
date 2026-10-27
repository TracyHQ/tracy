/**
 * THE PARAMETERS `content.read` TAKES — one list, read by the door that enforces them
 * (`sites/route.js` `contentQueryProblem`) and by the public API reference that documents them
 * (`api-reference/spec.js`). Before 28/09/2026 the accepted names lived only inside the door's check,
 * so a reference written beside it would have been a second list that drifts.
 *
 * Each entry is a JSON Schema for one parameter plus the sentence a reader needs. The door keeps its
 * own worded refusals (they tell the agent the next call); the NAMES and RANGES come from here.
 */

/** The byte budget a Claude Cowork plugin pages an answer by. */
export const MAX_BYTES_RANGE = Object.freeze({ minimum: 8192, maximum: 262144 })

/** A `version` as `sites/content-versions.js` writes it. */
export const VERSION_PATTERN = '^cv1\\.[a-f0-9]{32}$'

/** @type {ReadonlyArray<{ name: string, schema: object, description: string }>} */
export const CONTENT_QUERY_PARAMS = Object.freeze([
  { name: 'id', schema: { type: 'string' }, description: 'One content, by the id an earlier read returned.' },
  {
    name: 'ids',
    schema: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      uniqueItems: true,
      items: { type: 'string', minLength: 1, maxLength: 128 }
    },
    description:
      'Several contents in one read, by the ids an earlier read returned (1 to 100, no repeats). Sent with maxBytes only. Claude Cowork plugin 0.18.3 (Joomla) / 0.14.3 (WordPress).'
  },
  {
    name: 'type',
    schema: { type: 'string', enum: ['page', 'article', 'service', 'project', 'shared', 'generic'] },
    description:
      'Only contents of this type. Blog posts are "article"; template parts, menus and the site identity are "shared".'
  },
  {
    name: 'locale',
    schema: { type: 'string' },
    description: 'Only contents in this language, as a BCP 47 tag the site lists (en-GB, vi).'
  },
  {
    name: 'limit',
    schema: { type: 'integer', minimum: 1, maximum: 100 },
    description: 'Contents per page of a listing.'
  },
  {
    name: 'cursor',
    schema: { type: 'string' },
    description:
      'The next page of a listing: pagination.nextCursor of the previous answer, sent with the same filters.'
  },
  { name: 'blocksCursor', schema: { type: 'string' }, description: "The next page of one content's blocks." },
  { name: 'blockId', schema: { type: 'string' }, description: 'One block of the content named by id.' },
  {
    name: 'itemsCursor',
    schema: { type: 'string' },
    description: "The next page of one block's repeated items."
  },
  {
    name: 'describe',
    schema: { const: true },
    description:
      'What the site holds and what this seat may change there (tracy-content-describe/v1). Sent alone.'
  },
  {
    name: 'view',
    schema: { const: 'pages' },
    description:
      "Every page with an address (tracy-content-pages/v1), walked by Tracy over the site's listing. Takes locale and url. An answer larger than 256 KiB is cut at whole pages with truncated: true, and next names the narrower read (one locale, or one type)."
  },
  {
    name: 'url',
    schema: { type: 'string', minLength: 1 },
    description: 'With view: "pages", only the page(s) this link shows.'
  },
  {
    name: 'fields',
    schema: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
    description:
      'Only these keys of each content ("title,url" or ["title","blocks.fields.value"]); ids are always kept.'
  },
  {
    name: 'ifVersion',
    schema: { type: 'string', pattern: VERSION_PATTERN },
    description: 'The version an earlier read answered; an unchanged site answers notModified.'
  },
  {
    name: 'changedSince',
    schema: { type: 'string', pattern: VERSION_PATTERN },
    description:
      'What changed since the version a {view: "pages"} read answered (tracy-content-changes/v1). Takes locale.'
  },
  {
    name: 'maxBytes',
    schema: { type: 'integer', ...MAX_BYTES_RANGE },
    description:
      'The size of the answer, in bytes; a listing is cut at whole contents and continues with its cursor.'
  }
])

/** Just the names, in the order above. */
export const CONTENT_QUERY_NAMES = Object.freeze(CONTENT_QUERY_PARAMS.map((param) => param.name))
