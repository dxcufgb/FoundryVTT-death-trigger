/**
 * Death Trigger Alerts (dxcufgbs-death-trigger)
 * Foundry VTT V13, system agnostic.
 *
 * When a (non-player) actor is reduced to 0 HP, scan its items for "death trigger"
 * features (Undead Fortitude, Death Burst, ...). If any are found, whisper the GM a
 * chat card with a sound and a button per feature to use it.
 *
 * What counts as a death trigger:
 *   - Each world keeps its own copy of the Death Trigger list (a world setting). It is filled
 *     from data/death-triggers.json the first time a GM opens the world with this version.
 *   - An item is a death trigger when its name matches an entry in that list.
 *   - Right-click an item (Items sidebar, compendiums, dnd5e actor sheets) and choose
 *     "Add to Death Trigger list" / "Remove from Death Trigger list".
 *   - Module settings -> "Export Death Trigger list" downloads the world's list as JSON.
 *   - Module settings -> "Import Death Trigger list" replaces the world's list with an exported file
 *     (after warning the GM that this can't be undone).
 *
 * Per-item overrides still win over the list:
 *   - the "Death trigger" button in an item sheet's header (GM only): Automatic / Always / Never
 *   - the ban button on the alert card: never for this creature, this actor, or remove the name from the list
 *   - from a macro or the console:
 *       item.setFlag("dxcufgbs-death-trigger", "trigger", true)   // always a death trigger
 *       item.setFlag("dxcufgbs-death-trigger", "trigger", false)  // never a death trigger
 *       item.unsetFlag("dxcufgbs-death-trigger", "trigger")       // back to automatic (the list)
 *
 * API: game.modules.get("dxcufgbs-death-trigger").api
 *   .findTriggers(actor)       -> Item[]
 *   .alert(actor)              -> posts the GM card for this actor (ignores HP)
 *   .triggerStatus(item)       -> { trigger, reason, detail }
 *   .getList()                 -> the world's list ({ version, triggerTypes, features })
 *   .isListed(nameOrItem)      -> boolean
 *   .addToList(item)           -> adds the item's name to the world's list
 *   .removeFromList(nameOrItem)-> removes the entries matching that name
 *   .exportList()              -> downloads the world's list as JSON
 *   .importList()              -> pick an exported JSON file and (after a yes/no warning) replace the world's list
 *   .resetList()               -> replaces the world's list with the module's default list
 *   .configureItem(item)       -> opens the Automatic / Always / Never dialog
 */

const MODULE_ID = "dxcufgbs-death-trigger";
const PREV_HP_KEY = "dxdtPrevHp";
const LIST_KEY = "TriggerList";
const DEFAULT_LIST_PATH = `modules/${MODULE_ID}/data/death-triggers.json`;

/** Actors (by uuid) that already got an alert while at 0 HP. Cleared when HP goes above 0. */
const alerted = new Set();

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

/** Settings menu entry: clicking the button downloads the list instead of opening a window. */
class ExportListMenu extends foundry.applications.api.ApplicationV2 {
  async render() {
    exportList();
    return this;
  }
}

/** Settings menu entry: clicking the button starts the import instead of opening a window. */
class ImportListMenu extends foundry.applications.api.ApplicationV2 {
  async render() {
    importListFlow();
    return this;
  }
}

Hooks.once("init", () => {
  const reg = (key, data) => game.settings.register(MODULE_ID, key, {
    name: `DXDT.Settings.${key}.Name`,
    hint: `DXDT.Settings.${key}.Hint`,
    scope: "world",
    config: true,
    ...data
  });

  // The world's own copy of the Death Trigger list.
  game.settings.register(MODULE_ID, LIST_KEY, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => { listCache = null; }
  });

  game.settings.registerMenu(MODULE_ID, "ExportList", {
    name: "DXDT.Settings.ExportList.Name",
    label: "DXDT.Settings.ExportList.Label",
    hint: "DXDT.Settings.ExportList.Hint",
    icon: "fa-solid fa-file-export",
    type: ExportListMenu,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "ImportList", {
    name: "DXDT.Settings.ImportList.Name",
    label: "DXDT.Settings.ImportList.Label",
    hint: "DXDT.Settings.ImportList.Hint",
    icon: "fa-solid fa-file-import",
    type: ImportListMenu,
    restricted: true
  });

  reg("HpPath", { type: String, default: "" });
  reg("IgnorePlayerOwned", { type: Boolean, default: true });
  reg("Sound", { type: String, default: "sounds/drums.wav", filePicker: "audio" });
  reg("Volume", {
    type: Number,
    default: 0.8,
    range: { min: 0, max: 1, step: 0.05 }
  });
});

