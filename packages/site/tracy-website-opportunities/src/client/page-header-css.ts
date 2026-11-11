/**
 * The header of the Find businesses and Added businesses tabs (`page-header.tsx`, #537): title and description in
 * the same type as a sub-page header, with an optional slot at the right end of the title row. Tracy tokens only.
 * No backtick may appear inside the template.
 */
export const PAGE_HEADER_CSS = `
.tracy-wo-pghead { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "title slot" "desc desc"; align-items: center; column-gap: 16px; row-gap: 2px; min-width: 0; }
.tracy-wo-pghead-title { grid-area: title; margin: 0; font-size: 22px; line-height: 30px; font-weight: 600; white-space: nowrap; }
.tracy-wo-pghead-desc { grid-area: desc; margin: 0; max-width: 760px; font-size: 13px; line-height: 20px; color: var(--muted-foreground); }
.tracy-wo-pghead-slot { grid-area: slot; display: flex; align-items: center; justify-content: flex-end; min-width: 0; }
.tracy-wo-pghead-slot > * { flex: 1 1 auto; }
@container (max-width: 720px) {
  .tracy-wo-pghead { grid-template-columns: minmax(0, 1fr); grid-template-areas: "title" "desc" "slot"; row-gap: 2px; }
  .tracy-wo-pghead-slot { margin-top: 10px; }
}
`
