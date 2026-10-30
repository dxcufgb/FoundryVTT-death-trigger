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

Requirements and the first start: see [Installation](https://github.com/dxcufgb/FoundryVTT-death-trigger/wiki/Installation) in the wiki.

## Documentation

The full guide is in the [wiki](https://github.com/dxcufgb/FoundryVTT-death-trigger/wiki):

- [The Alert Card](https://github.com/dxcufgb/FoundryVTT-death-trigger/wiki/The-Alert-Card): what the GM gets when a creature drops to 0 HP.
- [The Death Trigger List](https://github.com/dxcufgb/FoundryVTT-death-trigger/wiki/The-Death-Trigger-List): which features count; adding, removing, exporting and importing.
- [Excluding Features](https://github.com/dxcufgb/FoundryVTT-death-trigger/wiki/Excluding-Features): stop a feature from triggering the alert.
- [Settings](https://github.com/dxcufgb/FoundryVTT-death-trigger/wiki/Settings): every option.
- [API](https://github.com/dxcufgb/FoundryVTT-death-trigger/wiki/API): for macros and other modules.
- [Troubleshooting](https://github.com/dxcufgb/FoundryVTT-death-trigger/wiki/Troubleshooting): common problems.

## License

[MIT](LICENSE)

## Releasing

For the maintainer: **Actions → Release module → Run workflow**, type the version (for example `1.2.3`) and run it. The module is checked and packaged first; only then is the release `v1.2.3` published with `module.json` and `module.zip`. CI and releases come from [dxcufgb/foundry-module-ci](https://github.com/dxcufgb/foundry-module-ci), the same for every module.
