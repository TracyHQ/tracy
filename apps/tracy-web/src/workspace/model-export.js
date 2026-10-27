import { Unzip, UnzipInflate, Zip, ZipDeflate } from 'fflate'

/** Rewrite routing fields in exported JSONL logs without buffering attachments or the whole ZIP. */
export function publicModelExport(response, wire) {
  if (!response.ok || !response.body) return response
  let output
  const zip = new Zip((error, chunk) => {
    if (error) throw error
    output.enqueue(chunk)
  })
  const encoder = new TextEncoder()
  const unzip = new Unzip((file) => {
    const entry = new ZipDeflate(file.name, { level: 6 })
    zip.add(entry)
    const isLog = /^(?:subagents\/[^/]+\/)?session(?:\.v\d+)?\.jsonl$/.test(file.name)
    const decoder = new TextDecoder()
    let pending = ''
    file.ondata = (error, bytes, final) => {
      if (error) throw error
      if (!isLog) return entry.push(bytes, final)
      pending += decoder.decode(bytes, { stream: !final })
      const lines = pending.split('\n')
      pending = lines.pop()
      for (const line of lines)
        entry.push(
          encoder.encode(line.trim() ? `${JSON.stringify(wire.encode(JSON.parse(line)))}\n` : '\n'),
          false
        )
      if (final) {
        entry.push(
          encoder.encode(pending.trim() ? JSON.stringify(wire.encode(JSON.parse(pending))) : pending),
          true
        )
        pending = ''
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  const stream = new TransformStream({
    transform(chunk, controller) {
      output = controller
      unzip.push(chunk)
    },
    flush(controller) {
      output = controller
      unzip.push(new Uint8Array(), true)
      zip.end()
    }
  })
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.delete('etag')
  headers.set('cache-control', 'no-store')
  return new Response(response.body.pipeThrough(stream), { status: response.status, headers })
}
