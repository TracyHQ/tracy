/**
 * Picking a logo or favicon file in the sheet: read it in the browser, refuse it there with its own numbers when the
 * door would (`fileProblem`), else upload it at once (`POST /api/sites/brand-files`) and answer the tile with the id
 * the door gives back. A refused or failed file leaves the tile as it was and says why under it; Create site is never
 * held up by it.
 */
import { useEffect, useRef, useState } from 'react'

import { fileProblem, roleOf, serverProblem, uploadBrandFile } from './brand-picture.mjs'
import { readPicture, rememberPreview } from './brand-previews'

/** Which tile a picture is for: a logo tile (`variants` of the served question) or the favicon. */
export type BrandTile = 'light' | 'dark' | 'single' | 'favicon'

/** Why the last file picked for a tile was not added: its name, and the line (a string key with its numbers). */
export interface TileRefusal {
  file: string
  key: string
  params?: Record<string, string | number>
}

/**
 * The tiles of one brand question and what picking a file does to them. `picked` is the answer by tile (upload ids);
 * `onPicked` hands back the next one.
 */
export function useBrandUpload(
  question: 'logo' | 'favicon',
  picked: Record<string, string>,
  onPicked: (next: Record<string, string>) => void
) {
  const [busy, setBusy] = useState<Partial<Record<BrandTile, boolean>>>({})
  const [refused, setRefused] = useState<Partial<Record<BrandTile, TileRefusal>>>({})
  // Read when an upload lands: another tile may have changed while it was on its way.
  const latest = useRef(picked)
  latest.current = picked
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refuse = (tile: BrandTile, refusal: TileRefusal | null) =>
    setRefused((now) => {
      const next = { ...now }
      if (refusal) next[tile] = refusal
      else delete next[tile]
      return next
    })

  const pick = async (tile: BrandTile, file: File) => {
    refuse(tile, null)
    const read = await readPicture(file)
    const local = fileProblem(question, read)
    if (local) {
      if (mounted.current) refuse(tile, { file: file.name, ...local })
      return
    }
    setBusy((now) => ({ ...now, [tile]: true }))
    const sent = await uploadBrandFile(file, roleOf(question, tile))
    // The sheet was closed while the file was on its way: the answer it held may have moved on since.
    if (!mounted.current) return
    setBusy((now) => ({ ...now, [tile]: false }))
    if (!sent.ok) {
      refuse(tile, { file: file.name, ...serverProblem(sent.code, read) })
      return
    }
    rememberPreview(sent.id, read)
    onPicked({ ...latest.current, [tile]: sent.id })
  }

  const remove = (tile: BrandTile) => {
    refuse(tile, null)
    const next = { ...latest.current }
    delete next[tile]
    onPicked(next)
  }

  return { busy, refused, pick, remove }
}
