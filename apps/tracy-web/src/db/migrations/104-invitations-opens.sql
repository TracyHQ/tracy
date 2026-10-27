-- Estimated opens of customer invitations: a 1x1 image with its own random token in each
-- invitation (never in a test send). Only the token's sha256 is stored, with the first load and a
-- capped load count; no IP, no user agent. An image load is not proof the reader read the mail.
alter table invitations_real_send add column open_token_hash text unique;
alter table invitations_real_send add column first_open_at timestamptz;
alter table invitations_real_send add column open_count int not null default 0 check (open_count between 0 and 1000);
