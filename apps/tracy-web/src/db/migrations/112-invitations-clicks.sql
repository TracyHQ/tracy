-- Estimated clicks of customer invitations. With the switch on (Setup › Email format, off by
-- default), each web link of an invitation points at /c/<token>/<n> on the Tracy host, which counts
-- the press and sends the reader on to the link as written. Only the token's sha256 is stored, with
-- the first counted press and a capped count; no IP, no user agent. The links themselves live in the
-- send's sealed payload. Presses that look like a mail scanner (in the first two minutes after
-- sending, or a robot's user agent) are forwarded but not counted.
alter table invitations_real_setting add column mail_click_tracking boolean not null default false;
alter table invitations_real_send add column click_token_hash text unique;
alter table invitations_real_send add column first_click_at timestamptz;
alter table invitations_real_send add column click_count int not null default 0 check (click_count between 0 and 1000);