Hooks.once("ready", async () => {
  const mod = game.modules.get(MODULE_ID);
  if (mod) {
    mod.api = {
      findTriggers, alert: postAlert, hpPathFor, triggerStatus, configureItem,
      getList, isListed, addToList, removeFromList, exportList, importList: importListFlow, resetList
    };
  }
  try {
    await ensureList();
  } catch (err) {
    console.error(`${MODULE_ID} | ensureList`, err);
  }
});

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

const getProp = (obj, path) => foundry.utils.getProperty(obj, path);

function escapeHTML(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Path inside actor.system that holds the current HP number.
 * Uses the setting if given, otherwise the system's primary token attribute.
 */
function hpPathFor(actor) {
  const custom = game.settings.get(MODULE_ID, "HpPath")?.trim();
  if (custom) return custom.replace(/^system\./, "");

  const attr = game.system.primaryTokenAttribute || "attributes.hp";
  const val = getProp(actor.system, attr);
  if (val && typeof val === "object" && "value" in val) return `${attr}.value`;
  return attr;
}

function getHp(actor) {
  const v = Number(getProp(actor.system, hpPathFor(actor)));
  return Number.isFinite(v) ? v : null;
}

/** Only one client (the active GM) handles detection and list setup. */
function isResponsibleGM() {
  return game.user.isGM && (game.users.activeGM?.isSelf ?? true);
}

/* -------------------------------------------- */
/*  The Death Trigger list                      */
/* -------------------------------------------- */

/** Compiled entries for fast matching. Reset whenever the list setting changes. */
let listCache = null;

/** The world's list, or null if it hasn't been set up yet. */
function getList() {
  const data = game.settings.get(MODULE_ID, LIST_KEY);
  return data && Array.isArray(data.features) ? data : null;
}

/** Lower case, one apostrophe style, single spaces. */
function normalizeName(str) {
  return String(str ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Great Weapon Master (Hew)" -> "great weapon master". */
function withoutParens(str) {
  return str.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function compileEntry(entry) {
  const aliases = Array.isArray(entry?.aliases) ? entry.aliases : [];
  const names = [entry?.name, ...aliases].map(normalizeName).filter(Boolean);
  return {
    entry,
    names,
    bases: names.map(withoutParens),
    contains: entry?.match === "contains"
  };
}

/**
 * Does an item name match a compiled entry?
 * "exact": same name, ignoring case, apostrophe style and text in parentheses on either side.
 * "contains": the entry's name appears anywhere in the item's name.
 */
function entryMatches(compiled, itemName) {
  const name = normalizeName(itemName);
  if (!name) return false;
  if (compiled.contains) return compiled.bases.some(b => b && name.includes(b));
  const base = withoutParens(name);
  return compiled.names.some((n, i) => {
    const b = compiled.bases[i];
    return name === n || name === b || (base && (base === n || base === b));
  });
}

function compiledList() {
  listCache ??= (getList()?.features ?? []).map(compileEntry);
  return listCache;
}

const nameOf = nameOrItem => typeof nameOrItem === "string" ? nameOrItem : nameOrItem?.name;

/** All list entries that match this name. */
function findEntries(nameOrItem) {
  const name = nameOf(nameOrItem);
  return compiledList().filter(c => entryMatches(c, name)).map(c => c.entry);
}

function isListed(nameOrItem) {
  const name = nameOf(nameOrItem);
  return compiledList().some(c => entryMatches(c, name));
}

async function saveList(data) {
  await game.settings.set(MODULE_ID, LIST_KEY, data);
  listCache = null;
}

/** The default list shipped with the module. */
async function loadDefaultList() {
  try {
    const res = await fetch(foundry.utils.getRoute(DEFAULT_LIST_PATH), { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data?.features)) throw new Error("no features array");
    return data;
  } catch (err) {
    console.error(`${MODULE_ID} | could not load ${DEFAULT_LIST_PATH}`, err);
    ui.notifications.error(game.i18n.localize("DXDT.Notify.ListLoadFailed"));
    return null;
  }
}

/** Feature names the GM typed into the old "Death trigger feature names" setting (before 1.2.0). */
function legacyKeywords() {
  try {
    const setting = game.settings.storage.get("world")?.getSetting?.(`${MODULE_ID}.Keywords`);
    if (!setting) return [];
    let value = setting.value;
    try { value = JSON.parse(value); } catch { /* already plain text */ }
    return String(value ?? "").split(",").map(s => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function customEntry(name, { item = null, match = "exact", source = "custom" } = {}) {
  const slug = (name.slugify?.({ strict: true }) || "item").slice(0, 40);
  const actor = item?.actor ?? null;
  return {
    id: `custom-${slug}-${foundry.utils.randomID(4)}`,
    name: name.trim(),
    type: "custom",
    owner: actor?.name ?? null,
    level: null,
    edition: "custom",
    source,
    trigger: "custom",
    filter: null,
    rangeFt: null,
    action: null,
    limit: null,
    effect: "",
    match,
    itemType: item?.type ?? null,
    addedFrom: item?.uuid ?? null
  };
}

/** First run in a world: copy the default list into the world (plus any old custom keywords). */
async function ensureList() {
  if (getList() || !isResponsibleGM()) return;
  const data = await loadDefaultList();
  if (!data) return;

  const known = data.features.map(compileEntry);
  for (const keyword of legacyKeywords()) {
    if (known.some(c => entryMatches(c, keyword))) continue;
    const entry = customEntry(keyword, { match: "contains", source: "Old feature names setting" });
    data.features.push(entry);
    known.push(compileEntry(entry));
  }
  data.triggerTypes ??= {};
  data.triggerTypes.custom ??= "Added by the GM from an item's context menu";

  await saveList(data);
  ui.notifications.info(game.i18n.format("DXDT.Notify.ListCreated", { count: data.features.length }));
}

/** Add an item (or anything with a name) to the world's list. */
async function addToList(item) {
  if (!game.user.isGM) return false;
  const name = String(nameOf(item) ?? "").trim();
  if (!name || isListed(name)) return false;

  const data = foundry.utils.deepClone(getList()) ?? await loadDefaultList() ?? { version: 1, triggerTypes: {}, features: [] };
  data.triggerTypes ??= {};
  data.triggerTypes.custom ??= "Added by the GM from an item's context menu";
  data.features.push(customEntry(name, { item: typeof item === "string" ? null : item }));

  await saveList(data);
  ui.notifications.info(game.i18n.format("DXDT.Notify.Added", { item: name }));
  return true;
}

/**
 * Remove this name from the world's list.
 * Entries that match the name exactly go first. Only when there are none are the broad
 * "contains" entries removed, so removing "Relentless Rage" doesn't also drop the monster
 * entry "Relentless" (that takes a second Remove).
 */
async function removeFromList(nameOrItem) {
  if (!game.user.isGM) return false;
  const name = nameOf(nameOrItem);
  const current = getList();
  if (!name || !current) return false;

  const data = foundry.utils.deepClone(current);
  const before = data.features.length;
  const matching = data.features.map(compileEntry).filter(c => entryMatches(c, name));
  const exact = matching.filter(c => !c.contains);
  const doomed = new Set((exact.length ? exact : matching).map(c => c.entry.id ?? c.entry));
  data.features = data.features.filter(entry => !doomed.has(entry.id ?? entry));
  if (data.features.length === before) return false;

  await saveList(data);
  ui.notifications.info(game.i18n.format("DXDT.Notify.Removed", { item: name, count: before - data.features.length }));
  return true;
}

/** Download the world's list as a JSON file. */
function exportList() {
  if (!game.user.isGM) return;
  const data = getList();
  if (!data) {
    ui.notifications.warn(game.i18n.localize("DXDT.Notify.NoList"));
    return;
  }
  const file = `death-triggers-${game.world.id}.json`;
  foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "application/json", file);
  ui.notifications.info(game.i18n.format("DXDT.Notify.Exported", { file, count: data.features.length }));
}

/**
 * Check an imported file and return a clean list, or throw with a message for the GM.
 * Accepts the format Export writes: { version, triggerTypes, features: [{ name, ... }] }.
 */
function validateImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(game.i18n.localize("DXDT.Import.NotJson"));
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.features)) {
    throw new Error(game.i18n.localize("DXDT.Import.NoFeatures"));
  }
  const bad = data.features.findIndex(f => !f || typeof f !== "object" || typeof f.name !== "string" || !f.name.trim());
  if (bad !== -1) {
    throw new Error(game.i18n.format("DXDT.Import.BadEntry", { index: bad + 1 }));
  }
  data.triggerTypes = data.triggerTypes && typeof data.triggerTypes === "object" ? data.triggerTypes : {};
  data.triggerTypes.custom ??= "Added by the GM from an item's context menu";
  return data;
}

/** Step 1: pick a file. Returns { name, text } or null if cancelled. */
async function pickImportFile() {
  const fmt = (key, data = {}) => game.i18n.format(`DXDT.Import.${key}`, data);
  return DialogV2().wait({
    window: { title: fmt("Title"), icon: "fa-solid fa-file-import" },
    content: `
      <div class="dxdt-import">
        <p>${fmt("Choose")}</p>
        <div class="form-group">
          <input type="file" name="file" accept=".json,application/json">
        </div>
      </div>`,
    rejectClose: false,
    buttons: [
      {
        action: "next",
        label: fmt("Next"),
        icon: "fa-solid fa-arrow-right",
        default: true,
        callback: async (event, button) => {
          const file = button.form.elements.file.files?.[0];
          if (!file) {
            ui.notifications.warn(fmt("NoFile"));
            return null;
          }
          return { name: file.name, text: await foundry.utils.readTextFromFile(file) };
        }
      },
      { action: "cancel", label: game.i18n.localize("Cancel"), icon: "fa-solid fa-xmark" }
    ]
  });
}

/**
 * Settings -> Import Death Trigger list.
 * Pick a file, check it, then warn that the world's list will be replaced for good.
 * "Yes" replaces the list; "No" (or closing the dialog) does nothing.
 */
async function importListFlow() {
  if (!game.user.isGM) return false;
  const fmt = (key, data = {}) => game.i18n.format(`DXDT.Import.${key}`, data);

  const picked = await pickImportFile();
  if (!picked || typeof picked !== "object") return false;

  let data;
  try {
    data = validateImport(picked.text);
  } catch (err) {
    ui.notifications.error(fmt("Failed", { error: err.message }));
    return false;
  }

  const currentCount = getList()?.features.length ?? 0;
  const answer = await DialogV2().wait({
    window: { title: fmt("ConfirmTitle"), icon: "fa-solid fa-triangle-exclamation" },
    content: `
      <div class="dxdt-import-warning">
        <p>${fmt("Warning", { file: escapeHTML(picked.name), count: data.features.length, current: currentCount })}</p>
        <p><strong>${fmt("Irreversible")}</strong></p>
        <p>${fmt("Question")}</p>
      </div>`,
    classes: ["dxdt-import-dialog"],
    rejectClose: false,
    buttons: [
      { action: "yes", label: fmt("Yes"), icon: "fa-solid fa-check" },
      { action: "no", label: fmt("No"), icon: "fa-solid fa-xmark", default: true }
    ]
  });
  if (answer !== "yes") return false;

  await saveList(data);
  ui.notifications.info(fmt("Done", { file: picked.name, count: data.features.length }));
  return true;
}

/** Replace the world's list with the module's default list. */
async function resetList() {
  if (!game.user.isGM) return false;
  const data = await loadDefaultList();
  if (!data) return false;
  await saveList(data);
  ui.notifications.info(game.i18n.format("DXDT.Notify.ListCreated", { count: data.features.length }));
  return true;
}

/* -------------------------------------------- */
/*  Matching                                    */
/* -------------------------------------------- */

/**
 * Does this item count as a death trigger, and why?
 * The item's own setting (Always / Never) wins, then the world's Death Trigger list.
 * @returns {{trigger: boolean, reason: string, detail?: string}}
 *   reason: "always" | "never" | "list" | "none"
 */
function triggerStatus(item) {
  const flag = item.getFlag?.(MODULE_ID, "trigger");
  if (flag === true) return { trigger: true, reason: "always" };
  if (flag === false) return { trigger: false, reason: "never" };

  const entry = findEntries(item.name)[0];
  if (entry) return { trigger: true, reason: "list", detail: entry.name };
  return { trigger: false, reason: "none" };
}

/** Find all items on the actor that count as death triggers. */
function findTriggers(actor) {
  if (!actor?.items) return [];
  return actor.items.filter(item => triggerStatus(item).trigger);
}

/* -------------------------------------------- */
/*  Context menus: Add / Remove                 */
/* -------------------------------------------- */

const MENU_ADD = "DXDT.Context.Add";
const MENU_REMOVE = "DXDT.Context.Remove";

/** The clicked element, whether the menu hands us an HTMLElement (V13) or jQuery (older). */
const elementOf = li => (li?.dataset ? li : li?.[0]) ?? null;

/**
 * Builds the two menu entries.
 * @param {(li) => ({name: string, get: () => Promise<Item|null>} | null)} resolve
 */
function listMenuOptions(resolve) {
  const target = li => {
    try {
      return resolve(li);
    } catch {
      return null;
    }
  };
  return [
    {
      name: MENU_ADD,
      icon: '<i class="fa-solid fa-skull"></i>',
      condition: li => {
        const t = game.user.isGM && target(li);
        return !!t?.name && !isListed(t.name);
      },
      callback: async li => {
        const t = target(li);
        if (!t) return;
        const item = await t.get?.().catch?.(() => null) ?? null;
        await addToList(item ?? t.name);
      }
    },
    {
      name: MENU_REMOVE,
      icon: '<i class="fa-solid fa-skull-crossbones"></i>',
      condition: li => {
        const t = game.user.isGM && target(li);
        return !!t?.name && isListed(t.name);
      },
      callback: async li => {
        const t = target(li);
        if (t) await removeFromList(t.name);
      }
    }
  ];
}

function addMenuOptions(options, resolve) {
  if (!Array.isArray(options) || options.some(o => o?.name === MENU_ADD)) return;
  options.push(...listMenuOptions(resolve));
}

/** Items sidebar and Item compendiums. */
function resolveDirectoryEntry(app, li) {
  const el = elementOf(li);
  if (!el?.dataset) return null;
  const id = el.dataset.entryId ?? el.dataset.documentId ?? el.dataset.itemId;
  const collection = app?.collection;

  // Compendium pack: the index has the name, the document loads on demand.
  if (id && collection?.metadata && collection.documentName === "Item") {
    const entry = collection.index?.get(id);
    return entry ? { name: entry.name, get: () => collection.getDocument(id) } : null;
  }

  // World Items.
  if (id && (collection?.documentName === "Item" || app?.documentName === "Item")) {
    const item = game.items.get(id);
    return item ? { name: item.name, get: async () => item } : null;
  }

  // Anything else that carries a uuid.
  const uuid = el.dataset.uuid ?? el.closest?.("[data-uuid]")?.dataset.uuid;
  const doc = uuid ? fromUuidSync(uuid) : null;
  if (doc?.documentName !== "Item" && !(doc instanceof Item)) return null;
  return { name: doc.name, get: async () => (doc instanceof Item ? doc : fromUuid(uuid)) };
}

// V13 fires get<DocumentName>ContextOptions; older names are kept as a fallback.
// addMenuOptions skips menus that already have the entries, so overlapping hooks are harmless.
for (const hook of [
  "getItemContextOptions",
  "getItemDirectoryEntryContext",
  "getCompendiumEntryContext",
  "getCompendiumContextOptions"
]) {
  Hooks.on(hook, (app, options) => addMenuOptions(options, li => resolveDirectoryEntry(app, li)));
}

// Items on dnd5e actor sheets (inventory, features, spells).
Hooks.on("dnd5e.getItemContextOptions", (item, options) => {
  if (!(item instanceof Item)) return;
  addMenuOptions(options, () => ({ name: item.name, get: async () => item }));
});

/* -------------------------------------------- */
/*  Item sheet dialog and alert card exclusion  */
/* -------------------------------------------- */

const DialogV2 = () => foundry.applications.api.DialogV2;

function statusText(status) {
  return game.i18n.format(`DXDT.Status.${status.reason}`, { detail: escapeHTML(status.detail ?? "") });
}

/** Item sheet dialog: Automatic / Always / Never for this item. */
async function configureItem(item) {
  if (!game.user.isGM || !item) return;
  const flag = item.getFlag(MODULE_ID, "trigger");
  const current = flag === true ? "always" : flag === false ? "never" : "auto";

  // What would the list say?
  const auto = triggerStatus({ name: item.name });

  const opt = (value, key) =>
    `<option value="${value}" ${value === current ? "selected" : ""}>${game.i18n.localize(`DXDT.Item.${key}`)}</option>`;

  const content = `
    <div class="dxdt-config">
      <p>${game.i18n.format("DXDT.Item.Intro", { item: escapeHTML(item.name) })}</p>
      <div class="form-group">
        <label for="dxdt-mode">${game.i18n.localize("DXDT.Item.Mode")}</label>
        <select id="dxdt-mode" name="mode">
          ${opt("auto", "Auto")}
          ${opt("always", "Always")}
          ${opt("never", "Never")}
        </select>
      </div>
      <p class="hint">${game.i18n.localize("DXDT.Item.AutoResult")} ${statusText(auto)}</p>
    </div>`;

  const mode = await DialogV2().wait({
    window: { title: game.i18n.localize("DXDT.Item.Title"), icon: "fa-solid fa-skull" },
    content,
    rejectClose: false,
    buttons: [
      {
        action: "save",
        label: game.i18n.localize("DXDT.Item.Save"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => button.form.elements.mode.value
      },
      { action: "cancel", label: game.i18n.localize("Cancel"), icon: "fa-solid fa-xmark" }
    ]
  });
  if (!mode || mode === "cancel" || mode === current) return;

  if (mode === "auto") await item.unsetFlag(MODULE_ID, "trigger");
  else await item.setFlag(MODULE_ID, "trigger", mode === "always");
  ui.notifications.info(game.i18n.format(`DXDT.Notify.Set.${mode}`, { item: item.name }));
}

/** Alert card ban button: choose where the feature should no longer trigger. */
async function excludeFromCard(item) {
  const actor = item.actor;
  const baseActor = actor?.isToken ? game.actors.get(actor.id) : null;
  const baseItem = baseActor?.items.get(item.id) ?? null;

  const fmt = (key, data = {}) => game.i18n.format(`DXDT.Exclude.${key}`, data);
  const buttons = [];
  if (actor?.isToken) {
    buttons.push({ action: "token", label: fmt("Token"), icon: "fa-solid fa-user" });
  }
  if (!actor?.isToken || baseItem) {
    buttons.push({
      action: "actor",
      label: fmt("Actor", { actor: (baseActor ?? actor)?.name ?? "" }),
      icon: "fa-solid fa-users"
    });
  }
  if (isListed(item.name)) {
    buttons.push({ action: "name", label: fmt("Name", { item: item.name }), icon: "fa-solid fa-globe" });
  }
  buttons.push({ action: "cancel", label: game.i18n.localize("Cancel"), icon: "fa-solid fa-xmark", default: true });

  const choice = await DialogV2().wait({
    window: { title: fmt("Title"), icon: "fa-solid fa-ban" },
    content: `<p>${fmt("Question", { item: escapeHTML(item.name) })}</p>
              <p class="hint">${fmt("Hint")}</p>`,
    classes: ["dxdt-exclude-dialog"],
    rejectClose: false,
    buttons
  });
  if (!choice || choice === "cancel") return false;

  if (choice === "token") await item.setFlag(MODULE_ID, "trigger", false);
  else if (choice === "actor") await (baseItem ?? item).setFlag(MODULE_ID, "trigger", false);
  else if (choice === "name") await removeFromList(item.name);
  if (choice !== "name") {
    ui.notifications.info(fmt(`Done.${choice}`, { item: item.name, actor: (baseActor ?? actor)?.name ?? "" }));
  }
  return true;
}

// Header button on item sheets (ApplicationV2 sheets, e.g. dnd5e 5.x).
Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
  const item = app.document;
  if (!game.user.isGM || !(item instanceof Item)) return;
  if (controls.some(c => c.action === "dxdtConfigure")) return;
  app.options.actions ??= {};
  app.options.actions.dxdtConfigure = function () { configureItem(this.document); };
  controls.push({
    action: "dxdtConfigure",
    icon: "fa-solid fa-skull",
    label: game.i18n.localize("DXDT.Item.Title")
  });
});

// Header button on older (Application V1) item sheets.
Hooks.on("getItemSheetHeaderButtons", (app, buttons) => {
  if (!game.user.isGM || !(app.document instanceof Item)) return;
  buttons.unshift({
    label: game.i18n.localize("DXDT.Item.Short"),
    class: "dxdt-configure",
    icon: "fa-solid fa-skull",
    onclick: () => configureItem(app.document)
  });
});

/* -------------------------------------------- */
/*  HP change detection                         */
/* -------------------------------------------- */

// Remember the HP before the update (runs on the client that makes the update).
// The value travels with the update options to all clients.
Hooks.on("preUpdateActor", (actor, changes, options) => {
  try {
    const path = `system.${hpPathFor(actor)}`;
    if (!foundry.utils.hasProperty(changes, path)) return;
    options[PREV_HP_KEY] = getHp(actor);
  } catch (err) {
    console.error(`${MODULE_ID} | preUpdateActor`, err);
  }
});

Hooks.on("updateActor", (actor, changes, options) => {
  try {
    checkActor(actor, changes, options);
  } catch (err) {
    console.error(`${MODULE_ID} | updateActor`, err);
  }
});

// Fallback for unlinked tokens in case the actor hook doesn't fire for synthetic actors.
Hooks.on("updateToken", (tokenDoc, changes, options) => {
  try {
    if (tokenDoc.actorLink || !changes.delta?.system || !tokenDoc.actor) return;
    const path = `system.${hpPathFor(tokenDoc.actor)}`;
    if (!foundry.utils.hasProperty({ system: changes.delta.system }, path)) return;
    checkActor(tokenDoc.actor, { system: changes.delta.system }, options);
  } catch (err) {
    console.error(`${MODULE_ID} | updateToken`, err);
  }
});

function checkActor(actor, changes, options) {
  if (!isResponsibleGM() || !actor) return;

  const path = `system.${hpPathFor(actor)}`;
  if (!foundry.utils.hasProperty(changes, path)) return;

  const hp = getHp(actor);
  if (hp === null) return;

  const key = actor.uuid;
  if (hp > 0) {
    alerted.delete(key);
    return;
  }

  // Already at 0 before this update? Then it's not a new "death".
  const prev = options?.[PREV_HP_KEY];
  if (typeof prev === "number" && prev <= 0) return;
  if (alerted.has(key)) return;

  if (game.settings.get(MODULE_ID, "IgnorePlayerOwned") && actor.hasPlayerOwner) return;

  const triggers = findTriggers(actor);
  if (!triggers.length) return;

  alerted.add(key);
  postAlert(actor, triggers);
}

/* -------------------------------------------- */
/*  Chat card                                   */
/* -------------------------------------------- */

async function postAlert(actor, triggers) {
  triggers ??= findTriggers(actor);
  if (!actor || !triggers.length) return null;

  const name = actor.token?.name ?? actor.getActiveTokens?.()[0]?.name ?? actor.name;
  const img = actor.token?.texture?.src ?? actor.img;

  const buttons = triggers.map(item => `
    <div class="dxdt-trigger">
      <button type="button" class="dxdt-use" data-item-uuid="${item.uuid}">
        <img src="${escapeHTML(item.img)}" alt="">
        <span>${escapeHTML(game.i18n.format("DXDT.Chat.Use", { item: item.name }))}</span>
      </button>
      <button type="button" class="dxdt-open" data-item-uuid="${item.uuid}"
              data-tooltip="${escapeHTML(game.i18n.localize("DXDT.Chat.Open"))}">
        <i class="fa-solid fa-book-open"></i>
      </button>
      <button type="button" class="dxdt-exclude" data-item-uuid="${item.uuid}"
              data-tooltip="${escapeHTML(game.i18n.localize("DXDT.Chat.Exclude"))}">
        <i class="fa-solid fa-ban"></i>
      </button>
    </div>`).join("");

  const content = `
    <div class="dxdt-card">
      <div class="dxdt-header">
        <img src="${escapeHTML(img)}" alt="">
        <h3 class="dxdt-title"><i class="fa-solid fa-skull"></i> ${game.i18n.localize("DXDT.Chat.Title")}</h3>
      </div>
      <p class="dxdt-text">${game.i18n.format("DXDT.Chat.Message", { name: escapeHTML(name) })}</p>
      ${buttons}
    </div>`;

  return ChatMessage.implementation.create({
    content,
    speaker: { alias: game.i18n.localize("DXDT.Chat.Title") },
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
    flags: {
      [MODULE_ID]: {
        alert: true,
        actorUuid: actor.uuid,
        itemUuids: triggers.map(i => i.uuid)
      }
    }
  });
}

// Play the sound for every GM when the alert arrives.
Hooks.on("createChatMessage", message => {
  if (!game.user.isGM || !message.getFlag(MODULE_ID, "alert")) return;
  const src = game.settings.get(MODULE_ID, "Sound");
  if (!src) return;
  const volume = game.settings.get(MODULE_ID, "Volume");
  foundry.audio.AudioHelper.play({ src, volume, autoplay: true, loop: false }, false);
});

// Wire up the buttons.
Hooks.on("renderChatMessageHTML", (message, html) => {
  if (!message.getFlag(MODULE_ID, "alert")) return;

  html.querySelectorAll("button.dxdt-use, button.dxdt-open, button.dxdt-exclude").forEach(btn => {
    if (!game.user.isGM) {
      btn.disabled = true;
      return;
    }
    btn.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const item = await fromUuid(btn.dataset.itemUuid);
      if (!item) {
        ui.notifications.warn(game.i18n.localize("DXDT.Notify.ItemMissing"));
        return;
      }
      if (btn.classList.contains("dxdt-open")) {
        item.sheet?.render(true);
        return;
      }
      if (btn.classList.contains("dxdt-exclude")) {
        if (await excludeFromCard(item)) btn.closest(".dxdt-trigger")?.classList.add("dxdt-excluded");
        return;
      }
      btn.disabled = true;
      try {
        await useItem(item);
      } finally {
        btn.disabled = false;
      }
    });
  });
});

/** Use an item in whatever way the current system supports. */
async function useItem(item) {
  if (typeof item.use === "function") return item.use();          // dnd5e and many others
  if (typeof item.roll === "function") return item.roll();        // older / other systems
  if (typeof item.toChat === "function") return item.toChat();
  if (typeof item.toMessage === "function") return item.toMessage();
  if (typeof item.displayCard === "function") return item.displayCard();

  // Generic fallback: post the description to chat.
  const TextEditorImpl = foundry.applications.ux.TextEditor.implementation;
  const raw = typeof item.system?.description === "string"
    ? item.system.description
    : item.system?.description?.value ?? "";
  const enriched = await TextEditorImpl.enrichHTML(raw, { relativeTo: item, rollData: item.getRollData?.() });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: item.actor }),
    content: `<h3>${escapeHTML(item.name)}</h3>${enriched}`
  });
  ui.notifications.info(game.i18n.format("DXDT.Notify.Posted", { item: item.name }));
}
