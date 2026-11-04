// The failure list text of a check result, shared by the copy check and the picture check.
// The failure list a fix round sends back to the writer: one line per failure, in rule order,
// "<rule id> | <rule title> | <where> | <detail>", ending with a newline. Empty when nothing failed.
export function failureListText(result) {
  const lines = []
  for (const r of result?.rules ?? [])
    for (const f of r.failures ?? []) lines.push([r.id, r.title, f.where, f.detail].join(' | '))
  return lines.length ? `${lines.join('\n')}\n` : ''
}
