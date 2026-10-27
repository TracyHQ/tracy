/**
 * One person's face, drawn the same way on every Tracy surface: the account's photo when it has
 * one, else one letter on the colour of their account. The server decides both (`personFace`,
 * `apps/tracy-web/src/lib/person-face.js`); nothing here hashes a name or an address, so a person
 * wears one face on the Team tab, My Sites, the start screen and the Comments tab alike.
 *
 * 🔒 THIS FILE IMPORTS REACT AND NOTHING ELSE OF THE UI. It is also served on its own as
 * `@tracy/core/team/face`, for plugins that build JavaScript only (`@tracy/dsh-chat-input`): the
 * rest of `@tracy/core/team` pulls `@tracy/ui`, whose entry imports `tokens.css` — that build cannot
 * load CSS, and the dsh page must not get a second sheet of tokens (CLAUDE.md §2 rule 4). For the
 * same reason the face is drawn with inline style, never a Tailwind class: a mode-B plugin has no
 * utilities to resolve one.
 */
import { type CSSProperties, type JSX, useEffect, useState } from 'react'

import { NEUTRAL_FACE_COLOUR } from './address-face.mjs'

export { type Cluster, clusterOf, isMember } from './roster'

/** The face the server sends with a person: `/api/team` seats, comment authors, `/auth/me` `face`. */
export interface PersonFace {
  initial: string
  color: string
  avatarUrl?: string | null
}

/**
 * `NEUTRAL_FACE_COLOUR` — the grey of a face the server named no colour for. `addressFace` — the
 * face of an address (or a record's name) no Tracy account backs: its first character on that grey,
 * the ONE person letter a client takes itself (an invitee, a person the Changes feed could not
 * match to a seat). Both live in plain JavaScript so pure plugin modules can import them too.
 */
export { addressFace, NEUTRAL_FACE_COLOUR } from './address-face.mjs'

/**
 * Sent on `window` after the Team tab wrote a seat (invite, role change, removal, an approved
 * request): `detail` is `{ siteKey }`. Whoever counts that site's people reads its book again.
 */
export const TEAM_CHANGED_EVENT = 'tracy:team-changed'

/**
 * One face, `size` pixels round. A photo that fails to load gives way to the letter.
 * @param ring - a 2px ring in this colour (the ground the face stands on), so faces that overlap
 *   stay apart.
 * @param title - the person's name, for a pointer that rests on the face; without it the face is
 *   decoration and hidden from assistive technology (the name stands next to it).
 * @param fill - take the box of the parent instead of `size` pixels (a caller that sizes the face
 *   with its own class); `size` then only sets the letter.
 */
export function Face({
  face,
  size = 24,
  title,
  ring,
  fill = false,
  className
}: {
  face: PersonFace
  size?: number
  title?: string
  ring?: string
  fill?: boolean
  className?: string
}): JSX.Element {
  const photo = face.avatarUrl ?? null
  const [broken, setBroken] = useState<string | null>(null)
  useEffect(() => setBroken(null), [photo])
  const style: CSSProperties & { cornerShape?: string } = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 'none',
    boxSizing: 'border-box',
    width: fill ? '100%' : size,
    height: fill ? '100%' : size,
    overflow: 'hidden',
    borderRadius: '50%',
    // dsh gives every box a superellipse corner, which turns a disc into a rounded square.
    cornerShape: 'round',
    background: face.color || NEUTRAL_FACE_COLOUR,
    color: '#ffffff',
    fontSize: Math.round(size * 0.45),
    fontWeight: 600,
    lineHeight: 1,
    userSelect: 'none',
    ...(ring ? { boxShadow: `0 0 0 2px ${ring}` } : {})
  }
  return (
    <span
      className={className}
      data-tracy-face=""
      style={style}
      title={title}
      aria-hidden={title === undefined ? true : undefined}
    >
      {photo !== null && broken !== photo ? (
        <img
          src={photo}
          alt=""
          onError={() => setBroken(photo)}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        face.initial
      )}
    </span>
  )
}

/**
 * Faces side by side, each over the one before it by 8px — the people cluster of My Sites and the
 * Team start card.
 * @param ring - the colour of the ground under the stack; each face is ringed in it.
 */
export function FaceStack({
  people,
  size = 20,
  ring,
  className
}: {
  people: readonly (PersonFace & { id: string })[]
  size?: number
  ring: string
  className?: string
}): JSX.Element {
  return (
    <span data-tracy-faces="" className={className} style={{ display: 'inline-flex', flex: 'none' }}>
      {people.map((person, i) => (
        <span key={person.id} style={{ display: 'inline-flex', marginLeft: i === 0 ? 0 : -8 }}>
          <Face face={person} size={size} ring={ring} />
        </span>
      ))}
    </span>
  )
}
