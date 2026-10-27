/**
 * Where an import's webroot and database go — asks for permission, never holds the key.
 *
 * This host half does NOT know where the bucket is, has NO S3 key, and does NOT name objects. It says
 * what it is uploading for which site; `cowork-web` signs the assertion, the seat book signs the URL, then both step aside.
 * Bytes go straight from here to R2 (ADR 0023 §1, ADR 0049 §3) — a Worker carrying 300 MB is both costly and the wrong
 * role, and a customer container holding the storage key holds every customer's storage key.
 *
 * 🔒 AUTHENTICATION IS THE PRESSING PERSON'S OWN COOKIE, FORWARDED UNCHANGED.
 *
 * In production dsh serves BEHIND `cowork-web` on **the same origin** — so browser requests
 * to `/api/tracy-add-site/*` already carry the session cookie, and the host half just attaches that cookie when
 * calling back out to `/api/sites/...`. No secret has to be issued to the container, and the upload's rights
 * are exactly those of the person sitting there — the session ends, it ends; the seat is taken, it is gone.
 *
 * The alternative considered and rejected: issue the container its own token. That turns every customer container
 * into a secret store that outlives the user's session, with nothing to revoke it when the seat is withdrawn.
 */

/** The two things an import packs. */
export type ArtifactKind = 'webroot' | 'db'

/** What S3 needs when closing a multipart upload — order must be right, ETag taken from the PUT itself. */
export interface UploadedPart {
  PartNumber: number
  ETag: string
}

export interface ArtifactCaller {
  /** `fetch` used to call `cowork-web`; injected for tests. */
  fetchImpl?: typeof fetch
  /** The root of `cowork-web`, e.g. `https://cowork.tracy.ai`. */
  origin: string
  /** The session cookie, verbatim as the browser sent it. */
  cookie: string
}

export class ArtifactRefused extends Error {
  constructor(readonly code: string) {
    super(`The relay refused an artifact call: ${code}`)
    this.name = 'ArtifactRefused'
  }
}

/** One control call — a few hundred bytes, never carrying content. */
async function call<T>(
  caller: ArtifactCaller,
  siteKey: string,
  step: string,
  body: Record<string, unknown>
): Promise<T> {
  const fetchImpl = caller.fetchImpl ?? fetch
  const response = await fetchImpl(
    `${caller.origin}/api/sites/${encodeURIComponent(siteKey)}/artifacts/${step}`,
    {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', cookie: caller.cookie },
      body: JSON.stringify(body)
    }
  )
  const parsed = (await response.json().catch(() => null)) as (T & { code?: string }) | null
  if (!response.ok || !parsed) throw new ArtifactRefused(parsed?.code ?? `HTTP_${response.status}`)
  return parsed
}

/**
 * Storage of ONE site.
 *
 * There is no configuration step on this machine. What it needs is a seat on the site, and that is
 * checked on the other side on every call rather than guessed here.
 */
export function artifactsFor(siteKey: string, caller: ArtifactCaller) {
  return {
    /** One URL for a whole small object — the database dump, which needs no multipart. */
    async signPut(kind: ArtifactKind): Promise<{ key: string; url: string }> {
      return call(caller, siteKey, 'put', { kind })
    },
    /** Open a multipart upload. The other side names the key. */
    async begin(kind: ArtifactKind): Promise<{ key: string; uploadId: string }> {
      return call(caller, siteKey, 'begin', { kind })
    },
    /** A short-lived URL, used exactly once for exactly one part. */
    async signPart(key: string, uploadId: string, partNumber: number): Promise<string> {
      const { url } = await call<{ url: string }>(caller, siteKey, 'part', { key, uploadId, partNumber })
      return url
    },
    /** Join the parts. */
    async finish(key: string, uploadId: string, parts: UploadedPart[]): Promise<void> {
      await call(caller, siteKey, 'finish', { key, uploadId, parts })
    },
    /**
     * Throw away an unfinished upload.
     *
     * Best-effort by nature: this runs on the failure path, and storage refusing to let go of
     * an unfinished upload must not turn one error into two.
     */
    async abandon(key: string, uploadId: string): Promise<void> {
      await call(caller, siteKey, 'abort', { key, uploadId }).catch(() => undefined)
    },
    /** Drop a finished object this run no longer needs. Best effort: cleaning never fails a run. */
    async remove(key: string): Promise<void> {
      await call(caller, siteKey, 'delete', { key }).catch(() => undefined)
    }
  }
}

