-- ScrapeCreators API key is sealed by lib/secret-box.js like the other WO provider credentials.
alter table wo_ops_setting add column if not exists scrapecreators_key_cipher text;
