---
description: Ask the council (Codex gpt-6-astra) before settling a decision in a plan — when to ask, how to ask, and installing the claude-council plugin and Codex on a new machine.
sources:
  - CLAUDE.md
---

# Ask the council before settling a plan

The rule is in [`CLAUDE.md`](../../CLAUDE.md) §5. This file says **how to ask** and **how to install** on
a new machine. The plugin and accounts live on each person's machine, not in the repo: the repo only keeps the rule
and how to set it up.

## 1. When to ask

- A plan with **an architectural decision**, or a **choice between 2+ options**: ask **before settling it**.
- Do not ask for small fixes or questions with one clear answer.
- **Pre-approved** (Brian, PO, 03/10/2026): no need to ask the person you are working with for permission before asking.
  Skip the skill's questions about choosing providers, length, agent mode; use the defaults.

## 2. How to ask

- **Write the question in Vietnamese**, and ask for the answer in Vietnamese, so team members can read and
  join in. Code names, paths and interface words stay as they are.
- The council only reads the description, it cannot read your machine, so it believes every claim you make. Separate clearly
  **CHECKED** facts (say with what) from **NOT CHECKED** ones, labelled in the question's language; a wrong premise without a label yields an
  answer that agrees and is wrong.
- Report **Codex's view and your own side by side**, naming where they differ. Do not hand over only one conclusion.
- Call it through the skill `claude-council:ask` (the command `/claude-council:ask`), not the MCP tool
  `mcp__claude-council__ask`: that tool always makes the user click to confirm.

## 3. Installing on a new machine — done once

1. **The plugin**, in Claude Code:

   ```
   /plugin marketplace add hex/claude-marketplace
   /plugin install claude-council
   ```

2. **Codex CLI**, signed in with your ChatGPT account: `codex --version` must work.
   The council calls `codex exec` on the subscription plan; no API key needed.

3. **A separate Codex directory for the council**, to choose the model without touching the Codex you use every day:

   ```bash
   mkdir -p ~/.codex-council
ln -sf ~/.codex/auth.json ~/.codex-council/auth.json   # the account to use for the council
   printf 'model = "gpt-6-astra"\nmodel_reasoning_effort = "xhigh"\n' > ~/.codex-council/config.toml
   chmod 600 ~/.codex-council/config.toml
   ```

   Without this step the council runs the model and effort of `~/.codex/config.toml`, usually not
   `gpt-6-astra` / `xhigh`.

4. **Check**: it must print `codex	gpt-6-astra`.

   ```bash
   CODEX_HOME=~/.codex-council bash ~/.claude/plugins/cache/hex-plugins/claude-council/*/scripts/query-council.sh --list-default-models
   ```

5. **Tell the agent**: add one line to your machine's `~/.claude/CLAUDE.md`: every council run goes
   with the prefix `CODEX_HOME=~/.codex-council`. This is machine configuration, so it lives in your own file,
   not in the repo.

Each time you ask, read the model name at the top of the answer: it must be `gpt-6-astra`.

## 4. A machine without the council installed

State plainly in the plan that **the council was not asked**, and why. Do not write an answer yourself and call it the council's
view: readers of the plan would think a second perspective exists.
