/**
 * Settings › Team (who at Tracy opens /ops) and the View as user icon beside a customer's email.
 * Unknown refusal codes are shown as the code itself, never a guessed sentence.
 */
export const NS = 'team'

/** Files whose visible words belong to this namespace (paths under `src/`; the gate scans them). */
export const SCREENS = ['Team.tsx', 'ViewAsUserButton.tsx', 'view-as-user-api.ts'] as const

export const en = {
  'team.title': 'Team',
  'team.lead':
    "Who at Tracy can open this surface. A person here holds an accepted seat on Tracy's own workspace, the same book that decides who reaches a customer site.",
  'team.role.owner': 'owner',
  'team.role.admin': 'admin',
  'team.role.developer': 'developer',
  'team.roleNote.owner': 'everything, including who else is here',
  'team.roleNote.admin': 'every screen; invites admins and developers; removes all but owners',
  'team.roleNote.developer': 'reads every screen; changes nobody',
  'team.roleOption': '{role}: {note}',

  'team.refusal.LAST_OWNER': 'This is the last owner. Add another owner first.',
  'team.refusal.OWNER_REMOVAL_NEEDS_OWNER': 'Only an owner can remove an owner.',
  'team.refusal.ROLE_NOT_ALLOWED': 'Your role cannot grant that role.',
  'team.refusal.ALREADY_A_MEMBER': 'They are already on the team.',
  'team.refusal.REMOVAL_CODE_INVALID': 'That code is not right.',
  'team.refusal.REMOVAL_CODE_EXHAUSTED': 'Too many wrong codes. Ask for a new one.',
  'team.refusal.MAIL_NOT_SENT': 'The code could not be mailed. Try again in a moment.',
  'team.refusal.INVALID_REQUEST': 'Check the email address.',
  'team.refusal.CROSS_ORIGIN_REFUSED': 'That request did not come from this page.',
  'team.refusal.none': 'Something failed.',

  'team.whyNot.notManager': 'Only an owner or admin can remove people',
  'team.whyNot.lastOwnerSelf': 'You are the last owner: you cannot remove yourself',
  'team.whyNot.lastOwner': 'The last owner cannot be removed',
  'team.whyNot.ownerOnly': 'Only an owner can remove an owner',
  'team.inviteNotMailed':
    'They are on the list, but the invitation mail did not go. Press Send invitation again to retry it.',

  'team.add.button': 'Add member',
  'team.add.title': 'Add member',
  'team.add.description':
    'They get an invitation by mail and accept it themselves: nothing here grants access on their behalf.',
  'team.add.email': 'Email',
  'team.add.role': 'Role',
  'team.add.send': 'Send invitation',
  'team.close': 'Close',
  'team.cancel': 'Cancel',

  'team.remove.title': 'Remove {email}?',
  'team.remove.description':
    'A code was mailed to {to}. It is valid for ten minutes and works only for this one removal. Their next request is refused: they do not keep access until they sign out. Their seats on customer sites are not touched.',
  'team.remove.you': 'you',
  'team.remove.code': 'Code',
  'team.remove.confirm': 'Remove',

  'team.empty': 'Nobody but you',
  'team.members': 'Members',
  'team.newestLast': 'newest last',
  'team.you': 'you',
  'team.invited': 'invited',
  'team.removeButton': 'Remove',

  'team.viewAs.label': 'View as {email}',
  'team.viewAs.title': 'View as this user',
  'team.viewAs.error.NO_SUCH_ACCOUNT': 'This email has no Tracy account yet, so there is nothing to view.',
  'team.viewAs.error.STAFF_TARGET': 'Tracy staff accounts cannot be viewed.',
  'team.viewAs.error.SELF': 'This is your own account.',
  'team.viewAs.error.FORBIDDEN': 'Only an owner or admin of Tracy staff can view as a customer.',
  'team.viewAs.error.FAILED': 'Could not open the view. Try again.'
} as const
