// One worker thread of the sharpness gate's pool (photo-sharpness-pool.js): it answers each message with judgePhoto's
// verdict, computed by the very same code the main thread would run.
import { parentPort } from 'node:worker_threads'
import { judgePhoto } from './photo-sharpness.js'

parentPort?.on('message', async ({ id, bytes, slot, source, scale }) => {
  try {
    const result = await judgePhoto(bytes, slot, { source, scale })
    parentPort.postMessage({ id, ok: true, result })
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: String(error?.stack ?? error) })
  }
})
