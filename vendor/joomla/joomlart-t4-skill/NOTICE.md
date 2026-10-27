# NOTICE — what this tree is made of, and under which licence

## Licence grant (26/10/2026)

JoomlArt (J.O.O.M Solutions Co., Ltd.) owns the T4 Framework, the `t4_bs5_blank` template, the shared
layer and this skill. On 26/10/2026 the copyright holder released them for publication in this
repository:

| Part | Licence |
|---|---|
| `assets/t4/t4-framework-for-joomla-6.zip` — the T4 Framework for Joomla (`plg_system_t4` v2.5.6) and `t4_bs5_blank`, inside a Joomla 6.1.1 distribution | **GPL-2.0-or-later** (`COPYING`) |
| `skills/joomlart-t4-template/assets/shared-layer/**` — PHP layouts, ACM modules, SCSS, JS for T4 templates | **GPL-2.0-or-later** (`COPYING`) |
| Skill documentation (`SKILL.md`, `references/`, `examples/`, root markdown), `agents/`, `.claude-plugin/`, `scripts/` | **MIT** (`LICENSE`) |

Copyright (C) 2004-2026 J.O.O.M Solutions Co., Ltd. (JoomlArt).

### About the headers inside the T4 zip

The zip is kept byte for byte as JoomlArt built it. Its archive comment and the per-file headers of the
T4 sources still read:

```
 * @license - Copyrighted Commercial Software
 * This file may not be redistributed in whole or significant part.
```

Those lines predate the grant above and are superseded by it: the copyright holder licenses every T4
file in this archive, as distributed from this repository, under GPL-2.0-or-later. The archive's own
`LICENSE.txt` (GPLv2) covers the bundled Joomla core.

## Also bundled

| Path | What | Licence |
|---|---|---|
| `assets/akeeba/pkg_akeebabackup-10.3.5-core.zip` | Akeeba Backup **Core** — used in Phase 10 to capture the quickstart `.jpa` | GPL-3.0-or-later, © Nicholas K. Dionysopoulos / Akeeba Ltd |
| `assets/akeeba/kickstart.php` | Akeeba Kickstart — the restorer shipped beside the `.jpa` | GPL-3.0-or-later, © Nicholas K. Dionysopoulos / Akeeba Ltd |
| Joomla core inside the T4 zip | Joomla! CMS 6.1.1 | GPL-2.0-or-later, © Open Source Matters, Inc. |

## Resolving T4 without the bundled zip

The skill also resolves T4 from the environment, so a fork may drop the zip:

1. `export JA_T4_ZIP=/path/to/t4-framework-for-joomla-6.zip`
2. drop the zip into `assets/t4/` locally
3. let Phase 0 download it from the JoomlArt member area using `JA_MEMBER_USER` /
   `JA_MEMBER_PASSWORD` from the environment

`references/provision.md` §1 documents all three.
