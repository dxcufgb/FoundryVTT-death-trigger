# Dxcufgb's Death Trigger Alerts

FoundryVTT v13 module (id `dxcufgbs-death-trigger`, the install folder must have the same name). When a non-player
creature drops to 0 HP and has a death-triggered feature (Undead Fortitude, Death Burst, ...), the GM gets a whispered
chat card with a sound and a Use / Open / Exclude button per feature. System agnostic. Each world keeps its own copy of
the Death Trigger list. No build step and no npm dependencies.

## Layout
- `scripts/death-trigger.js` – everything: settings and the Export/Import settings menus, the world's list
  (`ensureList`, `mergeNewDefaults`, `addToList`, `removeFromList`, `validateImport`, `importListFlow`, `resetList`),
  name matching (`normalizeName`, `withoutParens`, `entryMatches`), `triggerStatus` / `findTriggers`, the context-menu
  entries, the item sheet header button (`configureItem`), HP detection (`preUpdateActor` / `updateActor` /
  `updateToken` → `checkActor`), the alert card (`postAlert`), its sound and buttons, `useItem`, and the module API
  (`game.modules.get("dxcufgbs-death-trigger").api`).
- `data/death-triggers.json` – the default list shipped with the module (`version`, `triggerTypes`, `features`; new
  entries carry `listVersion`). Copied into each world on first GM start.
- `styles/death-trigger.css` – the card and dialogs. `lang/en.json` – all strings (`DXDT.*`).
- `.github/workflows/ci.yml` / `release.yml` – thin callers of `dxcufgb/foundry-module-ci` (checks, packaging,
  release); identical in every module, do not edit them here. `claude.yml` – the Claude review.

## Conventions
- `MODULE_ID` must equal `id` in `module.json`; CI checks it.
- Every visible setting (`config: true`) and settings menu needs a Name and Hint in `lang/en.json`; CI checks it.
- Settings are all `world` scope. The list lives in the hidden `TriggerList` setting (`config: false`, type Object);
  `listCache` must be reset whenever it changes (`saveList` and the setting's `onChange` do this).
- Hook handlers catch and `console.error` their errors; a failure must never break the actor update.
- Update `README.md` when behaviour, settings or the API change.

## Review focus
- **One client acts**: detection (`checkActor`) and list setup/merge (`ensureList`, `mergeNewDefaults`) run only where
  `isResponsibleGM()` is true (`game.user.isGM && game.users.activeGM?.isSelf`). Any new code that creates messages or
  writes settings/flags from a hook must use the same guard, or every connected GM posts it. The once-per-"death"
  memory (`alerted`) is in memory on that client only; the previous HP travels in the update options
  (`dxdtPrevHp`, set in `preUpdateActor` on the client that makes the update).
- **Nothing reaches players**: the card is created with `whisper` = every GM user and its flags (`alert`, `actorUuid`,
  `itemUuids`) live only on that whispered message. Never add a public message, a speaker that names the creature
  for players, or flags on public documents that reveal a feature. The sound (`createChatMessage`) plays only on GM
  clients; card buttons are disabled for non-GMs. Note: the **Use** button runs the system's own `item.use()` (its
  roll mode applies), and the generic fallback in `useItem` posts the description as a normal (public) message.
- **GM-only writes**: list changes, import/export/reset, `configureItem` and the context-menu entries check
  `game.user.isGM`; the settings menus are `restricted: true`. Keep those checks on any new entry point.
- **Escaping**: names from items, actors, tokens and imported files go into HTML through `escapeHTML` (card, dialogs,
  `statusText`). Flag any new interpolation of a name, image path or file name without it.
- **List data contract**: `validateImport` must keep rejecting files without a `features` array or with an unnamed
  entry. `mergeNewDefaults` must only add entries whose `listVersion` is newer than the world's `version` and must not
  re-add one the GM removed: a new default entry needs `listVersion` = the new list `version`, and that `version`
  must be raised. Changing an existing entry's `id`, `name` or `match` changes matching in every world.
- **Matching**: `exact` ignores case, apostrophe style and text in parentheses; `contains` matches anywhere. Removing a
  name drops exact matches first and only then broad `contains` entries; keep that order.
- **System agnostic**: HP comes from the `HpPath` setting or `game.system.primaryTokenAttribute`; dnd5e-only hooks
  (`dnd5e.getItemContextOptions`) are optional extras. Nothing may throw on a system without them.
