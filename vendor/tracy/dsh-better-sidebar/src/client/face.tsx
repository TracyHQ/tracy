/**
 * Tracy: one person's face, drawn the one way every person is drawn in this fork — comment pins, the
 * thread card, the `@` picker.
 *
 * MIRRORS TCH `packages/core/tracy-core/src/team/face.tsx` (`Face`, `PersonFace`,
 * `NEUTRAL_FACE_COLOUR`): same contract `{initial, color, avatarUrl}`, same look (the photo when there
 * is one, a photo that fails to load gives way to the letter; round; a white letter on the colour,
 * 45% of the size, weight 600). The fork depends on no `@tracy/*` package, so the few lines are
 * copied, not imported: change both together.
 *
 * The SERVER decides a face (TCH `apps/tracy-web/src/lib/person-face.js`, `personFace`): this file
 * hashes no colour. Only a person the server sent no face for falls back here — the neutral grey and
 * {@link fallbackInitial}, the letter the server would have given.
 */
import { type CSSProperties, type HTMLAttributes, type ReactElement, useEffect, useState } from 'react'

/** The face the server sends with a person: comment authors, `/auth/me` `face`, `/comments/people`. */
export interface PersonFace {
  initial: string
  color: string
  avatarUrl: string | null
}

/** The fill of a face the server named no colour for: a neutral grey, never a colour guessed here. */
export const NEUTRAL_FACE_COLOUR = 'var(--muted-foreground, #94a3b8)'

/**
 * The letter the server's `personFace` gives a person (its rule, copied): the first character — a
 * whole code point — of the display name, else of the email, upper case; `?` with neither.
 */
export function fallbackInitial(person: { name?: string | null; email?: string | null }): string {
  const label = (person.name || person.email || '?').trim() || '?'
  const [first] = label
  return first!.toUpperCase()
}

/**
 * One face, `size` pixels round. A photo that fails to load gives way to the letter.
 * @param fill - take the box of the parent instead of `size` pixels, and its corners (a pin's
 *   teardrop); `size` then only sets the letter.
 * @param rest - any other attribute of the face's own `<span>` (a class, a `data-*` hook).
 */
export function Face({
  face,
  size = 24,
  fill = false,
  ...rest
}: { face: PersonFace; size?: number; fill?: boolean } & Omit<HTMLAttributes<HTMLSpanElement>, 'style'>): ReactElement {
  const photo = face.avatarUrl ?? null
  const [broken, setBroken] = useState<string | null>(null)
  useEffect(() => { setBroken(null) }, [photo])
  const style: CSSProperties & { cornerShape?: string } = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 'none',
    boxSizing: 'border-box',
    width: fill ? '100%' : size,
    height: fill ? '100%' : size,
    overflow: 'hidden',
    borderRadius: fill ? 'inherit' : '50%',
    // dsh gives every box a superellipse corner, which turns a disc into a rounded square.
    cornerShape: 'round',
    background: face.color || NEUTRAL_FACE_COLOUR,
    color: '#ffffff',
    fontSize: Math.round(size * 0.45),
    fontWeight: 600,
    lineHeight: 1,
    userSelect: 'none',
  }
  return (
    <span aria-hidden {...rest} data-tracy-face="" style={style}>
      {photo !== null && broken !== photo
        ? (
            <img
              src={photo}
              alt=""
              onError={() => { setBroken(photo) }}
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )
        : face.initial}
    </span>
  )
}
