---
title: Examples
description: Practical prompts for reading, editing, and checking a Tracy website.
---

Choose a task, replace the page names with your own, and keep the request focused. These are example prompts, not a promise that every website supports every operation.

## Find content without changing it

```text wrap title="Content inventory"
Use Tracy to list the published pages on the connected website.
Show their titles and URLs. Do not change anything.
```

Expected result: real pages from the selected website. If the list is incomplete, ask the app to check pagination instead of guessing missing pages.

## Inspect one page

```text wrap title="Read before deciding"
Find the About page and read its current content.
Show me its title and the record identity, and summarize what it says.
Do not make changes.
```

Expected result: content retrieved from that page, with enough identity to avoid editing a similarly named record.

## Update a title

```text wrap title="Focused edit"
On the page we just read, change the title to "About our team".
Preserve every other field. Return the receipt and read the page again.
```

Expected result: a supported write, a receipt, and a read confirming the title. If the site's capabilities do not permit the operation, the app should explain the refusal.

## Review recent work

```text wrap title="Inspect changes"
Show the recent changes recorded for this Tracy connection.
Inspect the receipt for the last title edit and explain what succeeded.
```

Expected result: receipts for this connection, not an invented history or a claim that all edits elsewhere are included.

## Restore the previous value

```text wrap title="Undo by receipt"
Undo the title edit using its exact apply id.
Read the affected page again and confirm whether its original title is restored.
If any undo step fails, report it without making another change.
```

Expected result: supported steps reverted and verified, or a concrete explanation of why restoration could not complete.

## Ask about limits

```text wrap title="Capability check"
Which website is connected and which content operations can I use here?
Can you change this site's domain or access another website through this connection?
Do not perform any actions.
```

Tracy MCP does not grant shell access, domain administration, or access to an unrelated website. Read [Permissions & security](/mcp/permissions/) for the boundary.
