/**
 * English baseline of the site update strings (#612), part of the `tracy-build-chat` namespace (`strings.ts` spreads
 * them into `en`). The sentence that says how an update, a restore or an undo ended is the server's (`say`,
 * `apps/tracy-web/src/build-draft/rebuild-say.js`); these are only the card's own labels.
 */
export const rebuildEn = {
  'rebuild.title': 'Your site',
  'rebuild.changed': 'Your plan changed since your site was built. Only what you changed is rebuilt.',
  'rebuild.update': 'Update my site',
  'rebuild.restore': 'Restore the previous version',
  'rebuild.undo': 'Undo the unfinished update',
  'rebuild.failed': 'Your request was not sent. Try again.',
  'rebuild.heldFiles': 'Files still on your site'
} as const
