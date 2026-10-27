---
name: tracy-file-links
description: >-
  Use whenever a reply names a file in the workspace, one just made, changed or found: write it as a
  link the side panel opens, never as a code span.
triggers:
  - "vừa tạo file"
  - "đã lưu ở"
  - "ảnh chụp ở"
  - "xem file"
  - "mở file"
  - "screenshot"
  - "kết quả nằm ở"
---

# tracy-file-links

A path in a reply is an invitation. Written the wrong way, that invitation opens nothing.

## Why this skill exists

Measured on 02/09/2026: the agent listed 22 screenshots as code spans — `…/menu/footer-375.png`
— then told the user *"these are for you to look at"*. Not one of them was clickable. The user
answered with exactly one sentence: *"you print them out but don't give me a link to open the file,
so how am I supposed to look at them"*.

The sidebar already has everything needed to open them. Exactly one thing was missing: **how they
are written**.

## Rule

**Mentioning a file in the workspace → write a markdown link pointing at the ABSOLUTE PATH.**

```markdown
[footer-375.png](/site/mysite/TracyWork/agents/crawl-tracy/screens/menu/footer-375.png)
```

Not `` `footer-375.png` ``. Not a relative path. Not "the file is in the screens/menu folder".

**The display name is for the reader, the path is for the machine.** In a list of twenty images the
display name is `footer-375.png`, not the whole long path — but the part in parentheses is always
the full absolute path.

## What the sidebar can open

| Kind | Extension | Opens as |
|---|---|---|
| Image | `png` `jpg` `jpeg` `gif` `webp` `svg` `bmp` `ico` `avif` | shown directly |
| PDF | `pdf` | shown directly |
| Markdown | `md` `markdown` | edit/view |
| HTML | `html` `htm` | page view |
| **Every other text file** | `json` `ts` `js` `css` `py` `sh` `yml` `log` … | code viewer |
| Office | `doc` `xls` `ppt` | download button only |

In other words: **almost every file opens**, so almost every mention of a file should be a link.
`audit.json` too — it is not an image, but it opens.

## When NOT to write a link

Three cases, and the second is about safety, not looks:

1. **The file does not exist yet.** About to create it, or just said you will — then it does not
   exist yet. A dead link is worse than plain text, because the user cannot tell "not done yet" from
   "broken".
2. **The file is outside the workspace.** Lane configuration, environment variables, keys, anything
   under `/desk-home` — **never**. They are outside the scope of the work, and a link is an
   invitation to click. Naming a config file when explaining something is fine; making it openable
   is not.
3. **A path you are not sure of.** Without an `ls` you do not know it is real. Guessing a path and
   wrapping it in a link builds a door that opens onto a wall.

## Opening it for the user — sparingly

There is a way to open a tab yourself instead of waiting for a click. It is for the **one** most
important file, right after it is created.

Twenty images opening twenty tabs is worse than opening none: the user loses their place and has to
close each one. **The default is a link, so the person chooses.** Open it yourself only when there
is exactly one thing to look at right away and you have just said "done, look at this".

## Check before sending

Does the reply name any file? If so, is each one a link? If not, and the reason is not one of the
three cases above — that is an omission, not a choice.
