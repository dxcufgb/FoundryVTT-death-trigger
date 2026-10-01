# Death Trigger Alerts

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
- The card has a **Use** button for each matching feature (in dnd5e this is the same as using it from the sheet) and a button to open the feature's sheet.
- Only alerts once per "death"; if the creature is healed and drops again, it alerts again.
- System agnostic: reads HP from the system's main token bar (or a path you set). Tested with dnd5e 5.2.5.

## The Death Trigger list

A feature counts as a death trigger when its name is in the world's **Death Trigger list**.

- The module ships a default list in `data/death-triggers.json`: monster features such as *Undead Fortitude* and *Death Burst*, plus D&D 5E (2014) and 5.5E (2024) class features, feats, species traits, spells and magic items that trigger on death or at 0 HP.
- The first time a GM opens a world with this version, the list is copied into that world. From then on each world has its own copy, and changes in one world don't affect others. Names typed into the old *Death trigger feature names* setting are carried over.
- Names are matched ignoring case, apostrophe style and text in parentheses, so *Great Weapon Master* matches the entry *Great Weapon Master (Hew)*. Monster entries match anywhere in the name, so *Undead Fortitude (1/Day)* still counts.

### Adding and removing features

Right-click an item in the **Items** sidebar, in an Item **compendium**, or on a **dnd5e actor sheet** (features, spells, inventory) and choose:

- **Add to Death Trigger list** when the item isn't in the list, or
- **Remove from Death Trigger list** when it is.

These options are only shown to the GM.

### Exporting and importing

**Module settings → Export Death Trigger list** downloads the world's current list as `death-triggers-<world>.json`.

**Module settings → Import Death Trigger list** lets you pick an exported file and use it in this world. Before anything changes, the GM is warned that the world's current list will be replaced permanently and that this can't be undone, and is asked to confirm. **Yes** replaces the list; **No** closes the dialog and leaves the list as it was. Export the current list first if you might want it back.

From a macro: `game.modules.get("dxcufgbs-death-trigger").api` has `getList()`, `isListed(name)`, `addToList(item)`, `removeFromList(name)`, `exportList()`, `importList()` and `resetList()` (back to the default list).

## Settings

- **Export Death Trigger list** / **Import Death Trigger list**: see above.
- **HP attribute path**: leave empty to use the system default (dnd5e: `attributes.hp.value`).
- **Only check non-player creatures**, **Alert sound**, **Alert volume**.

## Excluding features

There are three ways to stop a feature from triggering the alert:

- **On the alert card:** click the ban button next to the feature and choose
  - **Only this creature** (this token),
  - **All {creature} creatures** (the actor in the sidebar, so every token made from it), or
  - **Remove "…" from the Death Trigger list**.
- **On the feature's sheet** (GM only): the **Death trigger** button in the sheet's header (in the ⋮ menu on dnd5e sheets) lets you choose *Automatic* (follow the list), *Always a death trigger* or *Never a death trigger*. Choose *Automatic* to undo an exclusion.
- **With the context menu:** *Remove from Death Trigger list*.

A feature set to *Always* or *Never* on its own sheet ignores the list.

From a macro: `item.setFlag("dxcufgbs-death-trigger", "trigger", false)` (never), `true` (always), or `item.unsetFlag("dxcufgbs-death-trigger", "trigger")` (automatic).

## License

[MIT](LICENSE)
