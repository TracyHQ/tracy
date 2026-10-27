// What each scripted scenario asserts, by name. Kept apart from scenarios.mjs (which pulls in the
// stand and HTTP code) so that generate.mjs can list assertion ids without loading either.
//
// An assertion id is `<scenario>#<name>`; `assertionIds` of a case manifest lists them, and a
// red proof names exactly one of them.

/** @type {Record<string, { needs: string[], assertions: string[] }>} */
export const SCENARIOS = {
  'signin-happy': {
    needs: ['stand'],
    assertions: ['otp-in-sink', 'verify-sets-session', 'me-names-the-account']
  },
  'signin-wrong-code': {
    needs: ['stand'],
    assertions: ['wrong-code-sets-no-session', 'wrong-code-not-2xx', 'me-still-anonymous']
  },
  'signin-replay': { needs: ['stand'], assertions: ['used-code-refused', 'replay-sets-no-session'] },
  'signin-new-returning': {
    needs: ['stand'],
    assertions: ['new-address-gets-one-account', 'returning-sign-in-same-account']
  },
  'team-invite-accept': {
    needs: ['stand', 'site'],
    assertions: [
      'invite-accepted-by-door',
      'seat-row-after-accept',
      'seat-role-is-invited-role',
      'no-seat-before-accept'
    ]
  },
  'team-invite-decline': {
    needs: ['stand', 'site'],
    assertions: ['decline-leaves-no-seat', 'declined-cannot-read-site']
  },
  'team-revoke': {
    needs: ['stand', 'site'],
    assertions: ['seat-row-gone-after-revoke', 'revoked-door-refuses']
  },
  'team-viewer-cannot-invite': {
    needs: ['stand', 'site'],
    assertions: ['viewer-invite-refused', 'no-grant-row-from-viewer']
  },
  'team-invalid-role': {
    needs: ['stand', 'site'],
    assertions: ['unknown-role-is-400', 'no-grant-row-for-unknown-role']
  },
  'team-accept-twice': { needs: ['stand', 'site'], assertions: ['one-seat-row-after-two-accepts'] },
  'team-role-change': {
    needs: ['stand', 'site'],
    assertions: ['role-changed-in-seat-book', 'new-role-limits-what-the-seat-may-grant']
  },
  'team-removed-loses-site': { needs: ['stand', 'site'], assertions: ['removed-seat-refused-at-state-door'] },
  'add-site-wordpress': {
    needs: ['stand', 'docker', 'cms-image:wordpress'],
    assertions: ['job-reaches-done', 'site-row-exists', 'home-answers-from-outside']
  },
  'add-site-joomla': {
    needs: ['stand', 'docker', 'cms-image:joomla'],
    assertions: ['job-reaches-done', 'site-row-exists', 'home-answers-from-outside']
  },
  'add-site-emdash': {
    needs: ['stand', 'docker', 'cms-image:emdash'],
    assertions: ['job-reaches-done', 'site-row-exists', 'home-answers-from-outside']
  },
  'add-site-bad-label': { needs: ['stand'], assertions: ['bad-label-refused', 'no-site-row-for-bad-label'] },
  'delete-site-gone': {
    needs: ['stand', 'docker', 'site'],
    assertions: ['db-row-gone', 'outside-http-not-served', 'no-containers-of-label', 'no-volumes-of-label']
  },
  'two-seats-isolation': {
    needs: ['stand', 'site', 'second-site'],
    assertions: ['b-doors-refuse-seat-of-a', 'a-doors-refuse-seat-of-b', 'no-cross-rows-in-seat-book']
  }
}

export const assertionIdsOf = (scenario) =>
  (SCENARIOS[scenario]?.assertions ?? []).map((name) => `${scenario}#${name}`)

/** The assertion ids a legacy journey contributes: its own verdict file, one id per journey. */
export const legacyAssertionIds = (journey) => [`legacy:${journey}#verdict`]
