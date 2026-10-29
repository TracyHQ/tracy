# Joomla contract validation fixture

This is test code from **TracyHQ/claude-cowork**, commit
`4241abd9f426ea2c5995f8933a85a6057199738d`, under GPL-2.0 (see `LICENSE.txt`).
`source.json` contains the original PHP bytes, with SHA-256 fingerprints:

- `QuickstartContract.php`: `checkValue`, `checkDerivedLink`, `imagePath`, `currentValue`, `changeRow`.
- Complete `SlotFit.php`, `ContentSlots.php`, `IdentityTokens.php`, `ContractProblem.php`.

`validate.php` loads those bytes and calls the original methods through reflection.
It supplies only a temporary media library and record state. No validation rules are translated to JavaScript.
The class shell deliberately models quickstarts, not imported-site derived slots, and needs PHP CLI with DOM and mbstring.
The normal CI test job uses `tracy-check`; `.github/workflows/tracy-ci.yml` documents PHP in that runner image.
A missing interpreter or extension fails the test instead of bypassing validation.

`_apply-door.mjs` enables validation centrally after a Joomla inspect. It seeds record bodies from the release's
presentation lock, then remembers successful record writes, content reads, contract writes and media uploads.
New synthetic contracts can supply `contractRows` and base64 `contractFiles` as fixture data in the helper's second argument.
If a partial double never supplies a record column, its binding cannot be checked; scalar and picture checks still run.
Only tests deliberately exercising a refusal should supply `contractRefusals: []` and assert on the collected errors.
By default an `afterEach` assertion fails even when engine code catches or ignores the refusal.

The adapter covers value validation and HTML/JSON binding. Revision locks, language-copy creation, trusted empty-link
layout hashes and Joomla database writes remain the responsibility of existing doubles and plugin integration tests.

Run the focused checks:

```sh
node --test apps/tracy-web/test/joomla-plugin-validator.test.mjs apps/tracy-web/test/joomla-plugin-parity.test.mjs apps/tracy-web/test/joomla-contract-double.test.mjs
```

The parity test discovers a sibling `claude-cowork` checkout, or uses `CLAUDE_COWORK_DIR` when set. It compares the
original bytes and executes fixture cases against both copies. Without that checkout, only those two upstream
comparisons skip; the pinned PHP rules and refusal-code inventory still run on CI.
When updating the plugin fixture, refresh the listed original classes/methods, source commit and fingerprints together,
review the refusal-code inventory, then run both parity checks. Never manually edit a rule inside `source.json`.
