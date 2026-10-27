# Voice site-building widget

An experiment on dev, turned on by the `website-voice-widget` switch at `/ops/ui` (off by default).
Page `/widget`, script `/widget/embed.js`; the script creates an iframe and only asks for the mic after a user action.
Tracy owns the document inside the iframe (CSS mode A) and injects no reset into the embedding page.

Data comes from the deployment's own template and design system doors; there is no separate catalogue.
Voice uses the provider chosen at `/ops/voice` through the same backend as chat. The answering model uses the `assistant` door in the provider book.
Site creation calls the `/api/sites` door under the verified person's identity; nothing is granted to a visitor who has not signed in.

The OTP goes straight from the form, or from the verifying mic's own transcript, to `/verify`. It never reaches the model,
history, sessionStorage or logs. Google uses the existing OAuth with the callback unchanged; each flow is single use
and bound to the visitor, and the popup only reports completion to a same-origin opener. Tokens never go through postMessage.

The visitor cookie supports Partitioned on HTTPS so a cross-domain iframe gets its own session. The verified sign-in
cookie is kept in server memory, bound to the visitor, and re-checked with the standard session reader before use.
The embed never needs to read a sign-in cookie from a foreign domain. Browsers that do not support Partitioned cookies
block them too; do not claim every-browser compatibility before acceptance testing.

Conversation, brief, choices and build identity are sealed in `widget_conversation`,
bound to the visitor and the verified account, TTL 24 hours from the last successful write. A CAS revision keeps two tabs
from overwriting each other; an unfinished model/create turn only comes back for the user to view and confirm, never auto-replayed.
A model turn that fails outright (model error, broken JSON) clears `inflight` and keeps the customer's words in `clientPending` for review,
so it does not block moving to native chat; an `inflight` saved before a restart and older than `INFLIGHT_STALE_MS` (5 minutes) does not
block either. A create that lost its answer keeps the `inflight` mark with the exact request sent; the next click resends it unchanged
under the same `buildId` (the create door is idempotent by `buildId`), so it gets the old site/job back instead of creating a second site.
No auth cookie, OTP, speech token or provider key is stored in the payload. The iframe's sign-in cookie lives in RAM,
with a revocable binding in `widget_sign_in`: keyed by the visitor digest (the proof
is the widget's random visitor cookie), holding only the account, the email digest, `jti` and expiry — never the cookie.
After a restart, the visitor cookie finds the binding and re-mints exactly the old token (same email, `exp`, `jti`), then checks it like
any session: expired, signed out (revocation book by `jti`), expired conversation or a different visitor cookie → not
restored. Signing out in the widget (`/widget/api/native/logout`) deletes the binding; deleting the conversation or the account deletes it too.
Guests use an internal account with no seat; that token is never sent to the browser.

`/widget/api/build-status` uses the visitor's own build pointer and takes no site/job ID from the model.
The job door `inspect=1` checks session, grant, job/site and creator before reading the stored snapshot with a SELECT.
It does not poll the host or perform the handover. UI and model use the same server-made facts and links, with clear
write/check times; a host "done" is never read as handed over, and sign-in is never asked again while the session is valid.

`assets/voice.js` is bundled from the `voice-capture`, `voice-player` and `voice-link` modules of
`tracy-chat-input`, together with dsh chat's real module; there is no second STT implementation.
A change to the voice source requires rebuilding the artifact with `scripts/build-widget-voice.mjs`.

Embed from a deployment with the switch on (replace the origin with yours):

```html
<script src="https://<your-tracy-origin>/widget/embed.js" defer></script>
```

The script creates the iframe itself; set `data-target="#my-container"` to choose where it goes.
Once started, mobile uses its own conversation area; the orb and composer do not scroll with the transcript.
The catalogue only switches views inside the same document and does not restart the mic. Keyboard height comes from
VisualViewport; this does not replace acceptance testing on a real Safari/iPhone.

Repeatable checks in the repo:
`node --test apps/tracy-web/test/widget*.test.mjs apps/tracy-web/test/e2e/widget-voice-auth.test.mjs`.
The Chromium tests use fake API/STT/TTS to check the mechanism; they send no email and call no provider.

Reading `/widget/api/state` or the catalogue creates no visitor: no cookie, no DB row, no memory slot.
A visitor is created on the first write (a chat turn, a choice, turning on the mic, starting sign-in); one IP creates at most
20 visitors per hour, 5 per minute (429 `WIDGET_VISITOR_LIMIT`). Memory holds 512 visitors; when full it drops the anonymous visitor
idle the longest, and when all are busy it returns 503 `WIDGET_AT_CAPACITY` with `Retry-After: 30`. A cron deletes expired
conversations in batches every 10 minutes.

Each anonymous visitor speaks under its own speech identity `widget-guest+<hex16>@widget.invalid`, derived by the host from
the visitor, never taken from the browser: quota and voice sessions are split per visitor and no longer cut each other off. Each visitor gets
3 minutes of STT and 2,000 TTS characters per day; all anonymous visitors together get at most 30 minutes and 10,000 characters, never more
than half the deployment budget; each IP gets at most 2 concurrent STT sessions, opening sessions in a burst of 3 then about 2 per minute
(`ANONYMOUS_SPEECH` in `lib/speech.js`). Public doors still read with the shared internal guest. The internal token is
re-minted after `SESSION_RENEW_AFTER_S` or when 5 minutes remain; the backend never passes a renewed token or cookie to the browser.
