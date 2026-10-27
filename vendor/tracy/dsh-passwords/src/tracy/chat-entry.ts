// K6: whether an account sees the floating chat bubble. One rule, read by the plugin's state answer
// and by its test; never a copy.
//
// Off by default (Tracy, 01/09/2026). Upstream shows it unless switched off, so every new seat got a
// bubble nobody asked for. `=== '1'`, not `!== '0'`: "never set" and "set to off" land on the same side.

/** The one setting row this rule reads. */
export interface ChatEntrySettings {
  getSetting(key: string): string | null;
}

/** True only when this account switched the bubble on. */
export function chatEntryEnabled(settings: ChatEntrySettings, userId: number): boolean {
  return settings.getSetting(`chat_enabled:${String(userId)}`) === '1';
}
