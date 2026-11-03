// P01 every planned frame once, P02 frames known to the kit, P12 hiding and demo leftovers, P13 not writable frames.
const where = (e) => (e.list === 'siteSettings' ? `siteSettings ${e.frame}` : e.frame)

// P01. A planned frame is covered by exactly one place: an entry of frames, an entry of siteSettings or a return.
// Kit twins and plan sameAs frames are written as source "twin"; P11 judges them, here they only must not repeat.
export function checkP01({ R, view, idx }) {
  const r = R.p01
  const count = new Map()
  for (const f of [...view.entries.map((e) => e.frame), ...view.returns.map((x) => x.frame)])
    count.set(f, (count.get(f) ?? 0) + 1)
  for (const [frame] of idx.wishes) {
    const n = count.get(frame) ?? 0
    if (n === 0)
      r.fail(frame, 'planned frame has no entry in frames or siteSettings and is not returned', 'pictures')
    else if (n > 1)
      r.fail(frame, `planned frame appears ${n} times across frames, siteSettings and returns`, 'pictures')
    else r.ok()
  }
  const isTwin = (frame) => Boolean(idx.frames.get(frame)?.twinOf)
  for (const [frame, n] of count) {
    if (idx.wishes.has(frame)) continue
    const entry = view.entries.find((e) => e.frame === frame)
    if (!entry || !(entry.source === 'twin' || isTwin(frame)))
      r.fail(
        frame,
        'frame is not planned; only planned frames and twins of planned frames get an entry',
        'pictures'
      )
    else if (n > 1) r.fail(frame, `twin frame appears ${n} times`, 'pictures')
    else r.ok()
  }
}

// P02. Every frame id named by the manifest exists in the kit.
export function checkP02({ R, view, idx }) {
  const r = R.p02
  for (const x of [...view.entries, ...view.returns.map((t) => ({ ...t, list: 'returns' }))]) {
    if (idx.frames.has(x.frame)) r.ok()
    else
      r.fail(
        x.list === 'returns' ? `returns ${x.frame}` : where(x),
        'frame id does not exist in the kit',
        idx.wishes.has(x.frame) ? 'plan' : 'pictures'
      )
  }
}

// P12. A frame is hidden only where the kit says the block still looks whole without it, and no placed file is a demo
// picture of the template (same path as a kit demo picture, or the same sha256 when the kit records one).
export function checkP12({ R, view, idx }) {
  const r = R.p12
  for (const e of view.entries) {
    const f = idx.frames.get(e.frame)
    if (!f) continue
    if (e.source === 'hide') {
      if (f.canHide === true) r.ok()
      else r.fail(where(e), 'hidden, but the kit frame cannot be hidden (canHide is not true)', 'pictures')
      continue
    }
    const files = [e, e.dark].filter(Boolean)
    const demo = files.find(
      (x) =>
        idx.demoPaths.has(x.file) ||
        idx.demoPaths.has(x.sitePath) ||
        idx.demoHashes.has(String(x.sha256).toLowerCase())
    )
    if (demo) r.fail(where(e), `the file ${demo.file} is a demo picture of the template`, 'pictures')
    else r.ok()
  }
}

// P13. A frame the kit marks not writable gets no picture in frames: it is returned to the planner, or, when it is a
// template level picture painted behind blocks, listed in siteSettings. siteSettings holds nothing else.
export function checkP13({ R, view, idx }) {
  const r = R.p13
  for (const e of view.entries) {
    const f = idx.frames.get(e.frame)
    if (!f) continue
    if (e.list === 'siteSettings') {
      if (f.paintedBehind === true) r.ok()
      else
        r.fail(
          where(e),
          'only a template level picture painted behind blocks goes in siteSettings; this frame is not one',
          'pictures'
        )
    } else if (f.writable === false)
      r.fail(
        where(e),
        `the kit marks this frame not writable (${String(f.writableReason ?? 'no reason given').slice(0, 80)}); return it to the planner or list it in siteSettings`,
        'pictures'
      )
    else r.ok()
  }
}
