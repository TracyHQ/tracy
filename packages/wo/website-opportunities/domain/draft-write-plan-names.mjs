// The name every created record is made with (ticket #597), part of `writePlanOf`: a record the site refuses or keeps
// unnamed (`content.update` with id 0, measured, "Records with no title or name") is named from the plan itself, never
// from invented words. Pure.
//
//   article   its own title value, else the name of the page it is shown on, else its subject
//   contact   its own name value (a fact place: the business name the page header's default title also takes),
//             else the name of the page it is shown on; with neither it stays empty and the guard refuses it
//             (`record_name_empty`). Before, a contact took its name only from the fact, which reaches the plan
//             through a block that shows it (the page header): a plan without that block lost the contact page.

/** The value a record holds at a plain column (no JSON path, no piece), or undefined. */
const plainValueOf = (record, column) =>
  [...record.values.values()].find((v) => !v.loc.jsonPath && !v.loc.xpath && v.loc.column === column)?.value

/** Name every created article and contact (`record.title`, the `title` or `name` column the create sends). */
export function nameRecords(state) {
  for (const record of state.sink.records.values()) {
    if (record.kind !== 'created' || record.title) continue
    const page = state.site.pageOfSubject(record.subject)
    if (record.recordKind === 'article')
      record.title = plainValueOf(record, 'title') ?? page?.name ?? record.subject
    else if (record.recordKind === 'contact') {
      const name = plainValueOf(record, 'name')
      record.title = typeof name === 'string' && name.trim() ? name : (page?.name ?? '')
    }
  }
}
