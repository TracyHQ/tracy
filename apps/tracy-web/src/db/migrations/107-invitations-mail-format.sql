-- How real invitation mail is packaged, set by an owner/admin in /ops (Setup). The defaults are the
-- spec's: RFC 8058 one-click headers, the Sendy-style footer, a Message-ID on the Tracy host, the
-- template's full HTML and the estimated-opens image. Each one can be turned off to find what makes
-- Gmail file the mail under Promotions; the unsubscribe link itself is never removed.
alter table invitations_real_setting
  add column mail_one_click_header boolean not null default true,
  add column mail_footer text not null default 'notice' check (mail_footer in ('notice', 'personal')),
  add column mail_message_id_domain text not null default 'tracy' check (mail_message_id_domain in ('tracy', 'sender')),
  add column mail_html text not null default 'full' check (mail_html in ('full', 'simple')),
  add column mail_open_image boolean not null default true;
