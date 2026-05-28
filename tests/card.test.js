import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CARD_PATH = resolve(__dirname, '..', 'fork_u-house_card.js');
const HACS_PATH = resolve(__dirname, '..', 'hacs.json');
const PKG_PATH = resolve(__dirname, '..', 'package.json');

beforeAll(async () => {
  // The card is a plain script (not a module) that calls customElements.define
  // at load time. Evaluate it once into the jsdom global scope.
  const src = readFileSync(CARD_PATH, 'utf8');
  // eslint-disable-next-line no-new-func
  new Function(src).call(globalThis);
});

describe('custom element registration', () => {
  it('registers <fork-u-house-card>', () => {
    expect(customElements.get('fork-u-house-card')).toBeTypeOf('function');
  });

  it('can be constructed without throwing', () => {
    const el = document.createElement('fork-u-house-card');
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.shadowRoot).not.toBeNull();
  });
});

describe('getStubConfig', () => {
  it('returns an object with required fields', () => {
    const Ctor = customElements.get('fork-u-house-card');
    const stub = Ctor.getStubConfig();
    expect(stub).toBeTypeOf('object');
    expect(stub.weather_entity).toBeTypeOf('string');
    expect(Array.isArray(stub.rooms)).toBe(true);
    expect(stub.rooms.length).toBeGreaterThan(0);
  });
});

describe('setConfig', () => {
  it('accepts the stub config', () => {
    const el = document.createElement('fork-u-house-card');
    const Ctor = customElements.get('fork-u-house-card');
    expect(() => el.setConfig(Ctor.getStubConfig())).not.toThrow();
  });

  it('throws when rooms is missing', () => {
    const el = document.createElement('fork-u-house-card');
    expect(() => el.setConfig({})).toThrow(/rooms/);
  });

  it('throws when rooms is not an array', () => {
    const el = document.createElement('fork-u-house-card');
    expect(() => el.setConfig({ rooms: 'nope' })).toThrow(/rooms/);
  });
});

describe('hacs.json', () => {
  const hacs = JSON.parse(readFileSync(HACS_PATH, 'utf8'));

  it('declares the card filename that actually exists', () => {
    expect(hacs.filename).toBe('fork_u-house_card.js');
  });

  // HACS rejects unknown keys, so version must NOT live here.
  it('does not contain a version field (HACS forbids extra keys)', () => {
    expect(hacs.version).toBeUndefined();
  });
});

