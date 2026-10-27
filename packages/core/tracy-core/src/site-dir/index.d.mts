/**
 * Hand-written types for `index.mjs`, kept in sync BY HAND — same arrangement as `../config`.
 */

export const ALLOWED_FOLDERS_HEADER: 'x-dsh-allowed-folders'

export function firstGrantedFolder(raw: string | string[] | undefined): string | null

export function siteDirFor(
  config: { siteDir?: string },
  req: { headers?: Record<string, string | string[] | undefined> }
): string