export type SiteArtifacts = ReturnType<typeof artifactsFor>

/**
 * Size of one multipart part.
 *
 * 5 MB is the floor S3 requires for every part but the last; 8 MB gives a 300 MB webroot ~38 parts — few
 * enough that each part is one signing, small enough that a failed attempt costs 8 MB again rather than the whole file.
 */
export const PART_SIZE = 8 * 1024 * 1024

/**
 * Move a byte stream straight from the old site to storage, WITHOUT touching disk.
 *
 * 🔒 NO TEMP FILE. The dsh container has a small disk shared by many customers; dumping 300 MB there fills
 * someone else's machine. This is also why the function takes a `ReadableStream` rather than a
 * `Buffer`: taking a Buffer means reading everything into RAM before the first byte is sent.
 *
 * A run that fails midway is `abandon`ed — otherwise orphaned parts stay in storage and someone
 * pays for them forever.
 * @param artifacts The site's storage.
 * @param kind What is being uploaded.
 * @param stream The byte source.
 * @param onProgress Bytes sent so far, for the console.
 * @returns The key of the object just built.
 */
export async function uploadStream(
  artifacts: SiteArtifacts,
  kind: ArtifactKind,
  stream: ReadableStream<Uint8Array>,
  { fetchImpl = fetch, onProgress }: { fetchImpl?: typeof fetch; onProgress?: (bytes: number) => void } = {}
): Promise<string> {
  const { key, uploadId } = await artifacts.begin(kind)
  const parts: UploadedPart[] = []
  let sent = 0

  try {
    const reader = stream.getReader()
    let buffered: Uint8Array[] = []
    let bufferedSize = 0

    const flush = async (final: boolean) => {
      while (bufferedSize >= PART_SIZE || (final && bufferedSize > 0)) {
        const take = final && bufferedSize < PART_SIZE ? bufferedSize : PART_SIZE
        const chunk = new Uint8Array(take)
        let filled = 0
        while (filled < take) {
          const head = buffered[0]
          const need = take - filled
          if (head.length <= need) {
            chunk.set(head, filled)
            filled += head.length
            buffered.shift()
          } else {
            chunk.set(head.subarray(0, need), filled)
            buffered[0] = head.subarray(need)
            filled += need
          }
        }
        bufferedSize -= take

        const partNumber = parts.length + 1
        const url = await artifacts.signPart(key, uploadId, partNumber)
        // 🔒 THIS CALL GOES STRAIGHT TO R2, not through `cowork-web`. The URL is presigned, so no auth
        // header is needed — and for that same reason it must not detour through a Worker: bytes are not the
        // Worker's job (ADR 0023 §1).
        const put = await fetchImpl(url, { method: 'PUT', body: chunk })
        if (!put.ok) throw new ArtifactRefused(`PART_${partNumber}_FAILED`)
        const etag = put.headers.get('etag')
        if (!etag) throw new ArtifactRefused(`PART_${partNumber}_NO_ETAG`)
        parts.push({ PartNumber: partNumber, ETag: etag })
        sent += take
        onProgress?.(sent)
      }
    }

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value && value.length > 0) {
        buffered.push(value)
        bufferedSize += value.length
        await flush(false)
      }
    }
    await flush(true)
    buffered = []

    if (parts.length === 0) throw new ArtifactRefused('EMPTY_ARCHIVE')
    await artifacts.finish(key, uploadId, parts)
    return key
  } catch (error) {
    await artifacts.abandon(key, uploadId)
    throw error
  }
}
