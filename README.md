# Death Trigger Alerts

[![Foundry v13](https://img.shields.io/github/v/release/dxcufgb/FoundryVTT-death-trigger?label=Foundry%20v13&logo=foundryvirtualtabletop&color=ff6400)](https://github.com/dxcufgb/FoundryVTT-death-trigger/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/dxcufgb/FoundryVTT-death-trigger/module.zip?label=downloads&color=blue)](https://github.com/dxcufgb/FoundryVTT-death-trigger/releases)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-support-FF5E5B?logo=kofi&logoColor=white)](https://ko-fi.com/dxcufgb)\
[![CI](https://img.shields.io/github/actions/workflow/status/dxcufgb/FoundryVTT-death-trigger/ci.yml?branch=main&label=CI)](https://github.com/dxcufgb/FoundryVTT-death-trigger/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/dxcufgb/FoundryVTT-death-trigger)](LICENSE)

<a href="https://dxcufgb.github.io/FVTT-dev-showcase/"><img src="https://dxcufgb.github.io/FVTT-dev-showcase/assets/img/workshop-badge.png" alt="Dxcufgb's Workshop: every Foundry VTT project, video and changelog in one place" width="650"></a>

System-agnostic helper that alerts the GM with a whispered chat card and a sound when an NPC with a death-triggered feature (Undead Fortitude, Death Burst, Death Throes, ...) is reduced to 0 HP, with a button to use that feature.

**Foundry VTT:** v13

## Installation

In Foundry: **Add-on Modules → Install Module**, paste this link into **Manifest URL** at the bottom, and click **Install**:

```
https://github.com/dxcufgb/FoundryVTT-death-trigger/releases/latest/download/module.json
```

## Features

Alerts the GM when a creature with a **death-triggered feature** is reduced to 0 HP, such as
*Undead Fortitude* (zombies), *Death Burst* (mephits), *Death Throes*, *Relentless* or *Rejuvenation*.

- The GM gets a whispered chat card: **"{creature} got reduced to 0 HP, remember the death trigger!"**, with a sound.
- The card has a **Use** button for each matching feature (in dnd5e this is the same as using it from the sheet) and a button to open the feature's sheet. On a system where items can't be used, **Use** posts the feature's description to chat as a normal (not whispered) message.
- Only alerts once per "death"; if the creature is healed and drops again, it alerts again.
- System agnostic: reads HP from the system's main token bar (or a path you set). Tested with dnd5e 5.2.5.

## The Death Trigger list

A feature counts as a death trigger when its name is in the world's **Death Trigger list**.

- The module ships a default list in `data/death-triggers.json`: monster features such as *Undead Fortitude* and *Death Burst*, plus D&D 5E (2014) and 5.5E (2024) class features, feats, species traits, spells and magic items that trigger on death or at 0 HP.
- The first time a GM opens a world with this version, the list is copied into that world. From then on each world has its own copy, and changes in one world don't affect others. Names typed into the old *Death trigger feature names* setting are carried over.
- When a module update adds new entries to the default list, they are added to every world's copy the next time a GM opens it (the GM gets a notification naming them). Each new entry is only added once: if you remove it, it stays removed. Entries you already have, or added yourself under the same name, aren't duplicated.
- Names are matched ignoring case, apostrophe style and text in parentheses, so *Great Weapon Master* matches the entry *Great Weapon Master (Hew)*. Monster entries match anywhere in the name, so *Undead Fortitude (1/Day)* still counts.

### Adding and removing features

Right-click an item in the **Items** sidebar, in an Item **compendium**, or on a **dnd5e actor sheet** (features, spells, inventory) and choose:

- **Add to Death Trigger list** when the item isn't in the list, or
- **Remove from Death Trigger list** when it is.

These options are only shown to the GM.

**Remove** first drops the entries that match the name exactly. Only when there are none does it drop a broad monster entry that matches anywhere in the name, so removing *Relentless Rage* keeps the monster entry *Relentless* (a second **Remove** drops that one too).

### Exporting and importing

**Module settings → Export Death Trigger list** downloads the world's current list as `death-triggers-<world id>.json`.

**Module settings → Import Death Trigger list** lets you pick an exported file and use it in this world. Before anything changes, the GM is warned that the world's current list will be replaced permanently and that this can't be undone, and is asked to confirm. **Yes** replaces the list; **No** closes the dialog and leaves the list as it was. Export the current list first if you might want it back.

From a macro: see [API](#api) (`exportList()`, `importList()`, `resetList()` and the rest).

## Settings

- **Export Death Trigger list** / **Import Death Trigger list**: see above.
- **HP attribute path**: path inside `actor.system` to the current HP. Leave empty to use the system's main token bar (dnd5e: `attributes.hp.value`).
- **Only check non-player creatures** (on by default): skip actors that have a player owner (player characters, companions).
- **Alert sound** (default `sounds/drums.wav`): played for the GMs when the card is posted. Leave empty for no sound.
- **Alert volume** (0 - 1, default 0.8).

All settings are world settings (the same for everyone in the world).

## Excluding features

There are three ways to stop a feature from triggering the alert:

- **On the alert card:** click the ban button next to the feature and choose
  - **Only this creature** (this token; shown for unlinked tokens),
  - **All {creature} creatures** (the actor in the sidebar, so every token made from it), or
  - **Remove "…" from the Death Trigger list**.
- **On the feature's sheet** (GM only): the **Death trigger** button in the sheet's header (in the ⋮ menu on dnd5e sheets) lets you choose *Automatic* (follow the list), *Always a death trigger* or *Never a death trigger*. Choose *Automatic* to undo an exclusion.
- **With the context menu:** *Remove from Death Trigger list*.

A feature set to *Always* or *Never* on its own sheet ignores the list.

From a macro: `item.setFlag("dxcufgbs-death-trigger", "trigger", false)` (never), `true` (always), or `item.unsetFlag("dxcufgbs-death-trigger", "trigger")` (automatic).

## API

```js
const api = game.modules.get("dxcufgbs-death-trigger").api;

api.findTriggers(actor);            // the actor's items that count as death triggers → Item[]
await api.alert(actor);             // posts the GM alert card for this actor now, whatever its HP → the ChatMessage, or null if it has no death triggers
api.triggerStatus(item);            // → { trigger, reason, detail }; reason: "always" | "never" | "list" | "none"
api.hpPathFor(actor);               // the HP path inside actor.system the module watches, e.g. "attributes.hp.value"

api.getList();                      // the world's list ({ version, triggerTypes, features }), or null before it is set up
api.isListed("Undead Fortitude");   // a name or an item → true / false
await api.addToList(item);          // GM: adds the item (or a name) to the list → true if it was added
await api.removeFromList(item);     // GM: removes the entries matching that name or item (see Remove above) → true if any were removed
api.exportList();                   // GM: downloads the list as death-triggers-<world id>.json
await api.importList();             // GM: opens the file picker and the Yes/No warning → true if the list was replaced
await api.resetList();              // GM: replaces the world's list with the default list, without asking → true when done
await api.configureItem(item);      // GM: opens the Automatic / Always / Never dialog for this item
```

- `alert(actor, triggers)` takes an optional array of items to show on the card (default: `findTriggers(actor)`). It doesn't check HP, the **Only check non-player creatures** setting or whether the creature was already alerted. Any user can call it; the card is always whispered to the GMs.
- GM calls do nothing for players (they return `false`, or nothing for `exportList` and `configureItem`). `addToList` also returns `false` when the name is already in the list. List changes show a notification.
- `triggerStatus(item)`: the item's own *Always* / *Never* setting wins, then the list. When `reason` is `"list"`, `detail` is the name of the matching list entry.

**From another module**

The API is set in the module's `ready` hook, so it isn't there during `init` or `setup`, and depending on load order it may not be there yet when your own `ready` runs. Look it up when you need it, and make it optional:

```js
function deathTriggers(actor) {
  const api = game.modules.get("dxcufgbs-death-trigger")?.api;   // undefined when the module is missing or not enabled
  return api ? api.findTriggers(actor) : [];
}
```

Add `{ "id": "dxcufgbs-death-trigger", "type": "module" }` to `relationships.recommends` in your `module.json`.

The module calls no hooks of its own. To react to an alert, watch for its chat card. It is whispered to the GMs, so it only reaches GM clients:

```js
Hooks.on("createChatMessage", async message => {
  if (!message.getFlag("dxcufgbs-death-trigger", "alert")) return;
  const actor = await fromUuid(message.getFlag("dxcufgbs-death-trigger", "actorUuid"));
  const itemUuids = message.getFlag("dxcufgbs-death-trigger", "itemUuids");   // the features on the card
  console.log(`${actor?.name} dropped to 0 HP with ${itemUuids.length} death trigger(s)`);
});
```

**Data**

- `flags.dxcufgbs-death-trigger.trigger` on Items: `true` (always a death trigger), `false` (never), unset (follow the list). See [Excluding features](#excluding-features).
- `flags.dxcufgbs-death-trigger` on the alert card: `alert: true`, `actorUuid` (the creature) and `itemUuids` (the features on the card).
- The list (what `getList()` returns, what Export writes and Import reads): `{ "version", "triggerTypes", "features" }`, where `version` is the list version (2 for the current default list) and `triggerTypes` names the trigger types. Each feature needs a `name`; `match` is `"exact"` (the default) or `"contains"`, and `aliases` is an optional array of other names that match too. `id` identifies the entry; the other fields (`type`, `owner`, `edition`, `source`, `trigger`, `effect`, …) only describe it. Import refuses a file without a `features` array or with an entry that has no name. In the module's default list, entries added after the first version carry `listVersion`.

## License

[MIT](LICENSE)

## Releasing

For the maintainer: **Actions → Release module → Run workflow**, type the version (for example `1.2.3`) and run it. The module is checked and packaged first; only then is the release `v1.2.3` published with `module.json` and `module.zip`. CI and releases come from [dxcufgb/foundry-module-ci](https://github.com/dxcufgb/foundry-module-ci), the same for every module.
