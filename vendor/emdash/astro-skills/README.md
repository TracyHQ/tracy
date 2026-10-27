# Astro Skills

Free agent skills for the Astro + Tailwind CSS stack, by
[Michael Andreuzza](https://michaelandreuzza.com) at
[Lexington Themes](https://lexingtonthemes.com), built on the conventions
behind 100+ production Astro themes.

Skills are plain-Markdown instructions that AI coding agents (Cursor, Claude
Code, Codex, and others) load on demand. These ones teach the stack: how to
structure, style, and ship Astro + Tailwind projects following the official
docs and hard-won conventions. No design systems, no theme content, just the
mechanics, free to use anywhere.

## Install

With the [skills](https://skills.sh) CLI, for any supported agent:

```bash
npx skills add lexington-themes/astro-skills
```

Or manually: copy a skill folder into your project's skills directory
(`.cursor/skills/` for Cursor, `.claude/skills/` for Claude Code).

## Skills

| Skill | What it teaches |
| --- | --- |
| [`astro-tailwind-best-practices`](./skills/astro-tailwind-best-practices) | Project structure, components-first workflow, styling discipline, fonts via Astro's Fonts API, image handling that never crops by accident. |
| [`astro-seo`](./skills/astro-seo) | Canonical URLs, meta and Open Graph tags, sitemaps and robots.txt, JSON-LD structured data that matches the visible page. |
| [`astro-content-collections`](./skills/astro-content-collections) | Zod schemas, the glob loader, `image()` fields, draft workflows, explicit sorting, and safe schema changes. |

## Principles

- **Grounded in the official docs.** Recommendations either follow
  [docs.astro.build](https://docs.astro.build) (linked inline) or are labeled
  as field conventions on top of them.
- **Constraints over adjectives.** Every rule is checkable.
- **Read before you install.** That goes for these skills and any others:
  a skill is instructions your agent follows with your permissions.

## License

MIT
