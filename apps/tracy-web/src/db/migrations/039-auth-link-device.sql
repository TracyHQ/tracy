-- What a lane said about itself when it opened a sign-in round (#661, 30/09/2026).
--
-- WHY. Until 30/09 opening `/signin?n=<nonce>` approved the round on the spot, so any page that could
-- make a signed-in browser load that address signed its owner into a stranger's lane. The page now
-- asks first, and a question is only worth answering if it says what is asking. The lane may send a
-- short description with `POST /auth/link/browser`; the approve page shows it as the lane's OWN
-- words — nothing here checks it, so it is never presented as a verified name.
--
-- Empty = the lane said nothing (every lane in the field on 30/09 sends `{}`), and the page says so.
alter table auth_link add column if not exists device_label text not null default '';
