/**
 * Optional integration with Dxcufgb's Debug Recorder (dxcufgbs-debug-recorder).
 *
 * The recorder is NOT a dependency: when it isn't installed or active, everything here does nothing and Death
 * Trigger Alerts works exactly as without it. When it is active, the module registers a snapshot of its runtime
 * state (debugSnapshot in death-trigger.js) and leaves breadcrumbs at its decision points while the GM records.
 *
 * Registration works whatever the load order: on the recorder's "dxcufgbs-debug-recorder.ready" hook, or at once
 * when its API already exists (checked at init and again at ready). It registers only once.
 *
 * Privacy: snapshot and breadcrumb data never contain names, free text, image paths or URLs (no actor, token,
 * item or feature names, no list entries, no file names); only counts, booleans, numbers, document types and this
 * module's own fixed ids and reason codes. A recorder error never reaches the module: every call is try/catch'ed.
 */

export const RECORDER_ID = "dxcufgbs-debug-recorder";

/** This module's id (set by registerDebugRecorder), the recorder's API once registered, and the snapshot. */
let moduleId = null;
let recorder = null;
let snapshotFn = null;
let hooked = false;

/** Problems the module ran into since the page loaded: code -> count (shown in the snapshot). */
const errorCounts = {};
let lastErrorCode = null;

function attach(api) {
  if (recorder || !moduleId || !snapshotFn || !api || typeof api.register !== "function") return;
  try {
    api.register(moduleId, { snapshot: safeSnapshot });
    recorder = api;
  } catch (err) {
    console.warn(`${moduleId} | could not register with ${RECORDER_ID}`, err);
  }
}

function safeSnapshot() {
  try {
    return snapshotFn();
  } catch (err) {
    console.warn(`${moduleId} | debug snapshot failed`, err);
    return { snapshotError: true };
  }
}

/** The recorder's API, when that module is active and has set it. */
function recorderApi() {
  try {
    return game.modules?.get(RECORDER_ID)?.api ?? null;
  } catch {
    return null;
  }
}

/**
 * Register with the recorder (call at init). Safe to call more than once; it registers a single time.
 * @param {string} id               this module's id (MODULE_ID)
 * @param {() => object} snapshot   returns plain JSON data describing the module's runtime state
 */
export function registerDebugRecorder(id, snapshot) {
  moduleId = id;
  snapshotFn = snapshot;
  if (!hooked) {
    hooked = true;
    Hooks.once(`${RECORDER_ID}.ready`, attach);
    // The recorder may have been ready before this module's init: try again once the world is ready
    Hooks.once("ready", () => attach(recorderApi()));
  }
  attach(recorderApi());
}

/**
 * Leave a breadcrumb while the recorder is recording; otherwise nothing happens.
 * @param {string} key    dot-namespaced, e.g. "alert.post"
 * @param {object|(() => object)} [data]  small flat object: counts, booleans, numbers, own ids. Never names or
 *                        free text. A function is only called while recording (for data that costs to build).
 */
export function crumb(key, data) {
  if (!recorder) return;
  try {
    if (recorder.isRecording?.() !== true) return;
    recorder.breadcrumb(moduleId, key, typeof data === "function" ? data() : data);
  } catch {
    // A recorder bug must never break the module
  }
}

/** Count a problem the module ran into (a fixed code, never a message). Kept for the snapshot. */
export function noteError(code) {
  errorCounts[code] = (errorCounts[code] ?? 0) + 1;
  lastErrorCode = code;
}

/** The problem counts for the snapshot. */
export function errorState() {
  return { counts: { ...errorCounts }, last: lastErrorCode };
}
