/** dsh-passwords 客户端内部事件：设置卡片与全局覆盖层不共享 React 树，
 * 用 window CustomEvent 同步短生命周期 UI 状态，避免为关闭聊天入口强制刷新整个 dsh 页面。 */
export const CHAT_ENTRY_CHANGED_EVENT = 'dshpw:chat-entry-changed';

export interface ChatEntryChangeDetail {
  enabled: boolean;
}

/** 聊天入口偏好保存成功后立即通知当前页面的 ChatLauncher。 */
export function publishChatEntryChanged(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ChatEntryChangeDetail>(CHAT_ENTRY_CHANGED_EVENT, { detail: { enabled } }),
  );
}
