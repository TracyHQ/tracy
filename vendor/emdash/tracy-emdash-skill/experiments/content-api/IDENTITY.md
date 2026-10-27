# Repeater lifecycle experiment — not enabled by the reader

Measured on the isolated Business site, emdash 0.38.0 (admin reports 8975a850),
Node SSR. The native plugin in this directory is a fixture experiment only.
It must never be installed as production identity support in its current form.

`tracyRowId` is accepted by native group validation (`z.object(...).loose()`).
The default admin repeater strips `_key`, but preserves other properties when
editing or moving existing rows. Two identical rows were assigned distinct
UUIDs through native PUT. Real admin edit and pointer reorder retained those
UUIDs; removal followed by addition produced a new UUID; publish and reload
preserved stored metadata. No GET allocated metadata.

The decisive failure: a newly added row receives its UUID in the server's
`content:beforeSave` hook, but the admin form does not adopt it on autosave.
Editing the same new row again before reload submits no metadata and receives
a different UUID. `router.tsx` autosave completion intentionally patches queries
with the submitted payload and avoids refetching into the form while typing.
There is no value/index/name match in this experiment to conceal that failure.

Native entry duplicate was also exercised via the admin list button. It copies
published data including all row UUIDs. `EmDashRuntime.handleContentDuplicate`
(0.38.0 source line 3221) calls the low-level handler directly and refreshes media
usage, without beforeSave/afterSave. Parent-qualified item identity could make
IDs in different entries distinct, but has not been implemented or accepted here.
There is no per-row duplicate action in the stock RepeaterField.

Official extension surfaces checked:

- `definePlugin` + `content:beforeSave`: create/update before schema validation;
  requires declared `content:write`. Native `_rev` check remains before the hook.
- `PluginAdminConfig.fieldWidgets` + `admin.entry` and schema
  `widget: "pluginId:widgetName"`: ContentEditor checks the override before its
  kind switch. A trusted React widget can allocate UUID on add/duplicate before
  submitting, so the client retains it. Runtime implementation remains unproven.
- afterPublish/afterRestore are notifications; allocating IDs there would be a
  second write with a visibility/race window, not atomic pre-write validation.

Architecture decision needed before supporting repeaters:
1. Prefer a kit-owned native field widget and an explicit metadata/write contract,
   with client UUID allocation and server validation. Migration must be an explicit
   fixture-tested operation with revision checks; draft and published versions need
   separate treatment. API clients must preserve IDs of existing rows, allocate
   new IDs for copies/new incarnations, and fail on ambiguous ID-less replacements.
   Decide parent-qualified IDs and native duplicate/restore/import semantics.
2. If stock editor compatibility is required, request a minimal core/editor change
   to merge identity metadata after save without overwriting newer unsaved edits,
   plus a lifecycle hook covering duplicate before persistence. Do not fork core
   merely because `_key` is stripped; the widget extension exists.

No production migration, registry, core fork, undo/journal/receipt system or
REST write route was added. The experiment was disabled, the original fixture
values restored through native writes/publish, and session-created duplicates
removed. Evidence is in TCH `tasks/evidence/content-api-emdash/identity-admin.json`.
