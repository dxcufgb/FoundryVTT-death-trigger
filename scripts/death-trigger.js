/**
 * Death Trigger Alerts (dxcufgbs-death-trigger)
 * Foundry VTT V13, system agnostic.
 *
 * When a (non-player) actor is reduced to 0 HP, scan its items for "death trigger"
 * features (Undead Fortitude, Death Burst, ...). If any are found, whisper the GM a
 * chat card with a sound and a button per feature to use it.
 *
 * Per-item override (optional), e.g. from a macro or the console:
 *   item.setFlag("dxcufgbs-death-trigger", "trigger", true)   // always a death trigger
 *   item.setFlag("dxcufgbs-death-trigger", "trigger", false)  // never a death trigger
 *
 * API: game.modules.get("dxcufgbs-death-trigger").api
 *   .findTriggers(actor)  -> Item[]
 *   .alert(actor)         -> posts the GM card for this actor (ignores HP)
 */

const MODULE_ID = "dxcufgbs-death-trigger";
const PREV_HP_KEY = "dxdtPrevHp";

const DEFAULT_KEYWORDS = [
  "Undead Fortitude",
  "Death Burst",
  "Death Throes",
  "Relentless",
  "Rejuvenation",
  "Death Explosion",
  "Explosive Death",
  "Fiery Death",
  "Death Curse",
  "Dying Curse",
  "Dying Breath",
  "Final Act",
  "Last Gasp",
  "Unstable Death"
].join(", ");

const DEFAULT_PHRASES = [
  "when it dies",
  "when it is reduced to 0 hit points",
  "is reduced to 0 hit points",
  "drops to 0 hit points",
  "reduces it to 0 hit points",
  "reduces the creature to 0 hit points"
].join(", ");

/** Actors (by uuid) that already got an alert while at 0 HP. Cleared when HP goes above 0. */
const alerted = new Set();

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

Hooks.once("init", () => {
  const reg = (key, data) => game.settings.register(MODULE_ID, key, {
    name: `DXDT.Settings.${key}.Name`,
    hint: `DXDT.Settings.${key}.Hint`,
    scope: "world",
    config: true,
    ...data
  });

  reg("Keywords", { type: String, default: DEFAULT_KEYWORDS });
  reg("ScanDescriptions", { type: Boolean, default: true });
  reg("Phrases", { type: String, default: DEFAULT_PHRASES });
  reg("HpPath", { type: String, default: "" });
  reg("IgnorePlayerOwned", { type: Boolean, default: true });
  reg("Sound", { type: String, default: "sounds/drums.wav", filePicker: "audio" });
  reg("Volume", {
    type: Number,
    default: 0.8,
    range: { min: 0, max: 1, step: 0.05 }
  });
});

Hooks.once("ready", () => {
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = { findTriggers, alert: postAlert, hpPathFor };
});

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

const getProp = (obj, path) => foundry.utils.getProperty(obj, path);

function splitList(str) {
  return String(str ?? "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

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

function itemDescription(item) {
  const d = item.system?.description;
  let text = "";
  if (typeof d === "string") text = d;
  else if (d && typeof d.value === "string") text = d.value;
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").toLowerCase();
}

/** Find all items on the actor that count as death triggers. */
function findTriggers(actor) {
  if (!actor?.items) return [];
  const keywords = splitList(game.settings.get(MODULE_ID, "Keywords"));
  const scanDesc = game.settings.get(MODULE_ID, "ScanDescriptions");
  const phrases = scanDesc ? splitList(game.settings.get(MODULE_ID, "Phrases")) : [];

  return actor.items.filter(item => {
    const flag = item.getFlag(MODULE_ID, "trigger");
    if (flag === true) return true;
    if (flag === false) return false;

    const name = item.name?.toLowerCase() ?? "";
    if (keywords.some(k => name.includes(k))) return true;

    if (phrases.length) {
      const desc = itemDescription(item);
      if (desc && phrases.some(p => desc.includes(p))) return true;
    }
    return false;
  });
}

/** Only one client (the active GM) handles detection. */
function isResponsibleGM() {
  return game.user.isGM && (game.users.activeGM?.isSelf ?? true);
}

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

  html.querySelectorAll("button.dxdt-use, button.dxdt-open").forEach(btn => {
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
