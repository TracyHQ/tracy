/** Prepare pictures on a separate clock: no CMS writes, and no retry inside the site's write phase. */
export async function preparePicturesBeforeApply(engine, ctx, prepared, ms, graceMs = 10_000) {
  if (!engine.preparePictures) return
  const stop = new AbortController()
  const signal = AbortSignal.any([ctx.signal, stop.signal])
  let timer
  const ended = new Promise((_, reject) => {
    const abort = () => reject(signal.reason ?? new Error('picture preparation stopped'))
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => stop.abort(new Error('picture preparation took too long')), Math.max(1, ms))
  })
  const started = Date.now()
  const work = Promise.resolve().then(() => engine.preparePictures({ ...ctx, signal }, prepared))
  try {
    // Only this caller stores the result. A dependency ignoring abort cannot replace it after the deadline.
    prepared.realPictureShape = await Promise.race([work, ended])
  } catch (error) {
    prepared.realPictureShape = null
    ctx.note(`picture preparation was skipped: ${error instanceof Error ? error.message : error}`)
    if (!ctx.signal.aborted) {
      // Drawers honour abort and hand back owner photos/neutral fills. A hung reader cannot hold text beyond this grace.
      let grace
      try {
        prepared.realPictureShape = await Promise.race([
          work,
          new Promise((resolve) => {
            grace = setTimeout(() => resolve(null), Math.max(1, graceMs))
          })
        ])
      } catch {
        // An unavailable picture phase never stops the site's text writes.
      } finally {
        clearTimeout(grace)
      }
    }
  } finally {
    clearTimeout(timer)
    stop.abort()
    prepared.realPicturesPrepared = true
    ctx.time('picturePrepareMs', Date.now() - started)
  }
}
