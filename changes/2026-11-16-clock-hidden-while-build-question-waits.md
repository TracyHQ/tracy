# Running "Thinking for" clock hidden while the build chat waits for an answer

- Who: Akemi (with Claude)
- Touches: owners using the build chat

While the chat has asked the owner a question and waits, dsh's running "Thinking for ..." clock kept counting
under "Waiting for your action". The ask-form stylesheet already hid it for its own pointer card; it now hides
it as well while dsh's own question card (used by the build chat) is pending. The clock returns after the answer.
The elapsed time shown after completion is unchanged. Needs a rebuild of `tracy-ask-form` (`lib/client.js`).
