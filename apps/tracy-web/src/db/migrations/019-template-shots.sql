-- The pictures a Design inspiration card is drawn with, held by Tracy itself.
--
-- 🔒 WHY A TABLE AND NOT THE IMAGE. Until now a card's pictures travelled inside the dsh image
-- (`/opt/tracy/templates/<id>/`, from `provision/templates/` in the repository), so publishing a
-- card meant a commit, a CI build and a fleet deploy — which makes a Publish press on the
-- operations page a press that does nothing for hours. Here, the press lands in this table and the
-- next read of `/api/templates` hands out an absolute address to it. The repository's copies stay
-- as the fallback for a lane whose Tracy cannot be reached, and for a template nobody re-published.
--
-- 🔒 BYTES IN POSTGRES, ON PURPOSE. A card carries a handful of screenshots of a few hundred
-- kilobytes each — small, rarely written, read behind an hour of cache — and putting them here
-- means one backup, one restore and one story about where the product's state is. `putShot` caps
-- each row at 4 MB so this stays true by construction rather than by everybody's good behaviour.
create table template_shots (
  -- The template id off `tracy_setting.json` — `tracy-business`, `tracy-saas`. Held to
  -- `^[a-z0-9][a-z0-9-]*$` in `lib/template-shots.js`: the pair below becomes a public URL.
  template_id text not null,
  -- One path segment, a picture: `business-home-1440.png`. Never a path, never an uppercase letter.
  file text not null,
  -- Derived from the extension when the row is written, never from what an uploader claimed.
  content_type text not null,
  bytes bytea not null,
  -- What was stored, so the door can answer with an ETag a browser can revalidate against.
  sha256 text not null,
  updated_at timestamptz not null default now(),
  primary key (template_id, file)
);
