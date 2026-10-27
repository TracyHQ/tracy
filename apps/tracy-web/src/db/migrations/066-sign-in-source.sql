-- Where a first sign-in came from (`lib/sign-in-source.js`): the cleaned `utm_*` values a link
-- carried. Two doors finish a sign-in in a later request than the one that saw the link, and each
-- keeps the source until then: the beta gate's queued job (`lib/beta-login.js`) and the OAuth
-- state row (`/signin/:provider` → its callback). The email-code door already carries it on
-- `otp_code.admission`. Rows written before this column read as "no source".
alter table beta_login_job add column if not exists source jsonb;
alter table oauth_state add column if not exists source jsonb;
