/**
 * Page-wide file drag and drop for the composer's chips (`ComposerChips.tsx`). The same listeners
 * dsh's own attachment view installs (ui-attachment `drop-events.ts`), kept here because this
 * plugin now fills that slot instead of it: a drag anywhere on the page shows the drop invitation,
 * and a drop hands the files to the composer's intake, which checks them like a pick or a paste.
 */

export type AddFiles = (files: readonly File[], directories?: ReadonlySet<File>) => void

/**
 * Members of a drop that are directories. A directory's `File` is indistinguishable from an empty
 * file, so the entry API is the only source of that fact; browsers without it report none.
 */
function droppedDirectories(transfer: DataTransfer, files: readonly File[]): ReadonlySet<File> {
  const directories = new Set<File>()
  let index = 0
  for (const item of transfer.items) {
    if (item.kind !== 'file') continue
    const file = files[index++]
    if (typeof item.webkitGetAsEntry !== 'function') continue
    if (item.webkitGetAsEntry()?.isDirectory !== true) continue
    if (file !== undefined) directories.add(file)
  }
  return directories
}

/**
 * Install the document listeners for one mounted composer.
 * @param canAcceptDrop - whether a drop may add files right now.
 * @param onAddFiles - the composer's intake.
 * @param setActive - publish whether a file drag is over the page.
 * @returns cleanup for exactly these listeners.
 */
export function installComposerDrop(
  canAcceptDrop: boolean,
  onAddFiles: AddFiles,
  setActive: (active: boolean) => void
): () => void {
  let depth = 0
  const files = (event: DragEvent): DataTransfer | null => {
    const transfer = event.dataTransfer
    return transfer !== null && transfer.types.includes('Files') ? transfer : null
  }
  const reset = (): void => {
    depth = 0
    setActive(false)
  }
  const onEnter = (event: DragEvent): void => {
    if (files(event) === null) return
    event.preventDefault()
    depth += 1
    setActive(true)
  }
  const onOver = (event: DragEvent): void => {
    const transfer = files(event)
    if (transfer === null) return
    event.preventDefault()
    transfer.dropEffect = canAcceptDrop ? 'copy' : 'none'
  }
  const onLeave = (event: DragEvent): void => {
    if (files(event) === null) return
    depth = Math.max(0, depth - 1)
    if (depth === 0) setActive(false)
    const outside =
      event.clientX <= 0 ||
      event.clientY <= 0 ||
      event.clientX >= window.innerWidth ||
      event.clientY >= window.innerHeight
    if ((event.target === document.documentElement || event.target === document.body) && outside) reset()
  }
  const onDrop = (event: DragEvent): void => {
    const transfer = files(event)
    if (transfer === null) return
    event.preventDefault()
    reset()
    if (!canAcceptDrop) return
    const dropped = [...transfer.files]
    onAddFiles(dropped, droppedDirectories(transfer, dropped))
  }
  document.addEventListener('dragenter', onEnter)
  document.addEventListener('dragover', onOver)
  document.addEventListener('dragleave', onLeave)
  document.addEventListener('drop', onDrop)
  window.addEventListener('dragend', reset)
  return () => {
    document.removeEventListener('dragenter', onEnter)
    document.removeEventListener('dragover', onOver)
    document.removeEventListener('dragleave', onLeave)
    document.removeEventListener('drop', onDrop)
    window.removeEventListener('dragend', reset)
  }
}
