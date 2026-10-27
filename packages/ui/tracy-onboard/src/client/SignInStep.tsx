/**
 * Step 1 — "Sign in". This screen draws only after sign-in (dsh's page is behind tracy-web's sign-in
 * gate), so the step is always done and shows who is signed in: the face, the name and the email
 * from `GET /auth/me` (`@tracy/core/seat/viewer`). The signing in itself happens on tracy-web's
 * `/login?onboard=1`, drawn in the same setup frame (agent A of tasks/todo-desktop-onboard-v2.md).
 * While the door has not answered nothing is drawn: no name is invented (CLAUDE.md §0.3).
 */
import type { JSX } from 'react'
import type { Viewer } from '@tracy/core/seat/viewer'
import { Face } from '@tracy/core/team/face'
import type { T } from './text.tsx'

export interface SignInStepProps {
  readonly t: T
  readonly viewer: Pick<Viewer, 'state' | 'name' | 'email' | 'face'>
}

export function SignInStep({ t, viewer }: SignInStepProps): JSX.Element {
  const known = viewer.state === 'signedIn'
  return (
    <div className="tv-ob-stack" data-step="signin">
      {known && (
        <div className="tv-ob-who">
          {viewer.face !== null && <Face face={viewer.face} size={36} />}
          <div className="tv-ob-who-text">
            {viewer.name !== null && <div className="tv-ob-who-name">{viewer.name}</div>}
            {viewer.email !== null && <div className="tv-ob-who-mail">{viewer.email}</div>}
          </div>
          <span className="tv-ob-badge">{t('signin.badge')}</span>
        </div>
      )}
    </div>
  )
}