describe('package.json (release source of truth)', () => {
  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));

  it('has a semver version field', () => {
    expect(pkg.version).toBeTypeOf('string');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// --- Room icons + attribute resolution ---
// These exercise the new helpers directly on a constructed card so we don't
// need to drive a full render. Where possible we feed a stub _hass and let
// the render functions write to the shadow DOM, then assert on innerHTML.

function makeCard(states = {}) {
  const el = document.createElement('fork-u-house-card');
  el._hass = { states, themes: { darkMode: false } };
  return el;
}

describe('_resolveValue', () => {
  it('returns state when no attribute given', () => {
    const card = makeCard({ 'climate.living': { state: 'heat_cool', attributes: {} } });
    expect(card._resolveValue('climate.living')).toBe('heat_cool');
  });

  it('returns attribute value when attribute given', () => {
    const card = makeCard({
      'climate.living': { state: 'heat_cool', attributes: { current_temperature: 23.6, temperature: 21 } },
    });
    expect(card._resolveValue('climate.living', 'current_temperature')).toBe(23.6);
    expect(card._resolveValue('climate.living', 'temperature')).toBe(21);
  });

  it('returns null when entity missing', () => {
    const card = makeCard({});
    expect(card._resolveValue('climate.nope')).toBe(null);
    expect(card._resolveValue('climate.nope', 'current_temperature')).toBe(null);
  });

  it('returns null when attribute missing', () => {
    const card = makeCard({ 'climate.living': { state: 'heat', attributes: {} } });
    expect(card._resolveValue('climate.living', 'missing_attr')).toBe(null);
  });

  it('returns null on no hass', () => {
    const card = document.createElement('fork-u-house-card');
    expect(card._resolveValue('climate.anything')).toBe(null);
  });
});

describe('room badge — attribute as primary value', () => {
  it('reads numeric attribute for room value and median', () => {
    const card = makeCard({
      'climate.living': { state: 'heat', attributes: { current_temperature: 23.6 } },
      'climate.kitchen': { state: 'cool', attributes: { current_temperature: 21.0 } },
    });
    card.setConfig({
      rooms: [
        { name: 'Living', entity: 'climate.living', attribute: 'current_temperature', x: 50, y: 50 },
        { name: 'Kitchen', entity: 'climate.kitchen', attribute: 'current_temperature', x: 60, y: 60 },
      ],
    });

    // Drive a render so the shadow DOM has a badges-layer to write into.
    card.hass = card._hass;
    const html = card.shadowRoot.querySelector('.badges-layer')?.innerHTML ?? '';
    expect(html).toContain('Living');
    expect(html).toContain('23.6');
    expect(html).toContain('21.0');
  });
});

describe('room badge — icons array', () => {
  it('renders icon strip with mdi icon when entity present', () => {
    const card = makeCard({
      'sensor.t': { state: '22.0', attributes: {} },
      'climate.living': { state: 'heat_cool', attributes: {} },
    });
    card.setConfig({
      rooms: [{
        name: 'Living', entity: 'sensor.t', x: 50, y: 50,
        icons: [{
          entity: 'climate.living',
          icon: 'mdi:air-conditioner',
          states: { off: null, cool: '#22D3EE', heat_cool: '#A78BFA' },
        }],
      }],
    });
    card.hass = card._hass;
    const html = card.shadowRoot.querySelector('.badges-layer').innerHTML;
    expect(html).toContain('room-icon');
    expect(html).toContain('mdi:air-conditioner');
    expect(html).toContain('#A78BFA'); // colour mapped from heat_cool
    expect(html).not.toContain('room-icon-ghost');
  });

  it('ghosts the icon when state maps to null', () => {
    const card = makeCard({
      'sensor.t': { state: '22.0', attributes: {} },
      'climate.living': { state: 'off', attributes: {} },
    });
    card.setConfig({
      rooms: [{
        name: 'Living', entity: 'sensor.t', x: 50, y: 50,
        icons: [{
          entity: 'climate.living',
          icon: 'mdi:air-conditioner',
          states: { off: null, cool: '#22D3EE' },
        }],
      }],
    });
    card.hass = card._hass;
    const html = card.shadowRoot.querySelector('.badges-layer').innerHTML;
    expect(html).toContain('room-icon-ghost');
  });

  it('removes the icon when show_when does not match', () => {
    const card = makeCard({
      'sensor.t': { state: '22.0', attributes: {} },
      'light.lr': { state: 'off', attributes: {} },
    });
    card.setConfig({
      rooms: [{
        name: 'Living', entity: 'sensor.t', x: 50, y: 50,
        icons: [{
          entity: 'light.lr',
          icon: 'mdi:lightbulb',
          show_when: 'on',
          icon_color: '#FBBF24',
        }],
      }],
    });
    card.hass = card._hass;
    const html = card.shadowRoot.querySelector('.badges-layer').innerHTML;
    expect(html).not.toContain('mdi:lightbulb');
    expect(html).not.toContain('#FBBF24');
  });

  it('keeps the icon when show_when matches', () => {
    const card = makeCard({
      'sensor.t': { state: '22.0', attributes: {} },
      'light.lr': { state: 'on', attributes: {} },
    });
    card.setConfig({
      rooms: [{
        name: 'Living', entity: 'sensor.t', x: 50, y: 50,
        icons: [{
          entity: 'light.lr',
          icon: 'mdi:lightbulb',
          show_when: 'on',
          icon_color: '#FBBF24',
        }],
      }],
    });
    card.hass = card._hass;
    const html = card.shadowRoot.querySelector('.badges-layer').innerHTML;
    expect(html).toContain('mdi:lightbulb');
    expect(html).toContain('#FBBF24');
  });

  it('reads attribute on the icon entity for show_when', () => {
    const card = makeCard({
      'sensor.t': { state: '22.0', attributes: {} },
      'cover.zone': { state: 'open', attributes: { current_position: 20 } },
    });
    card.setConfig({
      rooms: [{
        name: 'Living', entity: 'sensor.t', x: 50, y: 50,
        icons: [{
          entity: 'cover.zone',
          attribute: 'current_position',
          icon: 'mdi:valve',
          show_when: { gt: 0 },
          icon_color: '#22D3EE',
        }],
      }],
    });
    card.hass = card._hass;
    expect(card.shadowRoot.querySelector('.badges-layer').innerHTML).toContain('mdi:valve');
  });

  it('emits no icon container when icons array is empty', () => {
    const card = makeCard({ 'sensor.t': { state: '22.0', attributes: {} } });
    card.setConfig({
      rooms: [{ name: 'Living', entity: 'sensor.t', x: 50, y: 50, icons: [] }],
    });
    card.hass = card._hass;
    expect(card.shadowRoot.querySelector('.badges-layer').innerHTML).not.toContain('room-icons');
  });
});

describe('room badge — setpoint (set_attribute)', () => {
  it('renders set_attribute alongside main value from same entity', () => {
    const card = makeCard({
      'climate.living': { state: 'heat', attributes: { current_temperature: 23.6, temperature: 21.0 } },
    });
    card.setConfig({
      rooms: [{
        name: 'Living', entity: 'climate.living',
        attribute: 'current_temperature', set_attribute: 'temperature',
        x: 50, y: 50,
      }],
    });
    card.hass = card._hass;
    const html = card.shadowRoot.querySelector('.badges-layer').innerHTML;
    expect(html).toContain('23.6');
    expect(html).toContain('badge-set');
    expect(html).toContain('21.0');
    expect(html).toContain('/ 21.0');
  });

  it('reads setpoint state from a separate set_entity (input_number)', () => {
    const card = makeCard({
      'sensor.t': { state: '23.0', attributes: {} },
      'input_number.target': { state: '20.5', attributes: {} },
    });
    card.setConfig({
      rooms: [{
        name: 'Lounge', entity: 'sensor.t',
        set_entity: 'input_number.target',
        x: 50, y: 50,
      }],
    });
    card.hass = card._hass;
    const html = card.shadowRoot.querySelector('.badges-layer').innerHTML;
    expect(html).toContain('badge-set');
    expect(html).toContain('/ 20.5');
  });

  it('omits setpoint when set_attribute resolves to non-numeric', () => {
    const card = makeCard({
      'climate.living': { state: 'heat', attributes: { current_temperature: 23.0, temperature: 'auto' } },
    });
    card.setConfig({
      rooms: [{
        name: 'Living', entity: 'climate.living',
        attribute: 'current_temperature', set_attribute: 'temperature',
        x: 50, y: 50,
      }],
    });
    card.hass = card._hass;
    const html = card.shadowRoot.querySelector('.badges-layer').innerHTML;
    expect(html).not.toContain('badge-set');
  });

  it('omits setpoint when set_attribute not configured', () => {
    const card = makeCard({
      'climate.living': { state: 'heat', attributes: { current_temperature: 23.6, temperature: 21.0 } },
    });
    card.setConfig({
      rooms: [{
        name: 'Living', entity: 'climate.living', attribute: 'current_temperature',
        x: 50, y: 50,
      }],
    });
    card.hass = card._hass;
    const html = card.shadowRoot.querySelector('.badges-layer').innerHTML;
    expect(html).not.toContain('badge-set');
  });
});

describe('room badge — edge anchoring', () => {
  it('applies badge-anchor-right when x > 70', () => {
    const card = makeCard({ 'sensor.t': { state: '22.0', attributes: {} } });
    card.setConfig({
      rooms: [{ name: 'Edge', entity: 'sensor.t', x: 85, y: 50 }],
    });
    card.hass = card._hass;
    const html = card.shadowRoot.querySelector('.badges-layer').innerHTML;
    expect(html).toContain('badge-anchor-right');
  });

  it('applies badge-anchor-left when x < 30', () => {
    const card = makeCard({ 'sensor.t': { state: '22.0', attributes: {} } });
    card.setConfig({
      rooms: [{ name: 'Edge', entity: 'sensor.t', x: 10, y: 50 }],
    });
    card.hass = card._hass;
    const html = card.shadowRoot.querySelector('.badges-layer').innerHTML;
    expect(html).toContain('badge-anchor-left');
  });

  it('uses default centre anchor when x is mid-range', () => {
    const card = makeCard({ 'sensor.t': { state: '22.0', attributes: {} } });
    card.setConfig({
      rooms: [{ name: 'Edge', entity: 'sensor.t', x: 50, y: 50 }],
    });
    card.hass = card._hass;
    const html = card.shadowRoot.querySelector('.badges-layer').innerHTML;
    expect(html).not.toContain('badge-anchor-right');
    expect(html).not.toContain('badge-anchor-left');
  });
});

describe('room badge — bg_opacity', () => {
  it('applies per-room bg_opacity as inline rgba style', () => {
    const card = makeCard({ 'sensor.t': { state: '22.0', attributes: {} } });
    card.setConfig({
      rooms: [{ name: 'Living', entity: 'sensor.t', x: 50, y: 50, bg_opacity: 0.3 }],
    });
    card.hass = card._hass;
    const html = card.shadowRoot.querySelector('.badges-layer').innerHTML;
    expect(html).toContain('rgba(20, 20, 25, 0.3)');
  });

  it('falls back to global room_bg_opacity when per-room not set', () => {
    const card = makeCard({ 'sensor.t': { state: '22.0', attributes: {} } });
    card.setConfig({
      room_bg_opacity: 0.5,
      rooms: [{ name: 'Living', entity: 'sensor.t', x: 50, y: 50 }],
    });
    card.hass = card._hass;
    expect(card.shadowRoot.querySelector('.badges-layer').innerHTML).toContain('rgba(20, 20, 25, 0.5)');
  });

  it('does not write inline bg when neither set (CSS default applies)', () => {
    const card = makeCard({ 'sensor.t': { state: '22.0', attributes: {} } });
    card.setConfig({
      rooms: [{ name: 'Living', entity: 'sensor.t', x: 50, y: 50 }],
    });
    card.hass = card._hass;
    const html = card.shadowRoot.querySelector('.badges-layer').innerHTML;
    expect(html).not.toMatch(/background: rgba\(20, 20, 25/);
  });
});
