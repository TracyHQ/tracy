/**
 * The brief view (#520) and the Site name on Tracy row (#519): the understanding cards in a two column grid (one on a
 * narrow tab), the Full brief control, and the inline name editor. Reads only Tracy tokens. No backtick may appear
 * inside the template below.
 */
export const BRIEF_VIEW_CSS = `
.tracy-wo-understands .tracy-wo-page-head { margin: 0; }
.tracy-wo-brief-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.tracy-wo-brief-card { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); }
.tracy-wo-brief-card h3 { margin: 0; font-size: 13px; font-weight: 600; }
.tracy-wo-brief-card ul { margin: 0; padding-left: 18px; list-style: disc; font-size: 13px; line-height: 18px; }
.tracy-wo-brief-card li { margin: 2px 0; overflow-wrap: anywhere; }
.tracy-wo-brief-full { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
.tracy-wo-brief-full > summary { cursor: pointer; font-size: 13px; font-weight: 500; }
.tracy-wo-brief-full[open] > summary { margin-bottom: 8px; }
.tracy-wo-site-name input { max-width: 260px; }
.tracy-wo-site-name .tracy-wo-site-name-edit { height: auto; padding: 0; }
`
