// The rules dsh draws its chat column with, copied so the working line can be measured against the message column
// in a real browser. Each block names its source under vendor/tracy/deepseek-harness/packages/client.
// The left offset of `.dsh-body` stands for the sidebar or rail beside the conversation; it does not enter the
// comparison, the line and the messages share the same box.
export const DSH_COLUMN_CSS = `
.dsh-body {
  margin-left: 62px; display: flex; flex-direction: column;
  /* ui-conversation/src/client/skeleton/ConversationRoot.module.css, .body */
  --dsh-chat-content-width: var(
    --dsh-chat-user-width,
    clamp(680px, calc(var(--dsh-conversation-column-width, 0px) * 0.64), 920px)
  );
  --dsh-composer-card-max-width: calc(var(--dsh-chat-content-width) + 32px);
  --dsh-composer-side-clearance: 16px;
  --dsh-composer-dock-inset: 8px;
}
/* ConversationRoot.module.css, .scrollBody (the height is the fixture's) */
.dsh-scrollBody {
  display: flex; flex-direction: column; height: 240px; margin-right: 2px; overflow-y: auto; scrollbar-gutter: stable;
}
/* ui-chat/src/client/chat/ChatView.module.css, .scroll: sides = composer clearance + 16px */
.dsh-scroll { flex: 0 0 auto; padding: 16px calc(var(--dsh-composer-side-clearance) + 16px); container-type: inline-size; }
/* ChatView.module.css, .column */
.dsh-column { max-width: var(--dsh-chat-content-width); width: 100%; margin: 0 auto; display: flex; flex-direction: column; }
.dsh-message { margin: 0; }
/* ConversationRoot.module.css, .composerSeat in the active phase: the composer chain sits here */
.dsh-composerSeat { display: flex; flex: none; flex-direction: column; position: sticky; bottom: 0; }
`
