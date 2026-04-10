import { describe, it, expect } from 'vitest';
import { loadCard, haState } from './test-utils.js';

// Quick probe: does _render() survive in jsdom? If yes, we unlock Tier 3
// (asserting the results of _updateBadges / _updateAlerts / _updateBins by
// inspecting shadowRoot innerHTML).

describe('_render() smoke test', () => {
  it('can call _render() without throwing', () => {
    loadCard();
    const el = document.createElement('fork-u-house-card');
    el._hass = { states: {} };
    el._config = {
      rooms: [{ name: 'Lounge', entity: 'sensor.lounge', x: 50, y: 50, weight: 1 }],
    };
    el._lang = 'en';
    el._editMode = false;
    expect(() => el._render()).not.toThrow();
  });

  it('produces the expected layer containers in shadowRoot', () => {
    loadCard();
    const el = document.createElement('fork-u-house-card');
    el._hass = { states: {} };
    el._config = {
      rooms: [{ name: 'Lounge', entity: 'sensor.lounge', x: 50, y: 50, weight: 1 }],
    };
    el._lang = 'en';
    el._editMode = false;
    el._render();

    const sr = el.shadowRoot;
    expect(sr.querySelector('.card')).not.toBeNull();
    expect(sr.querySelector('.badges-layer')).not.toBeNull();
    expect(sr.querySelector('.alerts-layer')).not.toBeNull();
    expect(sr.querySelector('.bins-layer')).not.toBeNull();
  });

  it('setConfig() → _render() pipeline works end-to-end', () => {
    const Ctor = loadCard();
    const el = document.createElement('fork-u-house-card');
    el._hass = { states: {} };
    expect(() => el.setConfig(Ctor.getStubConfig())).not.toThrow();
    expect(el.shadowRoot.querySelector('.card')).not.toBeNull();
  });
});
