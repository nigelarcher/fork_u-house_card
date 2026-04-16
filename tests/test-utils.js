import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CARD_PATH = resolve(__dirname, '..', 'fork_u-house_card.js');

// Load the card source once per test file (vitest isolates modules per file).
// The card calls customElements.define() at load time, so we evaluate it into
// the jsdom global scope rather than importing it.
let loaded = false;
export function loadCard() {
  if (!loaded) {
    const src = readFileSync(CARD_PATH, 'utf8');
    // eslint-disable-next-line no-new-func
    new Function(src).call(globalThis);
    loaded = true;
  }
  return customElements.get('fork-u-house-card');
}

// Shortcut: get the class prototype for calling methods directly without
// instantiating the custom element (useful for pure methods).
export function getProto() {
  return loadCard().prototype;
}

// Build a minimally-populated card instance with _config and _hass set
// directly (bypassing setConfig / the real HA lifecycle) for methods that
// need instance state but not a mounted DOM.
export function makeCard({ config = {}, states = {} } = {}) {
  const Ctor = loadCard();
  const el = document.createElement('fork-u-house-card');
  el._config = config;
  el._hass = { states };
  el._lang = config.language || 'en';
  return el;
}

// Helper to build an HA state entry the way `_hass.states[id]` would look.
export function haState(state, attributes = {}) {
  return { state: String(state), attributes };
}

// Like makeCard() but also runs _render() so shadowRoot contains the layout.
// Use this when you need to exercise _updateBadges / _updateAlerts / etc.
// and assert on what they wrote into the shadow DOM.
export function mountCard({ config = {}, states = {}, editMode = false } = {}) {
  const el = makeCard({ config, states });
  el._editMode = editMode;
  el._editModeChecked = true; // skip _updateData's edit-mode walk
  el._render();
  return el;
}
