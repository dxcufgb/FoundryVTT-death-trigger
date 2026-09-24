# Death Trigger Alerts

System-agnostic helper that alerts the GM with a whispered chat card and a sound when an NPC with a death-triggered feature (Undead Fortitude, Death Burst, Death Throes, ...) is reduced to 0 HP, with a button to use that feature.

**Foundry VTT:** v13

## Installation

In Foundry: **Add-on Modules → Install Module**, paste this link into **Manifest URL** at the bottom, and click **Install**:

```
https://github.com/Dxcufgb/dxcufgbs-death-trigger/releases/latest/download/module.json
```

## Features

Alerts the GM when a creature with a **death-triggered feature** is reduced to 0 HP, such as
*Undead Fortitude* (zombies), *Death Burst* (mephits), *Death Throes*, *Relentless* or *Rejuvenation*.

- The GM gets a whispered chat card: **"{creature} got reduced to 0 HP, remember the death trigger!"**, with a sound.
- The card has a **Use** button for each matching feature (in dnd5e this is the same as using it from the sheet) and a button to open the feature's sheet.
- Only alerts once per "death"; if the creature is healed and drops again, it alerts again.
- System agnostic: reads HP from the system's main token bar (or a path you set). Tested with dnd5e 5.2.5.

## Settings

- **Death trigger feature names**: comma-separated names to look for (matched anywhere in the item name).
- **Also scan feature descriptions** / **Description phrases**: also match features whose description contains phrases such as "when it dies".
- **HP attribute path**: leave empty to use the system default (dnd5e: `attributes.hp.value`).
- **Only check non-player creatures**, **Alert sound**, **Alert volume**.

To force a specific item on or off: `item.setFlag("dxcufgbs-death-trigger", "trigger", true)` (or `false`).

## Releasing a new version (maintainer notes)

1. Commit and push your changes.
2. On GitHub, open **Releases → Draft a new release**, create a new tag such as `v1.0.1`, and click **Publish release**.
3. The **Release module** GitHub Action sets the version from the tag, fills in the download links, builds `module.zip`, and attaches `module.json` and `module.zip` to the release.

Foundry installs and updates from the latest release, so users get the new version the next time they check for updates.

## License

[MIT](LICENSE)
