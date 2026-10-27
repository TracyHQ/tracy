/**
 * Names coined for something that already had a name (docs/references/vocabulary.md §4, second
 * tier). One table, read by the `vocabulary` gate (files) and by the Stop hook that checks an
 * agent's reply (scripts/hooks/reply-vocabulary.mjs) — two readers, never two lists.
 */
export const COINED = [
  {
    word: 'receiver', // vocabulary-allow — this is the table that bans it
    instead: 'Claude Cowork plugin (Joomla com_claudecowork, WordPress claude-cowork); keys: cowork*'
  }
]
