-- Voice input's speech key, typed on /ops › Agents › Voice instead of set in the environment
-- (15/10/2026). One row for the whole deployment, like `ui_setting`.
--
-- `api_key_cipher` is sealed by `lib/secret-box.js` (AES-256-GCM, its key derived from
-- SESSION_SECRET), the box the Model & AI screen seals provider keys in; the key is never stored in
-- clear and never sent back to a browser. A null cipher, or no row, is no key saved here: the
-- environment's SPEECH_TO_TEXT_API_KEY is used if it is set, else voice input has no key.
create table speech_setting (
  id boolean primary key default true check (id),
  api_key_cipher text,
  updated_by text not null,
  updated_at timestamptz not null default now()
);
