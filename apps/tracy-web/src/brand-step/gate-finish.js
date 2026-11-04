// Gate section: owner tasks, transparency of every image (the phone icon is opaque) and the exact colours of an
// icon: every visible pixel is exactly one of its colours.
import sharp from 'sharp'

const KINDS = ['replace-temporary-logo', 'approve-rebuilt-logo', 'confirm-name']

export function checkOwnerTasks(ctx) {
  const { b, NS, mk, IC, bad } = ctx
  if (!Array.isArray(b.ownerTasks)) bad('ownerTasks', 'array')
  else {
    b.ownerTasks.forEach((t, i) => {
      if (!KINDS.includes(t.kind)) bad(`ownerTasks[${i}].kind`, KINDS.join(' | '))
      if (!t.say) bad(`ownerTasks[${i}].say`, 'one plain sentence')
    })
  }
  const has = (k) => (b.ownerTasks ?? []).some((t) => t.kind === k)
  if (NS.heldBack !== has('confirm-name'))
    bad(
      'ownerTasks',
      NS.heldBack
        ? 'a name held back by the brief needs confirm-name'
        : 'confirm-name only when the brief holds the name back'
    )
  if (mk.decision === 'lettermark' && !has('replace-temporary-logo'))
    bad('ownerTasks', 'a lettermark needs replace-temporary-logo')
  if (mk.decision === 'icon' && IC?.coloursFrom === 'logo' && !has('approve-rebuilt-logo'))
    bad('ownerTasks', "an icon in the logo's colours needs approve-rebuilt-logo")
  if (mk.decision === 'icon' && IC?.coloursFrom === 'accent' && !has('replace-temporary-logo'))
    bad('ownerTasks', 'an icon in the accent (no logo) needs replace-temporary-logo')
  if (mk.decision === 'cut' && !has('approve-rebuilt-logo'))
    bad('ownerTasks', 'a cut mark needs approve-rebuilt-logo')
}

export async function checkImages(ctx) {
  const { pngs, bad, files, norm, mk, iconColours } = ctx
  for (const [field, f, transparent] of pngs) {
    let st
    try {
      st = await sharp(await files.read(norm(f))).stats()
    } catch {
      bad(field, 'is not a readable image')
      continue
    }
    if (transparent && st.isOpaque) bad(field, 'must have a transparent background')
    if (!transparent && !st.isOpaque) bad(field, 'phone icon must be on a solid ground (no transparency)')
  }
  if (mk.decision === 'icon' && iconColours && typeof mk.file === 'string' && files.has(norm(mk.file))) {
    let image
    try {
      image = await sharp(await files.read(norm(mk.file)))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
    } catch {
      return
    }
    const { data, info } = image
    const seen = new Map()
    for (let i = 0; i < info.width * info.height; i++) {
      if (data[i * 4 + 3] > 0) {
        const k = `#${[0, 1, 2].map((c) => data[i * 4 + c].toString(16).padStart(2, '0')).join('')}`
        seen.set(k, (seen.get(k) ?? 0) + 1)
      }
    }
    const extra = [...seen.keys()].filter((k) => !iconColours.includes(k))
    if (extra.length)
      bad(
        'logo.mark.file',
        `the icon has colours outside logo.mark.icon.colours: ${extra.slice(0, 5).join(', ')}${extra.length > 5 ? ' ...' : ''}`
      )
  }
}
