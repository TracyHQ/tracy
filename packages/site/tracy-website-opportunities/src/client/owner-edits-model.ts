/**
 * The owner's choices for the site itself on the Business facts page (#537, R14 to R16), as the Details answer gives
 * them: the bands switched on or off (`bands`), the social networks a typed link may name (`socialNetworks`), the links
 * the owner typed (`opportunity.candidate.siteSocials`), and the calls that change them. Pure: the doors themselves are
 * built in `owner-doors.ts`; nothing here fetches.
 */

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** The bands an owner switches through the facts door as `band_<band>`. */
export const OWNER_BANDS = ['brand', 'keyMessages', 'reviews', 'media', 'socials'] as const
export type OwnerBand = (typeof OWNER_BANDS)[number]
export type OwnerBands = Record<OwnerBand, boolean>

/** The answer's `bands`: a band is on unless the server says false (an older answer has none: all on). */
export function ownerBandsOf(raw: unknown): OwnerBands {
  const held = rec(raw)
  return Object.fromEntries(OWNER_BANDS.map((b) => [b, held[b] !== false])) as OwnerBands
}

export interface SocialNetworkView {
  id: string
  label: string
  placeholder: string
}

/** The answer's `socialNetworks`, in the server's order; anything malformed is dropped. */
export function socialNetworksOf(raw: unknown): SocialNetworkView[] {
  return (Array.isArray(raw) ? raw : []).flatMap((n) => {
    const id = text(rec(n).id)
    const label = text(rec(n).label)
    return id === null || label === null ? [] : [{ id, label, placeholder: text(rec(n).placeholder) ?? '' }]
  })
}

/** One link the owner typed for the site. */
export interface SiteSocialView {
  network: string
  url: string
  /** The name of an `other` link; null for a preset network. */
  label: string | null
}

/** `candidate.siteSocials` (`{[network]: {url, label?, at}}`) as links, in the order of the network list. */
export function siteSocialsOf(candidate: unknown, networks: readonly SocialNetworkView[]): SiteSocialView[] {
  const held = rec(rec(candidate).siteSocials)
  const order = (id: string): number => {
    const at = networks.findIndex((n) => n.id === id)
    return at === -1 ? networks.length : at
  }
  return Object.entries(held)
    .flatMap(([network, v]) => {
      const url = text(rec(v).url)
      return url === null || !/^https?:\/\//i.test(url) ? [] : [{ network, url, label: text(rec(v).label) }]
    })
    .sort((a, b) => order(a.network) - order(b.network))
}

/** The body of `PUT …/:id/team`. */
export type TeamEditBody =
  | { action: 'add'; label: string; role?: string | null; photoMediaId?: string | null }
  | { action: 'update'; id: string; label?: string; role?: string | null; photoMediaId?: string | null }
  | { action: 'remove'; id: string }

/** The body of `PUT …/:id/socials`. */
export interface SocialEditBody {
  network: string
  action: 'set' | 'remove'
  url?: string
  handle?: string
  number?: string
  label?: string
}

/** What the owner typed for a network as the door's body: a number for WhatsApp, a link, or a handle. */
export function socialSetBody(network: string, typed: string, label: string): SocialEditBody {
  const value = typed.trim()
  const named = network === 'other' ? { label: label.trim() } : {}
  if (network === 'whatsapp') return { network, action: 'set', number: value }
  if (/^https?:\/\//i.test(value)) return { network, action: 'set', url: value, ...named }
  return { network, action: 'set', handle: value, ...named }
}

/** An upload's answer as the id of the media row, or the refusal code. A file already added gives its own id. */
export function uploadedMediaId(answer: {
  ok: boolean
  code?: string
  body?: unknown
  media?: { id?: unknown }
}): { id: string } | { code: string } {
  if (answer.ok) {
    const id = text(rec(rec(answer.body).media).id)
    return id === null ? { code: 'HTTP' } : { id }
  }
  const held = text(answer.media?.id)
  if (answer.code === 'MEDIA_ALREADY_ADDED' && held !== null) return { id: held }
  return { code: answer.code ?? 'HTTP' }
}

/** The calls of the owner's choices, each settled: a refusal code, or null once saved and the page read again. */
export interface OwnerDoors {
  bands: OwnerBands
  setBand: (band: OwnerBand, on: boolean) => Promise<boolean>
  setMediaHidden: (mediaId: string, hidden: boolean) => Promise<boolean>
  setReviewHidden: (key: string, hidden: boolean) => Promise<boolean>
  team: (edit: TeamEditBody) => Promise<string | null>
  /** A team photo added to Photos & video (`purpose: team`): its media id, or the refusal code. */
  uploadTeamPhoto: (file: File) => Promise<{ id: string } | { code: string }>
  networks: SocialNetworkView[]
  socials: SiteSocialView[]
  setSocial: (body: SocialEditBody) => Promise<string | null>
}
