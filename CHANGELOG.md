# Changelog

## Unreleased

- Optional integration with Dxcufgb's Debug Recorder (`dxcufgbs-debug-recorder`): while the GM records, Death Trigger Alerts adds a snapshot of its runtime state (list version and entry counts, which client is the responsible GM, detection outcome counts, error counts) and breadcrumbs for HP detection outcomes, alerts, card buttons and list changes. Only counts, booleans, document types and the module's own codes are recorded, never names, texts, paths or URLs. Without the recorder nothing changes.
