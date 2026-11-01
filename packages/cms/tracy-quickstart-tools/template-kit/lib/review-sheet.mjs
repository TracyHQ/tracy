// The owner's one-pass review page: every icon with its class and why, every frame shot whole and emptied
// side by side with the automatic verdict, and every proposed template fix with its trial. HTML pages, made
// into PNGs by the caller.
const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** Every row of the review: icons, emptied frames, template fixes, template gaps, then the site's colours. */
export function reviewRows(kit, fixes = []) {
  const pathOf = new Map((kit.images ?? []).map((i) => [i.id, i.path]))
  const img = (id) => (id && pathOf.get(id)) || null
  const rows = []
  for (const b of kit.blocks)
    for (const f of b.frames)
      if (f.kind === 'icon' || f.faces === true)
        rows.push({
          section: 'Icons and faces',
          title: `${f.id} · ${f.faces ? 'demo-faces (demoOwned)' : f.fixed == null ? 'NOT CLASSIFIED' : f.fixed ? 'fixed' : 'demo (demoOwned)'}`,
          note: f.twinOf ? `twin of ${f.twinOf}` : (f.classReason ?? ''),
          pics: [img(`${f.twinOf ?? f.id}-crop-${kit.widths[0]}`)]
        })
  const shotOnce = new Set() // a row slot is one shot for every row's frame
  for (const b of kit.blocks)
    for (const f of b.frames)
      if (f.hideEvidence)
        for (const w of kit.widths.map(String)) {
          const shot = f.hideEvidence.images[w]
          if (!shot || shotOnce.has(shot)) continue
          shotOnce.add(shot)
          const slot = f.hideEvidence.measuredAs === 'row-slot' ? ' · row slot, emptied in every row' : ''
          rows.push({
            section: 'Frames emptied (whole | emptied)',
            title: `${f.id} · ${f.kind ?? '?'} · ${w} · canHide ${f.canHide}${slot}`,
            note: `${f.hideEvidence.checks[w] ?? ''} (${f.hideEvidence.judgedBy})`,
            pics: [img(b.images[w]), img(shot)]
          })
        }
  for (const fix of fixes)
    for (const e of fix.evidence ?? [])
      rows.push({
        section: 'Template fixes (as is | with the fix)',
        title: `${fix.selector} { ${fix.rule} } · ${fix.verified ? 'verified' : 'NOT verified'}`,
        note: `${e.list} with ${e.count} rows at ${e.width}: gap ${e.gap.left}px left, ${e.gap.right}px right; unlocks ${fix.lists.join(', ')}`,
        pics: [e.before, e.after]
      })
  for (const b of kit.blocks)
    for (const t of (b.fixedText ?? []).filter((x) => x.source))
      rows.push({
        section: 'Fixed CMS text (as is | hidden by override)',
        title: `${b.id} · ${t.source.constant} · canHide ${t.canHide}`,
        note: `"${t.text}" from ${t.source.file}${t.evidence ? `; ${t.evidence.reason} (change ${t.evidence.change})` : ''}`,
        pics: t.evidence ? [t.evidence.before, t.evidence.after] : []
      })
  for (const g of kit.templateGaps ?? [])
    rows.push({
      section: 'Template gaps (defects for the template owner)',
      title: `${g.kind} · ${Object.values(g.where).filter(Boolean).join(' · ')}${g.accepted ? ' · accepted' : ''}`,
      note: `${g.detail}${g.accepted ? ` (accepted by ${g.accepted.by ?? '?'}: ${g.accepted.reason})` : ''} [${g.id}]`,
      pics: g.evidence.slice(0, 2).map((id) => img(id) ?? id)
    })
  if (kit.site?.brandColours)
    rows.push({
      section: 'Site',
      title: 'Brand colours',
      note: 'site-palette.png',
      pics: ['site-palette.png']
    })
  return rows
}

/** HTML pages of at most `perPage` rows; image paths relative to `base`. */
export function reviewPages(rows, { title, base = '..', perPage = 40 } = {}) {
  const pages = []
  for (let i = 0; i < Math.max(rows.length, 1); i += perPage) {
    const chunk = rows.slice(i, i + perPage)
    let section = null
    const html = chunk
      .map((r) => {
        const head = r.section !== section ? `<h2>${esc(r.section)}</h2>` : ''
        section = r.section
        const pics = r.pics
          .map((p) =>
            p ? `<img src="${esc(`${base}/${p}`)}" alt="">` : '<span class="none">no image</span>'
          )
          .join('')
        return `${head}<figure><div class="pics">${pics}</div><figcaption><b>${esc(r.title)}</b><br>${esc(r.note)}</figcaption></figure>`
      })
      .join('\n')
    pages.push(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)} ${pages.length + 1}</title>
<style>
body{margin:0;padding:16px;background:#ececef;font:12px/1.35 system-ui,sans-serif;color:#111}
h1{font-size:16px;margin:0 0 8px}h2{font-size:14px;margin:16px 0 8px;width:100%}
main{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}
figure{margin:0;background:#fff;padding:6px;border:1px solid #c9c9cf;max-width:640px}
.pics{display:flex;gap:6px;align-items:flex-start}
img{max-width:300px;max-height:420px;object-fit:contain;object-position:top;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/12px 12px}
.none{color:#a00}
</style></head><body><h1>${esc(title)} · page ${pages.length + 1} · ${chunk.length} items</h1><main>
${html}
</main></body></html>
`)
  }
  return pages
}
